import { nanoid } from "nanoid";
import {
  IData,
  IStatement,
  OperationType,
  OperationListItem,
  Context,
} from "./types";
import {
  createData,
  createStatement,
  createParamData,
  createInstance,
  getStatementResult,
  getUnionActiveType,
  isDataOfType,
  isTypeCompatible,
  resolveUnionType,
  resolveReference,
  createContextVariables,
  applyTypeNarrowing,
  getSkipExecution,
  resolveParameters,
  operationToListItem,
  createContext,
} from "./utils";
import { builtInOperations, createRuntimeError } from "./built-in-operations";
import { InstanceTypes } from "./data";

/* Operation List */

const dataSupportsOperation = (
  data: IData,
  operationItem: OperationListItem,
  context: Context
) => {
  if (isDataOfType(data, "never")) return false;
  const operationParameters = resolveParameters(operationItem, data, context);
  const firstParam = operationParameters[0]?.type ?? { kind: "undefined" };
  if (isDataOfType(data, "instance") && firstParam.kind === "instance") {
    return firstParam.className === data.type.className;
  }
  return isDataOfType(data, "union") && firstParam.kind !== "union"
    ? data.type.types.every((t) => t.kind === firstParam.kind)
    : isDataOfType(data, firstParam.kind) || firstParam.kind === "unknown";
};

type FilteredOperationsReturn<T extends boolean> = T extends true
  ? [string, OperationListItem[]][]
  : OperationListItem[];
export function getFilteredOperations<T extends boolean = false>(
  _data: IData,
  context: Context,
  grouped?: T
): FilteredOperationsReturn<T> {
  const data = resolveReference(_data, context);
  const builtInOps = builtInOperations.filter((operation) => {
    return dataSupportsOperation(data, operation, context);
  });

  const userDefinedOps = context.variables
    .entries()
    .reduce((acc, [name, variable]) => {
      if (!name || !isDataOfType(variable.data, "operation")) return acc;
      if (
        dataSupportsOperation(
          data,
          operationToListItem(variable.data, name),
          context
        )
      ) {
        acc.push(operationToListItem(variable.data, name));
      }
      return acc;
    }, [] as OperationListItem[]);

  return grouped
    ? ([
        ["Built-in", builtInOps],
        ["User-defined", userDefinedOps],
      ] as FilteredOperationsReturn<T>)
    : (builtInOps.concat(userDefinedOps) as FilteredOperationsReturn<T>);
}

export async function createOperationCall({
  data: _data,
  name,
  parameters,
  context,
  operationId,
  setResult,
}: {
  data: IData;
  name?: string;
  parameters?: IStatement[];
  context: Context;
  setResult: Required<Context>["setResult"];
  operationId?: string;
}): Promise<IData<OperationType>> {
  const data = resolveReference(_data, context);
  const operations = getFilteredOperations(data, context);
  const operationByName = operations.find(
    (operation) => operation.name === name
  );
  const newOperation = operationByName || operations[0];
  const operationParameters = resolveParameters(newOperation, data, context);
  const newParameters = operationParameters
    .slice(1)
    .filter((param) => !param?.isOptional)
    .map((item, index) => {
      const newParam = createStatement({
        data: createParamData({ ...item, type: item.type || data.type }),
        isOptional: item.isOptional,
      });
      const prevParam = parameters?.[index];
      if (
        prevParam &&
        isTypeCompatible(
          newParam.data.type,
          getStatementResult(prevParam, context).type
        )
      ) {
        return prevParam;
      }
      return newParam;
    });

  const _operationId = operationId ?? nanoid();

  const result = newOperation.shouldCacheResult
    ? createData({ type: { kind: "undefined" } })
    : await executeOperation(newOperation, data, newParameters, context);

  if (!newOperation.shouldCacheResult) {
    const operationResult = { ...result, id: _operationId };
    setResult(_operationId, { data: operationResult });
  }
  return {
    id: _operationId,
    type: {
      kind: "operation",
      parameters: operationParameters,
      result: result.type,
    },
    value: {
      name: newOperation.name,
      parameters: newParameters,
      statements: [],
    },
  };
}

