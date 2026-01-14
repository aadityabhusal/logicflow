import { nanoid } from "nanoid";
import {
  IData,
  IStatement,
  OperationType,
  StringType,
  ArrayType,
  NumberType,
  Context,
  BooleanType,
  ObjectType,
  OperationListItem,
} from "./types";
import {
  createData,
  createStatement,
  createVariableName,
  getStatementResult,
  inferTypeFromValue,
  isDataOfType,
  isTypeCompatible,
  resolveUnionType,
  resolveReference,
  updateContextWithNarrowedTypes,
} from "./utils";

const unknownOperations: OperationListItem[] = [
  {
    name: "isEqual",
    parameters: (data) => [{ type: { kind: "unknown" } }, { type: data.type }],
    handler: (_, data: IData, p1: IData) => {
      return createData({
        type: { kind: "boolean" },
        value: JSON.stringify(data.value) === JSON.stringify(p1.value),
      });
    },
  },
  {
    name: "toString",
    parameters: [{ type: { kind: "unknown" } }],
    handler: (_, data: IData<StringType>) => {
      return createData({
        type: { kind: "string" },
        value: JSON.stringify(data.value),
      });
    },
  },
  // TODO: add isTypeOf operation for unknown type here. Or maybe separate operations accepting 'unknown' and 'any' type.
];

const unionOperations: OperationListItem[] = [
  {
    name: "isTypeOf",
    parameters: (data) => [
      {
        type: {
          kind: "union",
          types: isDataOfType(data, "union") ? data.type.types : [],
        },
      },
      { type: data.type },
    ],
    handler: (_, data: IData, typeData: IData) => {
      return createData({
        type: { kind: "boolean" },
        value: isTypeCompatible(
          inferTypeFromValue(data.value),
          inferTypeFromValue(typeData.value)
        ),
      });
    },
  },
];

const undefinedOperations: OperationListItem[] = [];

const booleanOperations: OperationListItem[] = [
  {
    name: "and",
    parameters: [{ type: { kind: "boolean" } }, { type: { kind: "unknown" } }],
    lazyHandler: (
      context,
      data: IData<BooleanType>,
      trueStatement: IStatement
    ) => {
      if (!data.value) {
        return createData({ type: { kind: "boolean" }, value: false });
      }
      const result = executeStatement(
        trueStatement,
        updateContextWithNarrowedTypes(context, data)
      );
      if (isDataOfType(result, "error")) return result;
      return createData({
        type: { kind: "boolean" },
        value: Boolean(result.value),
      });
    },
  },
  {
    name: "or",
    parameters: [{ type: { kind: "boolean" } }, { type: { kind: "unknown" } }],
    lazyHandler: (
      context,
      data: IData<BooleanType>,
      falseStatement: IStatement
    ) => {
      if (data.value) {
        return createData({ type: { kind: "boolean" }, value: true });
      }
      const result = executeStatement(
        falseStatement,
        updateContextWithNarrowedTypes(context, data)
      );
      if (isDataOfType(result, "error")) return result;
      return createData({
        type: { kind: "boolean" },
        value: Boolean(result.value),
      });
    },
  },
  {
    name: "not",
    parameters: [{ type: { kind: "boolean" } }],
    handler: (_, data: IData<BooleanType>) => {
      return createData({ type: { kind: "boolean" }, value: !data.value });
    },
  },
  {
    name: "thenElse",
    parameters: [
      { type: { kind: "boolean" } },
      { type: { kind: "unknown" } },
      { type: { kind: "unknown" }, isOptional: true },
    ],
    lazyHandler: (
      context,
      data: IData<BooleanType>,
      trueBranch: IStatement,
      falseBranch?: IStatement
    ) => {
      const trueWithContext = [
        trueBranch,
        updateContextWithNarrowedTypes(context, data, "thenElse"),
      ] as const;
      const falseWithContext = falseBranch
        ? ([
            falseBranch,
            updateContextWithNarrowedTypes(context, data, "thenElse", 1),
          ] as const)
        : undefined;
      const resultType = resolveUnionType([
        executeStatement(...trueWithContext).type,
        ...(falseWithContext
          ? [executeStatement(...falseWithContext).type]
          : []),
      ]);
      const selectedBranch =
        !data.value && falseWithContext ? falseWithContext : trueWithContext;
      const executedResult = executeStatement(...selectedBranch);
      if (isDataOfType(executedResult, "error")) return executedResult;
      return createData({ type: resultType, value: executedResult.value });
    },
  },
];

