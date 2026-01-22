import { getFilteredOperations } from "./operation";
import {
  IStatement,
  IData,
  OperationType,
  Context,
  DataValue,
  DataType,
  ProjectFile,
} from "./types";
import {
  getStatementResult,
  isDataOfType,
  inferTypeFromValue,
  createContextVariables,
  createStatement,
  createData,
  createOperationFromFile,
  createFileFromOperation,
  createFileVariables,
  applyTypeNarrowing,
  getOperationResultType,
  updateContextWithNarrowedTypes,
  getSkipExecution,
  resolveParameters,
} from "./utils";
import isEqual from "react-fast-compare";

function updateOperationCalls(
  statement: IStatement,
  context: Context
): IData<OperationType>[] {
  return statement.operations.reduce(
    (acc, operation, operationIndex) => {
      const updatedStatement = { ...statement, operations: acc.operations };
      const data = getStatementResult(
        updatedStatement,
        context.getResult,
        operationIndex,
        true
      );
      /* Type narrowing and finding operation is needed for updating parameters especially of user-defined operations */
      acc.narrowedTypes = applyTypeNarrowing(
        context,
        acc.narrowedTypes,
        data,
        operation
      );
      const _context = {
        ...context,
        narrowedTypes: acc.narrowedTypes,
        skipExecution: getSkipExecution({
          context,
          data,
          operationName: operation.value.name,
        }),
      };

      const foundOperation = getFilteredOperations(data, _context).find(
        (op) => op.name === operation.value.name
      );

      let updatedParameters = operation.value.parameters;
      let updatedTypeParameters = operation.type.parameters;

      if (foundOperation) {
        const sourceParameters = resolveParameters(
          foundOperation,
          data,
          _context
        );
        updatedTypeParameters = sourceParameters;

        updatedParameters = sourceParameters
          .slice(1)
          .map((sourceParam, sourceParamIndex) => {
            const param = operation.value.parameters[sourceParamIndex];
            if (!param) {
              if (sourceParam.isOptional) return null;
              return createStatement({
                data: createData({ type: sourceParam.type }),
                isOptional: sourceParam.isOptional,
              });
            }
            return updateStatement(
              { ...param, isOptional: sourceParam.isOptional },
              updateContextWithNarrowedTypes(
                _context,
                data,
                operation.value.name,
                sourceParamIndex
              )
            );
          })
          .filter((p): p is IStatement => p !== null);
      }
      acc.operations = [
        ...acc.operations,
        {
          ...operation,
          type: { ...operation.type, parameters: updatedTypeParameters },
          value: { ...operation.value, parameters: updatedParameters },
        },
      ];
      return acc;
    },
    { operations: [] as IData<OperationType>[], narrowedTypes: new Map() }
  ).operations;
}

function updateDataValue(
  data: IData,
  context: Context,
  reference?: { name: string; data: IData<DataType> }
): DataValue<DataType> {
  return reference
    ? { name: reference.name, id: reference.data.id }
    : isDataOfType(data, "array")
    ? updateStatements({ statements: data.value, context })
    : isDataOfType(data, "object")
    ? new Map(
        [...data.value.entries()].map(([name, statement]) => [
          name,
          updateStatement(statement, context),
        ])
      )
    : isDataOfType(data, "operation")
    ? updateOperationValue(data, context) ?? data.value
    : isDataOfType(data, "union")
    ? updateDataValue(
        { ...data, type: inferTypeFromValue(data.value, context) },
        context
      )
    : isDataOfType(data, "condition")
    ? (() => {
        const condition = updateStatement(data.value.condition, context);
        const _true = updateStatement(data.value.true, context);
        const _false = updateStatement(data.value.false, context);
        return { condition, true: _true, false: _false };
      })()
    : data.value;
}

function updateStatement(
  currentStatement: IStatement,
  context: Context
): IStatement {
  const currentReference = isDataOfType(currentStatement.data, "reference")
    ? currentStatement.data.value
    : undefined;

  const foundReference = context.variables
    .entries()
    .find(([, item]) => item.data?.id === currentReference?.id);

  const foundByName =
    !foundReference && currentReference
      ? context.variables.get(currentReference.name)
      : undefined;

  const reference = foundReference
    ? { name: foundReference[0], data: foundReference[1].data }
    : foundByName
    ? { name: currentReference!.name, data: foundByName.data }
    : undefined;

  const newStatement = {
    ...currentStatement,
    data: {
      ...currentStatement.data,
      value: updateDataValue(currentStatement.data, context, reference),
    },
  };
  return {
    ...newStatement,
    operations: updateOperationCalls(newStatement, context),
  };
}

export function updateStatements({
  statements,
  context,
  changedStatement,
  removeStatement,
  operation,
}: {
  statements: IStatement[];
  context: Context;
  changedStatement?: IStatement;
  removeStatement?: boolean;
  operation?: IData<OperationType>;
}): IStatement[] {
  let currentIndexFound = false;
  return statements.reduce((prevStatements, currentStatement, index) => {
    let statementToProcess = currentStatement;
    if (currentStatement.id === changedStatement?.id) {
      currentIndexFound = true;
      if (removeStatement) return prevStatements;
      statementToProcess = changedStatement;
    }

    if (changedStatement && !currentIndexFound)
      return [...prevStatements, currentStatement];

    const variables = createContextVariables(
      prevStatements,
      context,
      operation
    );
    const _context: Context = {
      getResult: context.getResult,
      variables,
      skipExecution: getSkipExecution({
        context: { ...context, variables },
        data: statementToProcess.data,
        ...(operation ? { operation, paramIndex: index } : {}),
      }),
    };
    return [...prevStatements, updateStatement(statementToProcess, _context)];
  }, [] as IStatement[]);
}

function updateOperationValue(
  operation: IData<OperationType>,
  context: Context
): DataValue<OperationType> {
  const updatedStatements = updateStatements({
    statements: [...operation.value.parameters, ...operation.value.statements],
    context,
    operation,
  });
  const parameterLength = operation.value.parameters.length;
  const parameters = updatedStatements.slice(0, parameterLength);
  const statements = updatedStatements.slice(parameterLength);
  return { ...operation.value, parameters, statements };
}

export function updateFiles(
  files: ProjectFile[],
  pushHistory: (fileId: string, content: ProjectFile["content"]) => void,
  context: Context,
  changedFile?: ProjectFile
): ProjectFile[] {
  const updatedFiles = files.map((file) =>
    file.id === changedFile?.id ? changedFile : file
  );
  return files.reduce((prevFiles, currentFile) => {
    let fileToProcess = currentFile;
    if (fileToProcess.id === changedFile?.id) {
      pushHistory(fileToProcess.id, fileToProcess.content);
      return [...prevFiles, changedFile];
    }
    const _context: Context = {
      variables: createFileVariables(updatedFiles, fileToProcess.id),
      getResult: context.getResult,
    };
    const operation = createOperationFromFile(fileToProcess);
    if (operation) {
      const value = updateOperationValue(operation, _context);
      if (!isEqual(value, operation.value)) {
        const operationFile = createFileFromOperation({
          ...operation,
          type: {
            ...operation.type,
            result: getOperationResultType(
              value.statements,
              _context.getResult
            ),
          },
          value,
        });
        fileToProcess = { ...operationFile, updatedAt: Date.now() };
      }
    }
    return [...prevFiles, fileToProcess];
  }, [] as ProjectFile[]);
}
