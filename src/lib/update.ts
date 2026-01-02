import {
  getFilteredOperations,
  executeOperation,
  executeStatement,
  getSkipExecution,
} from "./operation";
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
  getInverseTypes,
  mergeNarrowedTypes,
  resolveReference,
} from "./utils";
import isEqual from "react-fast-compare";

export function updateOperationCalls(
  statement: IStatement,
  _context: Context
): IData<OperationType>[] {
  return statement.operations.reduce(
    (acc, operation, operationIndex) => {
      const updatedStatement = { ...statement, operations: acc.operations };
      const data = getStatementResult(updatedStatement, operationIndex, true);
      acc.narrowedTypes = applyTypeNarrowing(
        _context,
        acc.narrowedTypes,
        data,
        operation
      );
      const context = {
        ..._context,
        skipExecution: getSkipExecution({ context: _context, data, operation }),
      };

      const parameters = operation.value.parameters.map((param, paramIndex) => {
        const variables =
          operation.value.name === "thenElse" && paramIndex === 1
            ? getInverseTypes(context.variables, acc.narrowedTypes)
            : mergeNarrowedTypes(
                context.variables,
                acc.narrowedTypes,
                operation.value.name
              );
        return updateStatement(param, {
          ...context,
          variables,
          skipExecution: getSkipExecution({
            context,
            data,
            operation,
            paramIndex: paramIndex,
          }),
        });
      });

      const foundOperation = getFilteredOperations(
        data,
        context.variables
      ).find((op) => op.name === operation.value.name);
      const currentResult = operation.value.result;
      const result = foundOperation
        ? {
            ...executeOperation(foundOperation, data, parameters, context),
            ...(currentResult && { id: currentResult?.id }),
          }
        : createData({
            type: { kind: "error", errorType: "type_error" },
            value: {
              reason: `Cannot chain '${operation.value.name}' after '${
                resolveReference(data, context).type.kind
              }' type`,
            },
          });

      acc.operations = [
        ...acc.operations,
        { ...operation, value: { ...operation.value, parameters, result } },
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
        { ...data, type: inferTypeFromValue(data.value) },
        context
      )
    : isDataOfType(data, "condition")
    ? (() => {
        const condition = updateStatement(data.value.condition, context);
        const _true = updateStatement(data.value.true, context);
        const _false = updateStatement(data.value.false, context);
        const result = executeStatement(
          createStatement({
            data: createData({
              type: data.type,
              value: { condition, true: _true, false: _false },
            }),
          }),
          context
        );
        return { condition, true: _true, false: _false, result };
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
  const reference = foundReference
    ? { name: foundReference[0], data: foundReference[1].data }
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

    const variables = createContextVariables(prevStatements, context.variables);
    const _context = {
      currentStatementId: statementToProcess.id,
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
  });
  const parameterLength = operation.value.parameters.length;
  const parameters = updatedStatements.slice(0, parameterLength);
  const statements = updatedStatements.slice(parameterLength);
  return { ...operation.value, parameters, statements };
}

export function updateFiles(
  files: ProjectFile[],
  pushHistory: (fileId: string, content: ProjectFile["content"]) => void,
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
    const context = {
      variables: createFileVariables(updatedFiles, fileToProcess.id),
    };
    const operation = createOperationFromFile(fileToProcess);
    if (operation) {
      const value = updateOperationValue(operation, context);
      if (!isEqual(value, operation.value)) {
        const operationFile = createFileFromOperation({
          ...operation,
          type: inferTypeFromValue(value),
          value,
        });
        fileToProcess = { ...operationFile, updatedAt: Date.now() };
      }
    }
    return [...prevFiles, fileToProcess];
  }, [] as ProjectFile[]);
}