const stringOperations: OperationListItem[] = [
  {
    name: "getLength",
    parameters: [{ type: { kind: "string" } }],
    handler: (_, data: IData<StringType>) => {
      return createData({
        type: { kind: "number" },
        value: data.value.length,
      });
    },
  },
  {
    name: "concat",
    parameters: [{ type: { kind: "string" } }, { type: { kind: "string" } }],
    handler: (_, data: IData<StringType>, p1: IData<StringType>) => {
      return createData({
        type: { kind: "string" },
        value: data.value.concat(p1.value),
      });
    },
  },
  {
    name: "includes",
    parameters: [{ type: { kind: "string" } }, { type: { kind: "string" } }],
    handler: (_, data: IData<StringType>, p1: IData<StringType>) => {
      return createData({
        type: { kind: "boolean" },
        value: data.value.includes(p1.value),
      });
    },
  },
  {
    name: "slice",
    parameters: [
      { type: { kind: "string" } },
      { type: { kind: "number" } },
      { type: { kind: "number" } },
    ],
    handler: (
      _,
      data: IData<StringType>,
      p1: IData<NumberType>,
      p2: IData<NumberType>
    ) => {
      return createData({
        type: { kind: "string" },
        value: data.value.slice(p1.value, p2.value),
      });
    },
  },
  {
    name: "split",
    parameters: [{ type: { kind: "string" } }, { type: { kind: "string" } }],
    handler: (_, data: IData<StringType>, p1: IData<StringType>) => {
      return createData({
        type: { kind: "array", elementType: { kind: "string" } },
        value: data.value.split(p1.value).map((item) =>
          createStatement({
            data: createData({ type: { kind: "string" }, value: item }),
          })
        ),
      });
    },
  },
  {
    name: "toUpperCase",
    parameters: [{ type: { kind: "string" } }],
    handler: (_, data: IData<StringType>) => {
      return createData({
        type: { kind: "string" },
        value: data.value.toUpperCase(),
      });
    },
  },
  {
    name: "toLowerCase",
    parameters: [{ type: { kind: "string" } }],
    handler: (_, data: IData<StringType>) => {
      return createData({
        type: { kind: "string" },
        value: data.value.toLowerCase(),
      });
    },
  },
];

