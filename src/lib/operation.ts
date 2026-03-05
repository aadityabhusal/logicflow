import { nanoid } from "nanoid";
import {
  IData,
  IStatement,
  OperationType,
  OperationListItem,
  Context,
  Thenable,
} from "./types";
import {
  createData,
  createStatement,
  createParamData,
  createInstance,
  getStatementResult,
  getUnionActiveType,
  isDataOfType,
  isFatalError,
  isTypeCompatible,
  resolveUnionType,
  resolveReference,
  applyTypeNarrowing,
  getSkipExecution,
  resolveParameters,
  operationToListItem,
  createContext,
  isObject,
  createThenable,
  unwrapThenable,
} from "./utils";
import { builtInOperations, createRuntimeError } from "./built-in-operations";

/* Operation List */

const dataSupportsOperation = (
  data: IData,
  operationItem: OperationListItem,
  context: Context
) => {
  if (isDataOfType(data, "never")) return false;
  const operationParameters = resolveParameters(operationItem, data, context);
  const firstParam = operationParameters[0]?.type ?? { kind: "undefined" };
  // This case is for union of two objects of different keys.
  if (isDataOfType(data, "union") && firstParam.kind !== "union") {
    return data.type.types.every((t) => isTypeCompatible(t, firstParam));
  }
  return isTypeCompatible(data.type, firstParam);
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

function executeDataValue(
  data: IData,
  context: Context
): (IData | Thenable<IData | void>)[] {
  const _execute = context.isSync ? executeStatementSync : executeStatement;

  if (isDataOfType(data, "array") || isDataOfType(data, "tuple")) {
    return data.value.map((item) => _execute(item, context));
  } else if (isDataOfType(data, "object") || isDataOfType(data, "dictionary")) {
    return data.value.entries.map((e) => _execute(e.value, context));
  } else if (isDataOfType(data, "operation")) {
    return [setOperationResults(data, context)];
  } else if (isDataOfType(data, "union")) {
    return executeDataValue(
      { ...data, type: getUnionActiveType(data.type, data.value, context) },
      context
    );
  } else if (isDataOfType(data, "condition")) {
    return Object.values(data.value).map((s) => _execute(s, context));
  } else if (isDataOfType(data, "instance")) {
    const args = data.value.constructorArgs.map((arg) =>
      _execute(arg, context)
    );
    return [
      (context.isSync
        ? createThenable(args as IData[])
        : Promise.all(args)
      ).then((result) => {
        const instance =
          context.getInstance(data.value.instanceId) ??
          createInstance(data.value.className, result, context);
        context.setInstance(data.value.instanceId, instance);
      }),
    ];
  }
  return [];
}

export function setOperationResults(
  operation: IData<OperationType>,
  context: Context
): Thenable<void> {
  const { parameters, statements } = operation.value;
  const _context = createContext(context);
  const _execute = context.isSync ? executeStatementSync : executeStatement;
  return [...parameters, ...statements].reduce((chain, statement) => {
    return chain.then(() => {
      const result = _execute(statement, _context);
      return (result instanceof Promise ? result : createThenable(result)).then(
        (result) => {
          if (!isDataOfType(result, "error") && statement.name) {
            _context.variables.set(statement.name, { data: result });
          }
        }
      );
    });
  }, createThenable(undefined) as Thenable<void>);
}

function executeStatementCore(
  context: Context,
  narrowed: Required<Context>["narrowedTypes"],
  data: IData,
  operation: IData<OperationType>
): {
  _narrowedTypes: Required<Context>["narrowedTypes"];
  shouldCacheResult?: boolean;
} & (
  | { result: IData; foundOp?: never; _context?: never }
  | { foundOp: OperationListItem; _context: Context; result?: never }
) {
  const _narrowedTypes = applyTypeNarrowing(context, narrowed, data, operation);
  const _context = createContext(context, {
    narrowedTypes: _narrowedTypes,
    skipExecution: getSkipExecution({
      context: context,
      data: data,
      operationName: operation.value.name,
    }),
  });
  const foundOp = getFilteredOperations(data, _context).find(
    (op) => op.name === operation.value.name
  );

  if (!foundOp) {
    const kind = resolveReference(data, _context).type.kind;
    return {
      _narrowedTypes,
      result: createData({
        type: { kind: "error", errorType: "type_error" },
        value: {
          reason: `Cannot chain '${operation.value.name}' after '${kind}' type`,
        },
      }),
    };
  }
  const existingResult = context.getResult(operation.id)?.data;
  const shouldCacheResult = foundOp.shouldCacheResult;
  if (shouldCacheResult && existingResult) {
    return { _narrowedTypes, result: existingResult, shouldCacheResult };
  }
  if (_context.skipExecution) {
    return {
      _narrowedTypes,
      shouldCacheResult,
      result: createData({ type: operation.type.result }),
    };
  }
  return { _narrowedTypes, _context, foundOp, shouldCacheResult };
}

export async function executeStatement(
  statement: IStatement,
  context: Context
): Promise<IData> {
  let currentData = resolveReference(statement.data, context);
  if (isDataOfType(currentData, "condition")) {
    const value = currentData.value;
    const result = await executeStatement(value.condition, context);
    if (isFatalError(result)) return result;
    const data = result.value ? value.true : value.false;
    currentData = await executeStatement(data, context);
  }
  if (isFatalError(currentData)) return currentData;

  await Promise.allSettled(executeDataValue(statement.data, context));

  let narrowedTypes = new Map();
  let resultData = statement.data;

  for (const operation of statement.operations) {
    if (isFatalError(resultData)) break;
    const { _narrowedTypes, foundOp, result, _context, shouldCacheResult } =
      executeStatementCore(context, narrowedTypes, resultData, operation);
    narrowedTypes = _narrowedTypes;
    const parameters = operation.value.parameters;
    const opResult = foundOp
      ? await executeOperation(foundOp, resultData, parameters, _context)
      : result;
    context.setResult?.(operation.id, { data: opResult, shouldCacheResult });
    resultData = opResult;
  }
  const finalResult = resolveReference(resultData, context);
  return finalResult;
}

export function executeStatementSync(
  statement: IStatement,
  context: Context
): IData {
  let currentData = resolveReference(statement.data, context);
  if (isDataOfType(currentData, "condition")) {
    const value = currentData.value;
    const result = executeStatementSync(value.condition, context);
    if (isFatalError(result)) return result;
    const data = result.value ? value.true : value.false;
    currentData = executeStatementSync(data, context);
  }
  if (isFatalError(currentData)) return currentData;

  executeDataValue(statement.data, context).forEach((e) => {
    unwrapThenable(e);
  });

  let narrowedTypes = new Map();
  let resultData = statement.data;

  for (const operation of statement.operations) {
    if (isFatalError(resultData)) break;
    const { _narrowedTypes, foundOp, result, _context } = executeStatementCore(
      context,
      narrowedTypes,
      resultData,
      operation
    );
    narrowedTypes = _narrowedTypes;
    const parameters = operation.value.parameters;
    const operationResult = foundOp
      ? executeOperationSync(foundOp, resultData, parameters, _context)
      : result;
    context.setResult?.(operation.id, {
      data: operationResult,
      shouldCacheResult: foundOp?.shouldCacheResult,
    });
    resultData = operationResult;
  }
  const finalResult = resolveReference(resultData, context);
  return finalResult;
}

export function executeOperationCore(
  operation: OperationListItem,
  _data: IData,
  _parameters: IStatement[],
  context: Context
): IData | Thenable<IData | Context> {
  if (context.skipExecution) return createData();
  const data = resolveReference(_data, context);
  if (
    isDataOfType(data, "error") &&
    !dataSupportsOperation(data, operation, context)
  ) {
    return data;
  }

  if ("lazyHandler" in operation) {
    try {
      return operation.lazyHandler(context, data, ..._parameters);
    } catch (error) {
      return createRuntimeError(error);
    }
  }

  const resolvedParams = resolveParameters(operation, data, context);
  const executedParams = resolvedParams.slice(1).map((p, index) => {
    const hasParam = _parameters[index];
    if (!hasParam)
      return createData({
        type: resolveUnionType([p.type, { kind: "undefined" }]),
        value: undefined,
      });
    const _execute = context.isSync ? executeStatementSync : executeStatement;
    return _execute(hasParam, context);
  });

  return (
    context.isSync
      ? createThenable(executedParams as IData[])
      : Promise.all(executedParams)
  ).then((parameters) => {
    const errorParamIndex = resolvedParams.slice(1).findIndex((p, i) => {
      const hasError = isFatalError(parameters[i]);
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
        return operation.handler(context, data, ...parameters);
      } catch (error) {
        return createRuntimeError(error);
      }
    }

    if (!("statements" in operation) || operation.statements.length <= 0) {
      return createData();
    }
    const newContext = createContext(context, undefined, true);
    const allInputs = [data, ...parameters];
    resolvedParams.forEach((_param, index) => {
      if (_param.name && allInputs[index]) {
        const paramType =
          _param.type.kind === "union"
            ? { ..._param.type, activeIndex: undefined }
            : _param.type;
        const param = { ...allInputs[index], type: paramType };
        const resolved = resolveReference(param, newContext);
        newContext.variables.set(_param.name, {
          data: resolved,
          reference: isDataOfType(param, "reference") ? param.value : undefined,
        });
      }
    });
    return newContext;
  });
}

export async function executeOperation(
  ...args: Parameters<typeof executeOperationCore>
): Promise<IData> {
  const [operation] = args;
  const result = await executeOperationCore(...args);
  if ("type" in result) return result;

  let lastResult: IData = createData();
  if (!("statements" in operation)) return lastResult;
  for (const statement of operation.statements) {
    lastResult = await executeStatement(statement, result);
    if (isDataOfType(lastResult, "error")) return lastResult;
    if (statement.name) {
      result.variables.set(statement.name, {
        data: lastResult,
        reference: undefined,
      });
    }
  }
  return lastResult;
}

export function executeOperationSync(
  ...args: Parameters<typeof executeOperationCore>
): IData {
  const [operation] = args;
  const result = unwrapThenable(executeOperationCore(...args));
  if (result && "type" in result) return result;

  let lastResult: IData = createData();
  if (!("statements" in operation)) return lastResult;
  for (const statement of operation.statements) {
    lastResult = executeStatementSync(statement, result);
    if (isDataOfType(lastResult, "error")) return lastResult;
    if (statement.name) {
      result.variables.set(statement.name, {
        data: lastResult,
        reference: undefined,
      });
    }
  }
  return lastResult;
}
