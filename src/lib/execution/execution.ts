import { nanoid } from "nanoid";
import { IData, IStatement, OperationType, DataType } from "@/lib/types";
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
  getSkipExecution,
  resolveParameters,
  operationToListItem,
  createContext,
  createContextVariable,
  createThenable,
  unwrapThenable,
  getInverseTypes,
  updateContextWithNarrowedTypes,
  getContextExpectedTypes,
  getCacheKey,
} from "@/lib/utils";
import { OperationListItem, Context, Thenable } from "./types";
import {
  builtInOperations,
  createRuntimeError,
} from "@/lib/operations/built-in";

function getChildContext(
  context: Context,
  options?: {
    index?: number;
    key?: string;
    expectedType?: DataType;
    enforceExpectedType?: boolean;
    narrowedTypes?: Context["narrowedTypes"];
  }
): Context {
  let expectedType: DataType | undefined = options?.expectedType;

  if (!expectedType && context.expectedType) {
    const parentType = context.expectedType;
    if (parentType.kind === "array" || parentType.kind === "dictionary") {
      expectedType = parentType.elementType;
    } else if (parentType.kind === "tuple" && options?.index !== undefined) {
      expectedType = parentType.elements[options.index];
    } else if (parentType.kind === "object" && options?.key !== undefined) {
      expectedType = parentType.properties.find(
        (p) => p.key === options.key
      )?.value;
    } else if (parentType.kind === "instance" && options?.index !== undefined) {
      expectedType = parentType.constructorArgs[options.index]?.type;
    } else if (
      parentType.kind === "operation" &&
      options?.index !== undefined
    ) {
      expectedType = parentType.parameters[options.index].type;
    } else {
      expectedType = parentType;
    }
  }
  const _context = createContext(context, { scopeId: context.scopeId });
  return {
    ..._context,
    ...getContextExpectedTypes({
      context: _context,
      expectedType,
      enforceExpectedType: options?.enforceExpectedType,
    }),
    ...(options?.narrowedTypes ? { narrowedTypes: options.narrowedTypes } : {}),
  };
}

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
    return data.type.types.every((t) =>
      isTypeCompatible(t, firstParam, context)
    );
  }
  return isTypeCompatible(data.type, firstParam, context);
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
}: {
  data: IData;
  name?: string;
  parameters?: IStatement[];
  context: Context;
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
      const type =
        item.isRest && item.type.kind === "array"
          ? item.type.elementType
          : item.type;
      const newParam = createStatement({
        data: createParamData({ ...item, type: type || data.type }),
        isOptional: item.isOptional || item.isRest,
      });
      const prevParam = parameters?.[index];
      if (
        prevParam &&
        isTypeCompatible(
          newParam.data.type,
          getStatementResult(prevParam, context).type,
          context
        )
      ) {
        return prevParam;
      }
      return newParam;
    });

  const _operationId = operationId ?? nanoid();

  const result = await executeOperation(
    newOperation,
    data,
    newParameters,
    context
  );

  const operationResult = { ...result, id: _operationId };
  context.setResult(_operationId, {
    data: operationResult,
    shouldCacheResult: newOperation.shouldCacheResult,
  });
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
      source: newOperation.source,
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
    return data.value.map((item, index) => {
      return _execute(item, getChildContext(context, { index }));
    });
  } else if (isDataOfType(data, "object") || isDataOfType(data, "dictionary")) {
    return data.value.entries.map((entry) => {
      return _execute(
        entry.value,
        getChildContext(context, { key: entry.key })
      );
    });
  } else if (isDataOfType(data, "operation")) {
    return [setOperationResults(data, context)];
  } else if (isDataOfType(data, "union")) {
    const activeType = getUnionActiveType(data.type, {
      value: data.value,
      context,
    });
    return executeDataValue(
      { ...data, type: activeType },
      getChildContext(context, { expectedType: activeType })
    );
  } else if (isDataOfType(data, "condition")) {
    return [
      _execute(data.value.condition, context),
      _execute(data.value.true, getChildContext(context)),
      _execute(
        data.value.false,
        getChildContext(context, {
          narrowedTypes: getInverseTypes(
            context.variables,
            context.narrowedTypes ?? new Map(),
            context
          ),
        })
      ),
    ];
  } else if (isDataOfType(data, "instance")) {
    const args = data.value.constructorArgs.map((arg, index) => {
      return _execute(
        arg,
        getChildContext(context, { index, expectedType: data.type })
      );
    });
    return [
      (context.isSync
        ? createThenable(args as IData[])
        : Promise.all(args)
      ).then((result) => {
        const instance = createInstance(data.value.className, result, context);
        context.setInstance(data.value.instanceId, {
          instance,
          type: data.type,
        });
      }),
    ];
  }
  return [];
}