const numberOperations: OperationListItem[] = [
  {
    name: "add",
    parameters: [{ type: { kind: "number" } }, { type: { kind: "number" } }],
    handler: (_, data: IData<NumberType>, p1: IData<NumberType>) => {
      return createData({
        type: { kind: "number" },
        value: data.value + p1.value,
      });
    },
  },
  {
    name: "subtract",
    parameters: [{ type: { kind: "number" } }, { type: { kind: "number" } }],
    handler: (_, data: IData<NumberType>, p1: IData<NumberType>) => {
      return createData({
        type: { kind: "number" },
        value: data.value - p1.value,
      });
    },
  },
  {
    name: "multiply",
    parameters: [{ type: { kind: "number" } }, { type: { kind: "number" } }],
    handler: (_, data: IData<NumberType>, p1: IData<NumberType>) => {
      return createData({
        type: { kind: "number" },
        value: data.value * p1.value,
      });
    },
  },
  {
    name: "divide",
    parameters: [{ type: { kind: "number" } }, { type: { kind: "number" } }],
    handler: (_, data: IData<NumberType>, p1: IData<NumberType>) => {
      if (p1.value === 0) {
        return createData({
          type: { kind: "error", errorType: "runtime_error" },
          value: { reason: "Division by zero" },
        });
      }
      return createData({
        type: { kind: "number" },
        value: data.value / p1.value,
      });
    },
  },
  {
    name: "power",
    parameters: [{ type: { kind: "number" } }, { type: { kind: "number" } }],
    handler: (_, data: IData<NumberType>, p1: IData<NumberType>) => {
      return createData({
        type: { kind: "number" },
        value: Math.pow(data.value, p1.value),
      });
    },
  },
  {
    name: "mod",
    parameters: [{ type: { kind: "number" } }, { type: { kind: "number" } }],
    handler: (_, data: IData<NumberType>, p1: IData<NumberType>) => {
      if (p1.value === 0) {
        return createData({
          type: { kind: "error", errorType: "runtime_error" },
          value: { reason: "Modulo by zero" },
        });
      }
      return createData({
        type: { kind: "number" },
        value: data.value % p1.value,
      });
    },
  },
  {
    name: "lessThan",
    parameters: [{ type: { kind: "number" } }, { type: { kind: "number" } }],
    handler: (_, data: IData<NumberType>, p1: IData<typeof data.type>) =>
      createData({ type: { kind: "boolean" }, value: data.value < p1.value }),
  },
  {
    name: "lessThanOrEqual",
    parameters: [{ type: { kind: "number" } }, { type: { kind: "number" } }],
    handler: (_, data: IData<NumberType>, p1: IData<typeof data.type>) =>
      createData({ type: { kind: "boolean" }, value: data.value <= p1.value }),
  },
  {
    name: "greaterThan",
    parameters: [{ type: { kind: "number" } }, { type: { kind: "number" } }],
    handler: (_, data: IData<NumberType>, p1: IData<typeof data.type>) =>
      createData({ type: { kind: "boolean" }, value: data.value > p1.value }),
  },
  {
    name: "greaterThanOrEqual",
    parameters: [{ type: { kind: "number" } }, { type: { kind: "number" } }],
    handler: (_, data: IData<NumberType>, p1: IData<typeof data.type>) =>
      createData({ type: { kind: "boolean" }, value: data.value >= p1.value }),
  },
  {
    name: "toRange",
    parameters: [{ type: { kind: "number" } }, { type: { kind: "number" } }],
    handler: (_, data: IData<NumberType>, p1: IData<NumberType>) => {
      const rev = data.value > p1.value;
      const [start, end] = rev
        ? [p1.value, data.value]
        : [data.value, p1.value];
      return createData({
        type: { kind: "array", elementType: { kind: "number" } },
        value: Array.from(Array(end - start).keys()).map((value) =>
          createStatement({
            data: createData({
              type: { kind: "number" },
              value: rev ? end - value : start + value,
            }),
          })
        ),
      });
    },
  },
];

const arrayOperations: OperationListItem[] = [
  {
    name: "get",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "number" } },
    ],
    handler: (_, data: IData<ArrayType>, p1: IData<NumberType>) => {
      const item = data.value.at(p1.value);
      if (!item) return createData();
      const value = getStatementResult(item) as IData;
      return createData({ type: value.type, value: value.value });
    },
  },
  {
    name: "getLength",
    parameters: [{ type: { kind: "array", elementType: { kind: "unknown" } } }],
    handler: (_, data: IData<ArrayType>) => {
      return createData({ type: { kind: "number" }, value: data.value.length });
    },
  },
  {
    name: "concat",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "array", elementType: { kind: "unknown" } } },
    ],
    handler: (_, data: IData<ArrayType>, p1: IData<ArrayType>) => {
      return createData({
        type: { kind: "array", elementType: { kind: "unknown" } },
        value: data.value.concat(p1.value),
      });
    },
  },
  {
    name: "join",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "string" } },
    ],
    handler: (_, data: IData<ArrayType>, p1: IData<StringType>) => {
      return createData({
        type: { kind: "string" },
        value: data.value
          .map((item) => getStatementResult(item).value)
          .join(p1.value),
      });
    },
  },
  {
    name: "map",
    parameters: getArrayCallbackParameters,
    handler: (
      context,
      data: IData<ArrayType>,
      operation: IData<OperationType>
    ) => {
      const results = executeArrayOperation(data, operation, context);
      return createData({
        type: {
          kind: "array",
          elementType: resolveUnionType(results.map((r) => r.type)),
        },
        value: results.map((r) => createStatement({ data: r })),
      });
    },
  },
  {
    name: "find",
    parameters: getArrayCallbackParameters,
    handler: (
      context,
      data: IData<ArrayType>,
      operation: IData<OperationType>
    ) => {
      const results = executeArrayOperation(data, operation, context);
      const found = results.find((r) => Boolean(r.value));
      return createData({ type: found?.type, value: found?.value });
    },
  },
  {
    name: "filter",
    parameters: getArrayCallbackParameters,
    handler: (
      context,
      data: IData<ArrayType>,
      operation: IData<OperationType>
    ) => {
      const results = executeArrayOperation(data, operation, context);
      const filtered = data.value.filter((_, i) => Boolean(results[i].value));
      return createData({ type: data.type, value: filtered });
    },
  },
  {
    name: "sort",
    parameters: (data) => [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      {
        type: {
          kind: "operation",
          parameters: isDataOfType(data, "array")
            ? [
                { name: "first", type: data.type.elementType },
                { name: "second", type: data.type.elementType },
              ]
            : [],
          result: { kind: "unknown" },
        },
      },
    ],
    handler: (
      context,
      data: IData<ArrayType>,
      operation: IData<OperationType>
    ) => {
      const sorted = data.value.toSorted((a, b) => {
        const result = executeOperation(
          operationToListItem(operation),
          getStatementResult(a),
          [b],
          context
        );
        return result.value ? -1 : 1;
      });
      return createData({ type: data.type, value: sorted });
    },
  },
];