/* Execution */

export async function storeDataInstance(data: IData, context: Context) {
  if (!isDataOfType(data, "instance")) return;
  const settledArgs = await Promise.all(
    data.value.constructorArgs.map((arg) => executeStatement(arg, context))
  );
  const instance =
    context.getInstance(data.value.instanceId) ??
    createInstance(
      data.value.className as keyof typeof InstanceTypes,
      settledArgs,
      context
    );
  context.setInstance(data.value.instanceId, instance);
}

export async function executeDataValue(
  data: IData,
  context: Context
): Promise<void> {
  if (isDataOfType(data, "array") || isDataOfType(data, "tuple")) {
    await Promise.allSettled(
      data.value.map((item) => executeStatement(item, context))
    );
  } else if (isDataOfType(data, "object") || isDataOfType(data, "dictionary")) {
    await Promise.allSettled(
      Array.from(data.value.values()).map((item) =>
        executeStatement(item, context)
      )
    );
  } else if (isDataOfType(data, "operation")) {
    await setOperationResults(data, context);
  } else if (isDataOfType(data, "union")) {
    await executeDataValue(
      { ...data, type: getUnionActiveType(data.type, data.value, context) },
      context
    );
  } else if (isDataOfType(data, "condition")) {
    await Promise.allSettled([
      executeStatement(data.value.condition, context),
      executeStatement(data.value.true, context),
      executeStatement(data.value.false, context),
    ]);
  } else if (isDataOfType(data, "instance")) {
    await storeDataInstance(data, context);
  }
}

export async function executeStatement(
  statement: IStatement,
  context: Context
): Promise<IData> {
  let currentData = resolveReference(statement.data, context);
  if (isDataOfType(currentData, "error")) return currentData;

  if (isDataOfType(currentData, "condition")) {
    const conditionValue = currentData.value;
    const conditionResult = await executeStatement(
      conditionValue.condition,
      context
    );
    if (isDataOfType(conditionResult, "error")) return conditionResult;
    currentData = await executeStatement(
      conditionResult.value ? conditionValue.true : conditionValue.false,
      context
    );
    if (isDataOfType(currentData, "error")) return currentData;
  }

  // For showing result values of operation calls used inside complex data.
  await executeDataValue(statement.data, context);

  let narrowedTypes = new Map();
  let resultData = statement.data;

  for (const operation of statement.operations) {
    if (isDataOfType(resultData, "error")) break;

    narrowedTypes = applyTypeNarrowing(
      context,
      narrowedTypes,
      resultData,
      operation
    );

    const _context = createContext(context, {
      narrowedTypes,
      skipExecution: getSkipExecution({
        context,
        data: resultData,
        operationName: operation.value.name,
      }),
    });

    let operationResult: IData = createData({
      type: { kind: "error", errorType: "type_error" },
      value: {
        reason: `Cannot chain '${operation.value.name}' after '${
          resolveReference(resultData, _context).type.kind
        }' type`,
      },
    });

    const foundOp = getFilteredOperations(resultData, _context).find(
      (op) => op.name === operation.value.name
    );

    if (foundOp) {
      const resultType = operation.type.result;
      const existingResult = context.getResult(operation.id)?.data;

      const shouldExecute =
        !foundOp.shouldCacheResult ||
        (foundOp.shouldCacheResult &&
          resultType.kind !== "undefined" &&
          !existingResult);

      if (shouldExecute) {
        operationResult = _context.skipExecution
          ? createData({ type: operation.type.result })
          : await executeOperation(
              foundOp,
              resultData,
              operation.value.parameters,
              _context
            );
      } else if (existingResult) {
        operationResult = existingResult;
      } else if (foundOp.shouldCacheResult) {
        // For yet-to-execute manual operations, return an undefined type placeholder result.
        operationResult = createData({ type: { kind: "undefined" } });
      }
    }
    context.setResult?.(operation.id, {
      data: operationResult,
      shouldCacheResult: foundOp?.shouldCacheResult,
    });
    resultData = operationResult;
  }
  const finalResult = resolveReference(resultData, context);
  return finalResult;
}