export function setOperationResults(
  operation: IData<OperationType>,
  _context: Context
): Thenable<void> {
  const { parameters, statements } = operation.value;
  const context = createContext(_context, { scopeId: operation.id });
  const _execute = context.isSync ? executeStatementSync : executeStatement;

  return [...parameters, ...statements].reduce(
    (chain, stmt, index) => {
      return chain.then(() => {
        const result = _execute(
          stmt,
          index < parameters.length
            ? getChildContext(_context, { index, enforceExpectedType: true })
            : context
        );
        return (
          result instanceof Promise ? result : createThenable(result)
        ).then((result) => {
          const variable = createContextVariable(
            stmt,
            context,
            result,
            operation.type.parameters
          );
          if (variable && stmt.name) {
            context.variables.set(stmt.name, variable);
          }
        });
      });
    },
    createThenable(undefined) as Thenable<void>
  );
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
  | { result: IData; foundOp?: never; opCallContext?: never }
  | { foundOp: OperationListItem; opCallContext: Context; result?: never }
) {
  const opName = operation.value.name;
  const _narrowedTypes = applyTypeNarrowing(context, narrowed, data, operation);
  const opCallContext = {
    ...context,
    narrowedTypes: _narrowedTypes,
    skipExecution: getSkipExecution({ context, data, operationName: opName }),
  };
  const foundOp = getFilteredOperations(data, opCallContext).find(
    (op) => op.name === opName
  );
  opCallContext.setContext(operation.id, opCallContext);

  operation.value.parameters.forEach((param, index) => {
    const params = foundOp && resolveParameters(foundOp, data, opCallContext);
    opCallContext.setContext(
      param.id,
      getChildContext(
        updateContextWithNarrowedTypes(opCallContext, data, opName, index),
        { expectedType: params?.[index + 1]?.type }
      )
    );
  });

  if (!foundOp) {
    const kind = resolveReference(data, opCallContext).type.kind;
    return {
      _narrowedTypes,
      result: createData({
        type: { kind: "error", errorType: "type_error" },
        value: { reason: `Cannot chain '${opName}' after '${kind}' type` },
      }),
    };
  }
  const existingResult = opCallContext.getResult(
    getCacheKey(opCallContext, operation.id)
  )?.data;
  const shouldCacheResult = foundOp.shouldCacheResult;
  if (shouldCacheResult && existingResult) {
    return { _narrowedTypes, result: existingResult, shouldCacheResult };
  }
  if (opCallContext.skipExecution) {
    return {
      _narrowedTypes,
      shouldCacheResult,
      result: createData({ type: operation.type.result }),
    };
  }
  return { _narrowedTypes, opCallContext, foundOp, shouldCacheResult };
}

export async function executeStatement(
  statement: IStatement,
  context: Context
): Promise<IData> {
  context.setContext(statement.id, context);
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
    const {
      _narrowedTypes,
      foundOp,
      result,
      opCallContext,
      shouldCacheResult,
    } = executeStatementCore(context, narrowedTypes, resultData, operation);
    narrowedTypes = _narrowedTypes;

    if (result !== undefined) {
      const cacheKey = getCacheKey(context, operation.id);
      context.setResult(cacheKey, { data: result, shouldCacheResult });
      resultData = result;
      continue;
    }
    const parameters = operation.value.parameters;
    const opResult = await executeOperation(
      foundOp,
      resultData,
      parameters,
      opCallContext
    );
    resultData = opResult;
    context.setResult(getCacheKey(context, operation.id), {
      data: opResult,
      shouldCacheResult,
    });
  }
  const finalResult = resolveReference(resultData, context);
  return finalResult;
}

export function executeStatementSync(
  statement: IStatement,
  context: Context
): IData {
  context.setContext(statement.id, context);
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
    const {
      _narrowedTypes,
      foundOp,
      result,
      opCallContext,
      shouldCacheResult,
    } = executeStatementCore(context, narrowedTypes, resultData, operation);
    narrowedTypes = _narrowedTypes;

    if (result !== undefined) {
      const cacheKey = getCacheKey(context, operation.id);
      context.setResult(cacheKey, { data: result, shouldCacheResult });
      resultData = result;
      continue;
    }
    const parameters = operation.value.parameters;
    const opResult = executeOperationSync(
      foundOp,
      resultData,
      parameters,
      opCallContext
    );
    resultData = opResult;
    context.setResult(getCacheKey(context, operation.id), {
      data: opResult,
      shouldCacheResult,
    });
  }
  const finalResult = resolveReference(resultData, context);
  return finalResult;
}