const objectOperations: OperationListItem[] = [
  {
    name: "get",
    parameters: [
      { type: { kind: "object", properties: {} } },
      { type: { kind: "string" } },
    ],
    handler: (_, data: IData<ObjectType>, p1: IData<StringType>) => {
      const item = data.value.get(p1.value);
      if (!item) return createData();
      const value = getStatementResult(item) as IData;
      return createData({ type: value.type, value: value.value });
    },
  },
  {
    name: "has",
    parameters: [
      { type: { kind: "object", properties: {} } },
      { type: { kind: "string" } },
    ],
    handler: (_, data: IData<ObjectType>, p1: IData<StringType>) => {
      return createData({
        type: { kind: "boolean" },
        value: data.value.has(p1.value),
      });
    },
  },
  {
    name: "keys",
    parameters: [{ type: { kind: "object", properties: {} } }],
    handler: (_, data: IData<ObjectType>) => {
      return createData({
        type: { kind: "array", elementType: { kind: "string" } },
        value: [...data.value.keys()].map((item) =>
          createStatement({
            data: createData({ type: { kind: "string" }, value: item }),
          })
        ),
      });
    },
  },
  {
    name: "values",
    parameters: [{ type: { kind: "object", properties: {} } }],
    handler: (_, data: IData<ObjectType>) => {
      return createData({
        type: {
          kind: "array",
          elementType: resolveUnionType(Object.values(data.type.properties)),
        },
        value: [...data.value.values()].map((item) => {
          const itemResult = getStatementResult(item) as IData;
          return createStatement({
            data: createData({
              type: itemResult.type,
              value: itemResult.value,
            }),
          });
        }),
      });
    },
  },
];

const operationOperations: OperationListItem[] = [
  {
    name: "call",
    parameters: (data) => [
      {
        type: {
          kind: "operation",
          parameters: isDataOfType(data, "operation")
            ? data.type.parameters
            : [],
          result: { kind: "unknown" },
        },
      },
      ...(isDataOfType(data, "operation") ? data.type.parameters : []),
    ],
    handler: (context, data: IData<OperationType>, ...p: IData[]) => {
      return executeOperation(
        operationToListItem(data, "call"),
        p[0],
        p.slice(1).map((data) => createStatement({ data })),
        context
      );
    },
  },
];

export const builtInOperations: OperationListItem[] = [
  ...undefinedOperations,
  ...stringOperations,
  ...numberOperations,
  ...booleanOperations,
  ...arrayOperations,
  ...objectOperations,
  ...operationOperations,
  ...unknownOperations,
  ...unionOperations,
];

function executeArrayOperation(
  data: IData<ArrayType>,
  operation: IData<OperationType>,
  context: Context
): IData[] {
  return data.value.map((item, index) => {
    const itemData = getStatementResult(item);
    return executeOperation(
      operationToListItem({
        ...operation,
        type: {
          ...operation.type,
          parameters: [
            { type: data.type.elementType },
            ...operation.type.parameters,
          ],
        },
      }),
      data,
      [
        createStatement({ data: createData(itemData), isOptional: true }),
        createStatement({
          data: createData({ type: { kind: "number" }, value: index }),
          isOptional: true,
        }),
        createStatement({ data }),
      ],
      context
    );
  });
}

