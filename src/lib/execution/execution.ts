import { nanoid } from "nanoid";
import {
  IData,
  IStatement,
  OperationType,
  DataType,
  ConditionType,
} from "@/lib/types";
import {
  createData,
  createStatement,
  createParamData,
  createInstance,
  getStatementResult,
  isBlockCondition,
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
  mergeNarrowedTypes,
  updateContextWithNarrowedTypes,
  getContextExpectedTypes,
  getCacheKey,
  getTypeSignature,
  getRawValueFromData,
  createRuntimeError,
  getFreeVariableNames,
} from "@/lib/utils";
import { OperationListItem, Context, Thenable } from "./types";
import {
  getOperationsForDataType,
  builtInOperationsByName,
} from "@/lib/operations/built-in";
import { MAX_CALL_DEPTH } from "../data";

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
  const builtInOps = getOperationsForDataType(data).filter((operation) =>
    dataSupportsOperation(data, operation, context)
  );

  const userDefinedOps = context.variables
    .entries()
    .reduce((acc, [name, variable]) => {
      if (!name || !isDataOfType(variable.data, "operation")) return acc;
      if (variable.data.id?.startsWith("builtin:")) return acc;
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

function findOperationByName(
  data: IData,
  context: Context,
  opName?: string
): OperationListItem | undefined {
  if (!opName) return undefined;
  const candidates = builtInOperationsByName.get(opName);
  if (candidates) {
    const resolved = resolveReference(data, context);
    return candidates.find((op) =>
      dataSupportsOperation(resolved, op, context)
    );
  }
  return getFilteredOperations(data, context).find((op) => op.name === opName);
}

function serializeMemoInput(data: IData, context: Context): unknown {
  if (isDataOfType(data, "instance")) {
    return {
      [data.value.className]: data.value.constructorArgs.map((arg) =>
        getRawValueFromData(getStatementResult(arg, context), context)
      ),
    };
  }
  return getRawValueFromData(data, context);
}

function getMemoKey(
  operation: OperationListItem,
  inputs: IData[],
  context: Context
) {
  if (!context.operationCache || !operation.id) return;
  const allInputs = [...inputs];
  const parameters = operation.parameters;
  if ("statements" in operation && Array.isArray(parameters)) {
    const paramNames = new Set(parameters.map((p) => p.name));
    const opData = createData({
      id: operation.id,
      type: { kind: "operation", parameters, result: { kind: "unknown" } },
      value: { statements: operation.statements, parameters: [] },
    });
    for (const name of getFreeVariableNames(opData, context)) {
      if (!paramNames.has(name)) {
        allInputs.push(context.variables.get(name)!.data);
      }
    }
  }
  if (!allInputs.every((p) => isMemoizableDataType(p.type))) return;
  const serializedInputs = allInputs.map((p) => serializeMemoInput(p, context));
  return operation.id + ":" + JSON.stringify(serializedInputs);
}

function getPersistentResultKey(
  context: Context,
  data: IData,
  operation: IData<OperationType>
) {
  return `persistent:${operation.id}:${JSON.stringify([
    serializeMemoInput(data, context),
    operation.value.parameters,
  ])}`;
}

function shouldExecutePreview(
  operation: OperationListItem,
  parameters: OperationType["parameters"]
) {
  if (operation.name === "call") return false;
  if ("statements" in operation) return false;
  if (operation.shouldCacheResult) return false;
  if (parameters.slice(1).some((param) => param.type.kind === "operation"))
    return false;
  return true;
}

function getPreviewFallbackType(operation: OperationListItem, data: IData) {
  if (operation.name === "call" && isDataOfType(data, "operation")) {
    return data.type.result;
  }
  if (operation.expectedType) {
    return typeof operation.expectedType === "function"
      ? operation.expectedType(data)
      : operation.expectedType;
  }
  return { kind: "unknown" } as DataType;
}

function setResult(
  context: Context,
  operation: IData<OperationType>,
  data: IData,
  persistentResultKey?: string,
  shouldCacheResult?: boolean
) {
  if (persistentResultKey && shouldCacheResult) {
    context.setResult(persistentResultKey, { data, shouldCacheResult });
  }
  context.setResult(getCacheKey(context, operation.id), { data });
}

function isMemoizableDataType(type: DataType): boolean {
  switch (type.kind) {
    case "union":
      return type.types.every(isMemoizableDataType);
    case "array":
    case "dictionary":
      return isMemoizableDataType(type.elementType);
    case "tuple":
      return type.elements.every(isMemoizableDataType);
    case "object":
      return type.properties.every((p) => isMemoizableDataType(p.value));
    case "instance":
      return type.constructorArgs.every((a) => isMemoizableDataType(a.type));
    case "number":
    case "string":
    case "boolean":
    case "undefined":
    case "unknown":
      return true;
    default:
      return false;
  }
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
  const _operationId = operationId ?? nanoid();
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

  const shouldPreview = shouldExecutePreview(newOperation, operationParameters);
  const fallbackType = getPreviewFallbackType(newOperation, data);
  const result = shouldPreview
    ? await executeOperation(newOperation, data, newParameters, context)
    : createData({ id: _operationId, type: fallbackType });

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
    return [setOperationResults(data, getOperationPreviewContext(context))];
  } else if (isDataOfType(data, "union")) {
    const activeType = getUnionActiveType(data.type, {
      value: data.value,
      context,
    });
    return executeDataValue(
      { ...data, type: activeType },
      getChildContext(context, { expectedType: activeType })
    );
  } else if (isDataOfType(data, "instance")) {
    const args = data.value.constructorArgs.map((arg, index) => {
      const expectedType = data.type.constructorArgs[index]?.type;
      const argContext = getChildContext(context, { index, expectedType });
      return _execute(
        arg,
        data.type.className === "Promise" && expectedType?.kind === "operation"
          ? { ...argContext, skipOperationHandlers: true }
          : argContext
      );
    });
    return [
      (context.isSync
        ? createThenable(args as IData[])
        : Promise.all(args)
      ).then((result) => {
        const existing = context.getInstance(data.value.instanceId);
        if (existing && data.value.constructorArgs.length === 0) return;
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

function getOperationPreviewContext(context: Context): Context {
  let variables: Context["variables"] | undefined;
  for (const [name, variable] of context.variables) {
    const data = variable.data;
    if (isDataOfType(data, "operation") && data.value.instanceId) {
      variables ??= new Map(context.variables);
      variables.set(name, {
        ...variable,
        data: createParamData({ type: data.type }),
      });
    }
  }
  return variables ? { ...context, variables } : context;
}

export function setOperationResults(
  operation: IData<OperationType>,
  _context: Context
): Thenable<void> {
  const { parameters, statements } = operation.value;
  const context = createContext(_context, {
    scopeId: operation.id,
    controlFlowState: {},
  });
  const allStatements = [...parameters, ...statements];
  const _execute = context.isSync ? executeStatementSync : executeStatement;

  function processStatement(statement: IStatement, index: number) {
    const statementContext =
      index < parameters.length
        ? getChildContext(_context, { index, enforceExpectedType: true })
        : context;
    const result = _execute(statement, statementContext);
    return (result instanceof Promise ? result : createThenable(result)).then(
      (resolved) => {
        if (context.controlFlowState?.returned) return;
        const variable = createContextVariable(
          statement,
          context,
          resolved,
          operation.type.parameters
        );
        if (variable && statement.name) {
          context.variables.set(statement.name, variable);
        }
      }
    );
  }

  if (context.isSync) {
    return allStatements.reduce(
      (chain, stmt, i) => chain.then(() => processStatement(stmt, i)),
      createThenable<void>(undefined)
    );
  }

  return (async () => {
    for (const [i, stmt] of allStatements.entries()) {
      if (context.isCancelled?.()) throw new Error("Execution cancelled");
      await processStatement(stmt, i);
    }
  })();
}

function executeStatementCore(
  context: Context,
  narrowed: Required<Context>["narrowedTypes"],
  data: IData,
  operation: IData<OperationType>,
  sourceData?: IData
): {
  _narrowedTypes: Required<Context>["narrowedTypes"];
  shouldCacheResult?: boolean;
  persistentResultKey?: string;
} & (
  | { result: IData; foundOp?: never; opCallContext?: never }
  | { foundOp: OperationListItem; opCallContext: Context; result?: never }
) {
  const opName = operation.value.name;
  const _narrowedTypes = applyTypeNarrowing(
    context,
    narrowed,
    sourceData ?? data,
    operation
  );
  const opCallContext = {
    ...context,
    narrowedTypes: _narrowedTypes,
    skipExecution: getSkipExecution({ context, data, operationName: opName }),
    _currentOperationId: operation.id,
  };
  const foundOp = findOperationByName(data, context, opName);
  opCallContext.setContext(operation.id, opCallContext);

  const params = foundOp && resolveParameters(foundOp, data, opCallContext);
  operation.value.parameters.forEach((param, index) => {
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
    const reason =
      opName && builtInOperationsByName.has(opName)
        ? `Cannot chain '${opName}' after '${kind}' type`
        : `Operation '${opName}' does not exist`;
    return {
      _narrowedTypes,
      result: createData({
        type: { kind: "error", errorType: "type_error" },
        value: { reason },
      }),
    };
  }
  const shouldCacheResult = foundOp.shouldCacheResult;
  const persistentResultKey = shouldCacheResult
    ? getPersistentResultKey(opCallContext, data, operation)
    : undefined;
  const result = persistentResultKey
    ? opCallContext.getResult(persistentResultKey)?.data
    : undefined;
  if (result) {
    if (
      !isDataOfType(result, "instance") ||
      !result.value.instanceId ||
      opCallContext.getInstance(result.value.instanceId)?.instance
    ) {
      return { _narrowedTypes, result, shouldCacheResult, persistentResultKey };
    }
  }
  if (opCallContext.skipExecution) {
    return {
      _narrowedTypes,
      shouldCacheResult,
      result: createData({ type: operation.type.result }),
    };
  }
  return {
    _narrowedTypes,
    opCallContext,
    foundOp,
    shouldCacheResult,
    persistentResultKey,
  };
}

function setStatementsSkipContext(statements: IStatement[], context: Context) {
  for (const statement of statements)
    context.setContext(statement.id, {
      ...context,
      skipExecution: { reason: "Unreachable branch", kind: "unreachable" },
    });
}

function executeStatements(statements: IStatement[], context: Context): IData {
  let lastResult: IData = createData();
  for (const stmt of statements) {
    lastResult = executeStatementSync(stmt, context);
    if (isFatalError(lastResult)) return lastResult;
    if (!context.controlFlowState?.returned) {
      const variable = createContextVariable(stmt, context, lastResult);
      if (variable && stmt.name) context.variables.set(stmt.name, variable);
    }
  }
  return context.controlFlowState?.returned ?? lastResult;
}

async function executeStatementsAsync(
  statements: IStatement[],
  context: Context
): Promise<IData> {
  let lastResult: IData = createData();
  for (const stmt of statements) {
    if (context.isCancelled?.()) throw new Error("Execution cancelled");
    lastResult = await executeStatement(stmt, context);
    if (isFatalError(lastResult)) return lastResult;
    if (!context.controlFlowState?.returned) {
      const variable = createContextVariable(stmt, context, lastResult);
      if (variable && stmt.name) context.variables.set(stmt.name, variable);
    }
  }
  return context.controlFlowState?.returned ?? lastResult;
}

function resolveConditionBranch(
  data: IData<ConditionType>,
  conditionResult: IData,
  ctx: Context
) {
  const { trueBranch, falseBranch, condition } = data.value;
  const branch = conditionResult.value ? trueBranch : falseBranch;
  const skipped = conditionResult.value ? falseBranch : trueBranch;
  const isBlock = isBlockCondition(data.value);
  const scopeId = `${ctx.scopeId}:${data.id}${conditionResult.value ? "_true" : "_false"}`;
  const branchCtx = isBlock ? createContext(ctx, { scopeId }) : ctx;

  let narrowedTypes = new Map() as Context["variables"];
  for (const op of condition.operations) {
    narrowedTypes = applyTypeNarrowing(ctx, narrowedTypes, condition.data, op);
  }

  if (narrowedTypes.size > 0) {
    const trueVariables = mergeNarrowedTypes(ctx.variables, narrowedTypes);
    const falseVariables = getInverseTypes(ctx.variables, narrowedTypes, ctx);

    setStatementsSkipContext(skipped, {
      ...ctx,
      variables: skipped === trueBranch ? trueVariables : falseVariables,
    });
    const newContext: Context = {
      ...branchCtx,
      variables: branch === trueBranch ? trueVariables : falseVariables,
    };
    return { branch, skipped, context: newContext };
  }

  setStatementsSkipContext(skipped, ctx);
  return { branch, skipped, context: branchCtx };
}

function branchAlwaysReturns(statements: IStatement[]): boolean {
  return statements.some((statement) => {
    if (statement.controlFlow === "return") return true;
    if (!isDataOfType(statement.data, "condition")) return false;
    return (
      branchAlwaysReturns(statement.data.value.trueBranch) &&
      branchAlwaysReturns(statement.data.value.falseBranch)
    );
  });
}

function carryBranchNarrowing(
  context: Context,
  resolved: ReturnType<typeof resolveConditionBranch>
) {
  if (
    context.controlFlowState?.returned ||
    !branchAlwaysReturns(resolved.skipped) ||
    branchAlwaysReturns(resolved.branch)
  ) {
    return;
  }

  for (const name of [...context.variables.keys()]) {
    const variable = resolved.context.variables.get(name);
    if (variable) context.variables.set(name, variable);
    else context.variables.delete(name);
  }
}

export async function executeStatement(
  statement: IStatement,
  context: Context
): Promise<IData> {
  if (context.controlFlowState?.returned) {
    context.setContext(statement.id, {
      ...context,
      skipExecution: { reason: "Returned above", kind: "unreachable" },
    });
    return context.controlFlowState.returned;
  }
  context.setContext(statement.id, context);
  if (context.isCancelled?.()) throw new Error("Execution cancelled");

  let currentData = resolveReference(statement.data, context);
  if (isDataOfType(currentData, "condition")) {
    const condRes = await executeStatement(
      currentData.value.condition,
      context
    );
    if (isFatalError(condRes)) return condRes;
    if (context.controlFlowState?.returned)
      return context.controlFlowState.returned;
    const resolved = resolveConditionBranch(currentData, condRes, context);
    const branchResult = await executeStatementsAsync(
      resolved.branch,
      resolved.context
    );
    carryBranchNarrowing(context, resolved);
    currentData = branchResult;
  }
  if (isFatalError(currentData)) return currentData;
  if (context.controlFlowState?.returned)
    return context.controlFlowState.returned;

  await Promise.allSettled(executeDataValue(statement.data, context));

  let narrowedTypes = new Map();
  let resultData = currentData;

  for (let i = 0; i < statement.operations.length; i++) {
    const operation = statement.operations[i];
    const {
      _narrowedTypes,
      foundOp,
      result,
      opCallContext,
      shouldCacheResult,
      persistentResultKey,
    } = executeStatementCore(
      context,
      narrowedTypes,
      resultData,
      operation,
      i === 0 ? statement.data : undefined
    );
    narrowedTypes = _narrowedTypes;

    if (result !== undefined) {
      setResult(context, operation, result);
      resultData = result;
      if (isFatalError(resultData)) return resultData;
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
    setResult(
      context,
      operation,
      opResult,
      persistentResultKey,
      shouldCacheResult
    );
    if (isFatalError(resultData)) return resultData;
  }
  const finalResult = resolveReference(resultData, context);
  if (statement.controlFlow === "return" && context.controlFlowState) {
    context.controlFlowState.returned = finalResult;
  }
  return finalResult;
}

export function executeStatementSync(
  statement: IStatement,
  context: Context
): IData {
  if (context.controlFlowState?.returned) {
    context.setContext(statement.id, {
      ...context,
      skipExecution: { reason: "Returned above", kind: "unreachable" },
    });
    return context.controlFlowState.returned;
  }
  context.setContext(statement.id, context);
  let currentData = resolveReference(statement.data, context);
  if (isDataOfType(currentData, "condition")) {
    const condRes = executeStatementSync(currentData.value.condition, context);
    if (isFatalError(condRes)) return condRes;
    if (context.controlFlowState?.returned)
      return context.controlFlowState.returned;
    const resolved = resolveConditionBranch(currentData, condRes, context);
    const branchResult = executeStatements(resolved.branch, resolved.context);
    carryBranchNarrowing(context, resolved);
    currentData = branchResult;
  }
  if (isFatalError(currentData)) return currentData;
  if (context.controlFlowState?.returned)
    return context.controlFlowState.returned;

  executeDataValue(statement.data, context).forEach((e) => {
    unwrapThenable(e);
  });

  let narrowedTypes = new Map();
  let resultData = currentData;

  for (let i = 0; i < statement.operations.length; i++) {
    const operation = statement.operations[i];
    const {
      _narrowedTypes,
      foundOp,
      result,
      opCallContext,
      shouldCacheResult,
      persistentResultKey,
    } = executeStatementCore(
      context,
      narrowedTypes,
      resultData,
      operation,
      i === 0 ? statement.data : undefined
    );
    narrowedTypes = _narrowedTypes;

    if (result !== undefined) {
      setResult(context, operation, result);
      resultData = result;
      if (isFatalError(resultData)) return resultData;
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
    setResult(
      context,
      operation,
      opResult,
      persistentResultKey,
      shouldCacheResult
    );
    if (isFatalError(resultData)) return resultData;
  }
  const finalResult = resolveReference(resultData, context);
  if (statement.controlFlow === "return" && context.controlFlowState) {
    context.controlFlowState.returned = finalResult;
  }
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

  if ("lazyHandler" in operation && !context.skipOperationHandlers) {
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
      const expectedType =
        p.isRest && p.type.kind === "array" ? p.type.elementType : p.type;
      const paramContext = getChildContext(context, { expectedType });
      return _execute(
        param,
        expectedType.kind === "operation" && context.skipOperationHandlers
          ? { ...paramContext, skipOperationHandlers: undefined }
          : paramContext
      );
    });
  });

  return (
    context.isSync
      ? createThenable(executedParams as IData[])
      : Promise.all(executedParams)
  ).then((parameters) => {
    if (context.isCancelled?.()) throw new Error("Execution cancelled");
    for (const [index, resolvedParam] of resolvedParams.slice(1).entries()) {
      const param =
        resolvedParam.isRest && "handler" in operation
          ? createData({
              value: parameters
                .slice(index)
                .map((data) => createStatement({ data })),
            })
          : parameters[index];
      const expectedType = resolvedParam.isOptional
        ? resolveUnionType([resolvedParam.type, { kind: "undefined" }])
        : resolvedParam.type;
      const hasFatalError = isFatalError(param);
      const isNativeOperationCall =
        operation.name === "call" &&
        isDataOfType(data, "operation") &&
        Boolean(data.value.instanceId);
      const typeMismatch =
        !isNativeOperationCall &&
        !isTypeCompatible(param.type, expectedType, context);
      if (hasFatalError || typeMismatch) {
        if (hasFatalError && operation.name === "call") return param;
        const incorrectType = isDataOfType(param, "error")
          ? (getRawValueFromData(param, context) as Error).message
          : getTypeSignature(param.type, context);
        return createData({
          type: { kind: "error", errorType: "type_error" },
          value: {
            reason: `Parameter #${index + 1} should be of type: \`${getTypeSignature(
              resolvedParams[index + 1].type,
              context
            )}\` but is of type: \`${incorrectType}\``,
          },
        });
      }
    }
    if (context.skipOperationHandlers) {
      return createData({ type: getPreviewFallbackType(operation, data) });
    }
    if ("handler" in operation) {
      try {
        return operation.handler(context, data, ...parameters);
      } catch (error) {
        return createRuntimeError(error);
      }
    }

    const nextCallDepth = (context.callDepth ?? 0) + 1;
    const maxCallDepth = context.maxCallDepth ?? MAX_CALL_DEPTH;
    if (maxCallDepth > 0 && nextCallDepth > maxCallDepth) {
      return createData({
        type: { kind: "error", errorType: "runtime_error" },
        value: { reason: `Maximum recursion depth (${maxCallDepth}) exceeded` },
      });
    }

    if (!("statements" in operation) || operation.statements.length <= 0) {
      return createData();
    }

    const memoCacheKey =
      resolvedParams.length > 0
        ? getMemoKey(operation, [data, ...parameters], context)
        : undefined;
    const hit = memoCacheKey && context.operationCache?.get(memoCacheKey);
    if (hit) return hit;

    const newContext = createContext(context, {
      scopeId: `${operation.id}:${nanoid()}`,
      isIsolated: true,
      callDepth: nextCallDepth,
      controlFlowState: {},
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
    if (memoCacheKey) newContext._memoCacheKey = memoCacheKey;
    return newContext;
  });
}

export async function executeOperation(
  ...args: Parameters<typeof executeOperationCore>
): Promise<IData> {
  const [operation, , , context] = args;
  if (context.isCancelled?.()) throw new Error("Execution cancelled");
  const result = await executeOperationCore(...args);
  if ("type" in result) return result;
  if (!("statements" in operation)) return createData();
  const lastResult = await executeStatementsAsync(operation.statements, result);

  const cacheKey = result._memoCacheKey;
  delete result._memoCacheKey;
  if (cacheKey) result.operationCache?.set(cacheKey, lastResult);

  return lastResult;
}

export function executeOperationSync(
  ...args: Parameters<typeof executeOperationCore>
): IData {
  const [operation] = args;
  const result = unwrapThenable(executeOperationCore(...args));
  if (result && "type" in result) return result;
  if (!("statements" in operation)) return createData();
  const lastResult = executeStatements(operation.statements, result);

  const cacheKey = result._memoCacheKey;
  delete result._memoCacheKey;
  if (cacheKey) result.operationCache?.set(cacheKey, lastResult);

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
      const foundOp = findOperationByName(data, context, operation.value.name);

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

  if (referenceName && narrowedType !== undefined) {
    const variable = context.variables.get(referenceName);
    if (variable) {
      narrowedTypes.set(referenceName, {
        ...variable,
        data: { ...variable.data, type: narrowedType },
      });
    }
  }

  return narrowedTypes;
}