function executeOperationCore(
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

  const _execute = context.isSync ? executeStatementSync : executeStatement;
  const resolvedParams = resolveParameters(operation, data, context);
  const executedParams = resolvedParams.slice(1).flatMap((p, index) => {
    const params = p.isRest ? _parameters.slice(index) : [_parameters[index]];
    return params.map((param) => {
      if (!param) return createData();
      return _execute(
        param,
        getChildContext(context, {
          expectedType:
            p.isRest && p.type.kind === "array" ? p.type.elementType : p.type,
        })
      );
    });
  });

  return (
    context.isSync
      ? createThenable(executedParams as IData[])
      : Promise.all(executedParams)
  ).then((parameters) => {
    const errorParamIndex = resolvedParams.slice(1).findIndex((p, i) => {
      const param =
        p.isRest && "handler" in operation
          ? createData({
              value: parameters
                .slice(i)
                .map((data) => createStatement({ data })),
            })
          : parameters[i];
      const hasError = isFatalError(param);
      const expectedType = p.isOptional
        ? resolveUnionType([p.type, { kind: "undefined" }])
        : p.type;
      const typeMismatch = !isTypeCompatible(param.type, expectedType, context);
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
    const newContext = createContext(context, {
      scopeId: operation.id,
      isIsolated: true,
    });
    const allInputs = [data, ...parameters];
    resolvedParams.forEach((_param, index) => {
      if (_param.name && allInputs[index]) {
        const paramType =
          _param.type.kind === "union"
            ? { ..._param.type, activeIndex: undefined }
            : _param.type;
        const param = { ...allInputs[index], type: paramType };
        const resolved = resolveReference(param, newContext);
        const variable = createContextVariable(
          createStatement({ data: param, name: _param.name }),
          newContext,
          resolved,
          resolvedParams
        );
        if (variable) newContext.variables.set(_param.name, variable);
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
    const variable = createContextVariable(statement, result, lastResult);
    if (variable && statement.name) {
      result.variables.set(statement.name, variable);
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
    const variable = createContextVariable(statement, result, lastResult);
    if (variable && statement.name) {
      result.variables.set(statement.name, variable);
    }
  }
  return lastResult;
}

function objectTypeMatch(
  source: DataType,
  target: DataType,
  context: Context
): boolean {
  if (target.kind !== "object")
    return isTypeCompatible(source, target, context);
  if (source.kind !== "object") return false;
  const sourceProps = new Map(source.properties.map((p) => [p.key, p.value]));
  return target.properties.every(({ key, value }) => {
    const sourceType = sourceProps.get(key);
    return sourceType && isTypeCompatible(sourceType, value, context);
  });
}

function narrowType(
  originalType: DataType,
  targetType: DataType,
  context: Context
): DataType | undefined {
  if (targetType.kind === "never") return { kind: "never" };
  if (originalType.kind === "unknown") return targetType;
  if (originalType.kind === "union") {
    const narrowedTypes = originalType.types.filter((t) => {
      if (targetType.kind === "object")
        return objectTypeMatch(t, targetType, context);
      return isTypeCompatible(t, targetType, context);
    });

    if (narrowedTypes.length === 0) return undefined;
    return resolveUnionType(narrowedTypes);
  }
  if (originalType.kind === "object" && targetType.kind === "object") {
    return objectTypeMatch(originalType, targetType, context)
      ? originalType
      : undefined;
  }
  return originalType;
}

function applyTypeNarrowing(
  context: Context,
  narrowedTypes: Context["variables"],
  data: IData,
  operation: IData<OperationType>
): Context["variables"] {
  if (!operation) return narrowedTypes;
  const param = operation.value.parameters[0];
  let narrowedType: DataType | undefined;
  let referenceName: string | undefined;

  if (isDataOfType(data, "reference")) {
    referenceName = data.value.name;
    const reference = context.variables.get(referenceName);
    if (reference) {
      const foundOp = getFilteredOperations(data, context).find(
        (op) => op.name === operation.value.name
      );

      if (foundOp?.narrowType) {
        const params = operation.value.parameters.map((p) =>
          getStatementResult(p, context)
        );
        const resolvedNarrowType =
          typeof foundOp.narrowType === "function"
            ? foundOp.narrowType(
                context,
                resolveReference(data, context),
                ...params
              )
            : foundOp.narrowType;

        if (resolvedNarrowType) {
          narrowedType = narrowType(
            reference.data.type,
            resolvedNarrowType,
            context
          );
        }
      }
    }
  }
  if (
    (operation.value.name === "or" || operation.value.name === "and") &&
    isDataOfType(param.data, "reference") &&
    param.operations[0]
  ) {
    const resultType = applyTypeNarrowing(
      context,
      new Map(
        operation.value.name === "or" ? context.variables : narrowedTypes
      ),
      param.data,
      param.operations[0]
    );
    referenceName = param.data.value.name;
    const types = [
      narrowedTypes.get(referenceName)?.data.type,
      resultType.get(referenceName)?.data.type,
    ].filter(Boolean) as DataType[];

    if (types.length > 0) narrowedType = resolveUnionType(types);
  }

  if (operation.value.name === "not") {
    narrowedTypes = getInverseTypes(context.variables, narrowedTypes, context);
  }

  if (referenceName) {
    const variable = context.variables.get(referenceName);
    if (variable) {
      narrowedTypes.set(referenceName, {
        ...variable,
        data: { ...variable.data, type: narrowedType ?? { kind: "never" } },
      });
    }
  }

  return narrowedTypes;
}