function getArrayCallbackParameters(data: IData) {
  const elementType = (data.type as ArrayType).elementType ?? {
    kind: "undefined",
  };
  return [
    { type: { kind: "array", elementType: { kind: "unknown" } } },
    {
      type: {
        kind: "operation",
        parameters: [
          { name: "item", type: elementType },
          { name: "index", type: { kind: "number" }, isOptional: true },
          {
            name: "arr",
            type: { kind: "array", elementType },
            isOptional: true,
          },
        ],
        result: { kind: "unknown" },
      },
    },
  ] as OperationType["parameters"];
}

/* Operation List */

function operationToListItem(operation: IData<OperationType>, name?: string) {
  return {
    name: name ?? operation.value.name ?? "anonymous",
    parameters: operation.type.parameters,
    statements: operation.value.statements,
  } as OperationListItem;
}

const dataSupportsOperation = (
  data: IData,
  operationItem: OperationListItem,
  variables: Context["variables"]
) => {
  if (data.type.kind === "never") return false;
  const operationParameters = resolveParameters(operationItem, data, variables);
  const firstParam = operationParameters[0]?.type ?? { kind: "undefined" };
  return data.type.kind === "union" && firstParam.kind !== "union"
    ? data.type.types.every((t) => t.kind === firstParam.kind)
    : data.type.kind === firstParam.kind || firstParam.kind === "unknown";
};

type FilteredOperationsReturn<T extends boolean> = T extends true
  ? [string, OperationListItem[]][]
  : OperationListItem[];