export async function setOperationResults(
  operation: IData<OperationType>,
  context: Context
): Promise<void> {
  const _context = createContext(context, {
    variables: createContextVariables(
      operation.value.parameters,
      context,
      operation
    ),
  });
  await Promise.allSettled(
    operation.value.parameters.map((param) =>
      storeDataInstance(param.data, context)
    )
  );
  for (const statement of operation.value.statements) {
    const result = await executeStatement(statement, _context);
    if (!isDataOfType(result, "error") && statement.name) {
      _context.variables.set(statement.name, { data: result });
    }
  }
}

export async function executeOperation(
  operation: OperationListItem,
  _data: IData,
  _parameters: IStatement[],
  prevContext: Context
): Promise<IData> {
  if (prevContext.skipExecution) return createData();
  const data = resolveReference(_data, prevContext);
  if (
    isDataOfType(data, "error") &&
    !dataSupportsOperation(data, operation, prevContext)
  ) {
    return data;
  }

  if ("lazyHandler" in operation) {
    try {
      return await operation.lazyHandler(prevContext, data, ..._parameters);
    } catch (error) {
      return createRuntimeError(error);
    }
  }

  const resolvedParams = resolveParameters(operation, data, prevContext);
  const settledParams = await Promise.allSettled(
    resolvedParams.slice(1).map((p, index) => {
      const hasParam = _parameters[index];
      if (!hasParam)
        return createData({
          type: resolveUnionType([p.type, { kind: "undefined" }]),
          value: undefined,
        });
      return executeStatement(hasParam, prevContext);
    })
  );

  const parameters = settledParams.map((result) =>
    result.status === "fulfilled"
      ? result.value
      : createRuntimeError(result.reason)
  );
  const errorParamIndex = resolvedParams.slice(1).findIndex((p, i) => {
    const hasError = isDataOfType(parameters[i], "error");
    const typeMismatch = !isTypeCompatible(parameters[i].type, p.type);
    return hasError || typeMismatch;
  });
  if (errorParamIndex !== -1) {
    return createData({
      type: { kind: "error", errorType: "type_error" },
      value: {
        reason: `Parameter #${errorParamIndex + 1} should be of type '${
          resolvedParams[errorParamIndex + 1].type.kind
        }'`,
      },
    });
  }

  if ("handler" in operation) {
    try {
      const result = operation.handler(prevContext, data, ...parameters);
      return result instanceof Promise ? await result : result;
    } catch (error) {
      return createRuntimeError(error);
    }
  }

  if ("statements" in operation && operation.statements.length > 0) {
    const context = createContext(prevContext, undefined, true);
    const allInputs = [data, ...parameters];
    resolvedParams.forEach((_param, index) => {
      if (_param.name && allInputs[index]) {
        const paramType =
          _param.type.kind === "union"
            ? { ..._param.type, activeIndex: undefined }
            : _param.type;
        const param = { ...allInputs[index], type: paramType };
        const resolved = resolveReference(param, context);
        context.variables.set(_param.name, {
          data: resolved,
          reference: isDataOfType(param, "reference") ? param.value : undefined,
        });
      }
    });
    let lastResult: IData = createData();
    for (const statement of operation.statements) {
      lastResult = await executeStatement(statement, context);
      if (isDataOfType(lastResult, "error")) return lastResult;
      if (statement.name) {
        context.variables.set(statement.name, {
          data: lastResult,
          reference: undefined,
        });
      }
    }
    return lastResult;
  }

  return createData();
}
