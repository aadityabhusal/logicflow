import {
  IStatement,
  IData,
  OperationType,
  DataValue,
  DataType,
  ProjectFile,
} from "./types";
import {
  getStatementResult,
  isDataOfType,
  getUnionActiveType,
  getUnionActiveIndex,
  createStatement,
  createData,
  createOperationFromFile,
  createFileFromOperation,
  getOperationResultType,
  resolveParameters,
  createContext,
  createFileVariables,
  getIsAsync,
  inferTypeFromValue,
} from "./utils";
import isEqual from "react-fast-compare";
import { getFilteredOperations } from "./execution/execution";
import { Context } from "./execution/types";

type UpdateOptions = {
  variableNames?: Map<string, string>;
  selfOperation?: IData<OperationType>;
};
function updateOperationCalls(
  statement: IStatement,
  context: Context,
  { variableNames, selfOperation }: UpdateOptions
): IData<OperationType>[] {
  return statement.operations.reduce(
    (accOperations, operation, operationIndex) => {
      const updatedStatement = { ...statement, operations: accOperations };
      const data = getStatementResult(updatedStatement, context, {
        index: operationIndex,
        prevEntity: true,
        skipResolveReference: true,
      });
      const _context = context.getContext(operation.id);

      const foundOperation = getFilteredOperations(data, _context).find(
        (op) => op.name === operation.value.name
      );
      const sourceParameters =
        operation.value.name === "call" &&
        selfOperation &&
        isDataOfType(data, "reference") &&
        data.value.name === selfOperation.value.name
          ? [{ type: selfOperation.type }, ...selfOperation.type.parameters]
          : foundOperation
            ? resolveParameters(foundOperation, data, _context)
            : undefined;

      let updatedParameters = operation.value.parameters;
      let updatedTypeParameters = operation.type.parameters;

      if (sourceParameters) {
        updatedTypeParameters = sourceParameters;

        updatedParameters = sourceParameters
          .slice(1)
          .flatMap((sourceParam, sourceParamIndex) => {
            const params = sourceParam.isRest
              ? operation.value.parameters.slice(sourceParamIndex)
              : [operation.value.parameters[sourceParamIndex]];

            if (!sourceParam.isRest && !params[0]) {
              if (sourceParam.isOptional) return null;
              return createStatement({
                data: createData({ type: sourceParam.type }),
                isOptional: sourceParam.isOptional,
              });
            }
            return params.map((_param) =>
              updateStatement(
                {
                  ..._param,
                  isOptional: sourceParam.isOptional || sourceParam.isRest,
                },
                context.getContext(_param.id),
                { variableNames, selfOperation }
              )
            );
          })
          .filter((p): p is IStatement => p !== null);
      }

      return [
        ...accOperations,
        {
          ...operation,
          type: { ...operation.type, parameters: updatedTypeParameters },
          value: { ...operation.value, parameters: updatedParameters },
        },
      ];
    },
    [] as IData<OperationType>[]
  );
}

function updateDataValue({
  data,
  context,
  reference,
  options,
}: {
  data: IData;
  context: Context;
  reference?: { name: string; data: IData<DataType> };
  options: UpdateOptions;
}): DataValue<DataType> {
  return reference
    ? { name: reference.name, id: reference.data.id }
    : isDataOfType(data, "array") || isDataOfType(data, "tuple")
      ? updateStatements({ statements: data.value, context, options })
      : isDataOfType(data, "object") || isDataOfType(data, "dictionary")
        ? {
            entries: data.value.entries.map(({ key, value }) => ({
              key,
              value: updateStatement(value, context, options),
            })),
          }
        : isDataOfType(data, "operation")
          ? (updateOperationValue(data, context, options) ?? data.value)
          : isDataOfType(data, "union")
            ? updateDataValue({
                data: {
                  ...data,
                  type: getUnionActiveType(data.type, {
                    value: data.value,
                    context,
                  }),
                },
                context,
                options,
              })
            : isDataOfType(data, "condition")
              ? (() => {
                  const condition = updateStatement(
                    data.value.condition,
                    context,
                    options
                  );
                  const trueBranch = updateStatements({
                    statements: data.value.trueBranch,
                    context,
                    options,
                  });
                  const falseBranch = updateStatements({
                    statements: data.value.falseBranch,
                    context,
                    options,
                  });
                  return { condition, trueBranch, falseBranch };
                })()
              : isDataOfType(data, "instance")
                ? {
                    ...data.value,
                    constructorArgs: updateStatements({
                      statements: data.value.constructorArgs,
                      context,
                      options,
                    }),
                  }
                : data.value;
}