export function getFilteredOperations<T extends boolean = false>(
  _data: IData,
  variables: Context["variables"],
  grouped?: T
): FilteredOperationsReturn<T> {
  const data = resolveReference(_data, variables);
  const builtInOps = builtInOperations.filter((operation) => {
    return dataSupportsOperation(data, operation, variables);
  });

  const userDefinedOps = variables.entries().reduce((acc, [name, variable]) => {
    if (!name || !isDataOfType(variable.data, "operation")) return acc;
    if (
      dataSupportsOperation(
        data,
        operationToListItem(variable.data, name),
        variables
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

export function resolveParameters(
  operationListItem: OperationListItem,
  _data: IData,
  variables: Context["variables"]
) {
  const data = resolveReference(_data, variables);
  const params =
    typeof operationListItem.parameters === "function"
      ? operationListItem.parameters(data)
      : operationListItem.parameters;
  return params.map((param) => {
    if (param.isOptional)
      return {
        ...param,
        type: resolveUnionType([param.type, { kind: "undefined" }]),
      };
    return param;
  });
}

export function createParamData(
  item: OperationType["parameters"][number],
  data: IData
): IStatement["data"] {
  if (item.type.kind !== "operation") {
    return createData({ type: item.type || data.type });
  }

  const parameters = item.type.parameters
    .filter((param) => !param.isOptional)
    .reduce((prev, paramSpec) => {
      prev.push(
        createStatement({
          name: paramSpec.name ?? createVariableName({ prefix: "param", prev }),
          data: createParamData({ type: paramSpec.type }, data),
          isOptional: paramSpec.isOptional,
        })
      );
      return prev;
    }, [] as IStatement[]);

  return createData({
    type: {
      kind: "operation",
      parameters: item.type.parameters,
      result: { kind: "undefined" },
    },
    value: { parameters: parameters, statements: [] },
  });
}

export function createOperationCall({
  data: _data,
  name,
  parameters,
  context,
}: {
  data: IData;
  name?: string;
  parameters?: IStatement[];
  context: Context;
}): IData<OperationType> {
  const data = resolveReference(_data, context.variables);
  const operations = getFilteredOperations(data, context.variables);
  const operationByName = operations.find(
    (operation) => operation.name === name
  );
  const newOperation = operationByName || operations[0];
  const operationParameters = resolveParameters(
    newOperation,
    data,
    context.variables
  );
  const newParameters = operationParameters
    .slice(1)
    .filter((param) => !param?.isOptional)
    .map((item, index) => {
      const newParam = createStatement({
        data: createParamData(item, data),
        isOptional: item.isOptional,
      });
      const prevParam = parameters?.[index];
      if (
        prevParam &&
        isTypeCompatible(newParam.data.type, prevParam.data.type) &&
        isTypeCompatible(newParam.data.type, getStatementResult(prevParam).type)
      ) {
        return prevParam;
      }
      return newParam;
    });
  const result = executeOperation(newOperation, data, newParameters, context);

  return {
    id: nanoid(),
    type: {
      kind: "operation",
      parameters: operationParameters,
      result: result.type,
    },
    value: {
      name: newOperation.name,
      parameters: newParameters,
      statements: [],
      result,
    },
  };
}

/* Execution */

function buildExecutionContext(
  operation: OperationListItem,
  data: IData,
  parameters: IData[], // This is only for operations with statements so parameters are an array of data
  prevContext: Context
): Context {
  const context = { variables: new Map(prevContext.variables) };
  const operationListItemParams = resolveParameters(
    operation,
    data,
    prevContext.variables
  );
  if (operationListItemParams[0]?.name) {
    const resolved = resolveReference(data, prevContext.variables);
    context.variables.set(operationListItemParams[0].name, {
      data: resolved,
      reference: isDataOfType(data, "reference") ? data.value : undefined,
    });
  }
  operationListItemParams.slice(1).forEach((param, index) => {
    if (param.name && parameters[index]) {
      const _parameter = { ...parameters[index], type: param.type };
      const resolved = resolveReference(_parameter, prevContext.variables);
      context.variables.set(param.name, {
        data: resolved,
        reference: isDataOfType(_parameter, "reference")
          ? _parameter.value
          : undefined,
      });
    }
  });
  return context;
}

export function executeStatement(
  statement: IStatement,
  context: Context
): IData {
  let currentData = resolveReference(statement.data, context.variables);
  if (isDataOfType(currentData, "error")) return currentData;

  if (isDataOfType(currentData, "condition")) {
    const conditionValue = currentData.value;
    const conditionResult = executeStatement(conditionValue.condition, context);
    if (isDataOfType(conditionResult, "error")) return conditionResult;
    currentData = executeStatement(
      conditionResult.value ? conditionValue.true : conditionValue.false,
      context
    );
    if (isDataOfType(currentData, "error")) return currentData;
  }

  const result = statement.operations.reduce((acc, operation) => {
    if (isDataOfType(acc, "error")) return acc;
    const foundOp = builtInOperations.find(
      (op) => op.name === operation.value.name
    );
    if (foundOp) {
      const operationResult = executeOperation(
        foundOp,
        acc,
        operation.value.parameters,
        context
      );
      return operationResult;
    } else if (operation.value.result) {
      return operation.value.result;
    }
    return acc;
  }, currentData);
  return result;
}

function createRuntimeError(error: unknown): IData {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return createData({
    type: { kind: "error", errorType: "runtime_error" },
    value: { reason: `Runtime error: ${errorMessage}` },
  });
}

export function executeOperation(
  operation: OperationListItem,
  _data: IData,
  _parameters: IStatement[],
  prevContext: Context
): IData {
  if (prevContext.skipExecution) return createData();
  const data = resolveReference(_data, prevContext.variables);
  if (
    isDataOfType(data, "error") &&
    !dataSupportsOperation(data, operation, prevContext.variables)
  ) {
    return data;
  }

  if ("lazyHandler" in operation) {
    try {
      return operation.lazyHandler(prevContext, data, ..._parameters);
    } catch (error) {
      return createRuntimeError(error);
    }
  }

  const resolvedParams = resolveParameters(
    operation,
    data,
    prevContext.variables
  );
  const parameters = resolvedParams.slice(1).map((p, index) => {
    const hasParam = structuredClone(_parameters[index]);
    if (!hasParam)
      return createData({
        type: resolveUnionType([p.type, { kind: "undefined" }]),
        value: undefined,
      });
    return executeStatement(hasParam, prevContext);
  });
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
      return operation.handler(prevContext, data, ...parameters);
    } catch (error) {
      return createRuntimeError(error);
    }
  }

  if ("statements" in operation && operation.statements.length > 0) {
    const context = buildExecutionContext(
      operation,
      data,
      parameters,
      prevContext
    );
    let lastResult: IData = createData();
    for (const statement of operation.statements) {
      lastResult = executeStatement(statement, context);
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