function updateStatement(
  currentStatement: IStatement,
  context: Context,
  options: UpdateOptions
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
    ? {
        name:
          options.variableNames?.get(currentReference!.id) ?? foundReference[0],
        data: foundReference[1].data,
      }
    : foundByName
      ? { name: currentReference!.name, data: foundByName.data }
      : undefined;

  const updatedValue = updateDataValue({
    data: currentStatement.data,
    context,
    reference,
    options,
  });
  const currentType = currentStatement.data.type;
  const newType =
    currentType.kind === "union"
      ? {
          ...currentType,
          activeIndex: getUnionActiveIndex(currentType, {
            value: updatedValue,
            context,
          }),
        }
      : inferTypeFromValue(updatedValue, {
          ...context,
          expectedType: context.expectedType ?? currentType,
        });
  const newStatement = {
    ...currentStatement,
    data: {
      ...currentStatement.data,
      type: newType,
      value: updatedValue,
    },
  };
  return {
    ...newStatement,
    operations: updateOperationCalls(newStatement, context, options),
  };
}

export function updateStatements({
  statements,
  context,
  changedStatement,
  removeStatement,
  options,
}: {
  statements: IStatement[];
  context: Context;
  changedStatement?: IStatement;
  removeStatement?: boolean;
  options?: UpdateOptions;
}): IStatement[] {
  const currentVariableNames =
    options?.variableNames ?? new Map<string, string>();
  let currentIndexFound = false;
  return statements.flatMap((currentStatement) => {
    let statementToProcess = currentStatement;
    if (currentStatement.id === changedStatement?.id) {
      currentIndexFound = true;
      if (removeStatement) return [];
      statementToProcess = changedStatement;
    }

    if (changedStatement && !currentIndexFound) return currentStatement;
    const result = updateStatement(
      statementToProcess,
      context.getContext(statementToProcess.id),
      { ...options, variableNames: currentVariableNames }
    );
    if (result.name) currentVariableNames.set(result.id, result.name);
    return result;
  });
}

function updateOperationValue(
  operation: IData<OperationType>,
  context: Context,
  options: UpdateOptions
): DataValue<OperationType> {
  const updatedStatements = updateStatements({
    statements: [...operation.value.parameters, ...operation.value.statements],
    context,
    options,
  });
  const parameterLength = operation.value.parameters.length;
  const parameters = updatedStatements.slice(0, parameterLength);
  const statements = updatedStatements.slice(parameterLength);
  const isAsync = getIsAsync(updatedStatements);
  return { ...operation.value, parameters, statements, isAsync };
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
    const _context = createContext(context, {
      variables: createFileVariables(updatedFiles, context.variables),
    });
    const operation = createOperationFromFile(fileToProcess);
    if (operation) {
      const value = updateOperationValue(operation, _context, {
        variableNames: new Map(),
      });
      if (!isEqual(value, operation.value)) {
        const operationFile = createFileFromOperation({
          ...operation,
          type: {
            ...operation.type,
            result: getOperationResultType(value, _context),
          },
          value,
        });
        fileToProcess = {
          ...operationFile,
          ...("trigger" in currentFile ? { trigger: currentFile.trigger } : {}),
          updatedAt: Date.now(),
        } as ProjectFile;
      }
    }
    return [...prevFiles, fileToProcess];
  }, [] as ProjectFile[]);
}
