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
  DictionaryType,
  TupleType,
  UnionType,
} from "./types";
import { InstanceTypes } from "./data";
import {
  createData,
  createStatement,
  createParamData,
  getStatementResult,
  getUnionActiveType,
  isDataOfType,
  isTypeCompatible,
  resolveUnionType,
  resolveReference,
  updateContextWithNarrowedTypes,
  createContextVariables,
  applyTypeNarrowing,
  asyncSort,
  getSkipExecution,
  resolveParameters,
  getRawValue,
} from "./utils";

const unknownOperations: OperationListItem[] = [
  {
    name: "isEqual",
    parameters: (data) => [{ type: { kind: "unknown" } }, { type: data.type }],
    handler: (context, data: IData, p1: IData) => {
      return createData({
        type: { kind: "boolean" },
        value:
          JSON.stringify(getRawValue(data, context)) ===
          JSON.stringify(getRawValue(p1, context)),
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
    handler: (context, data: IData<UnionType>, typeData: IData<UnionType>) => {
      return createData({
        type: { kind: "boolean" },
        value: isTypeCompatible(
          getUnionActiveType(data.type, data.value, context),
          getUnionActiveType(typeData.type, typeData.value, context)
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
    lazyHandler: async (
      context,
      data: IData<BooleanType>,
      trueStatement: IStatement
    ) => {
      if (!data.value) {
        return createData({ type: { kind: "boolean" }, value: false });
      }
      const result = await executeStatement(
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
    lazyHandler: async (
      context,
      data: IData<BooleanType>,
      falseStatement: IStatement
    ) => {
      if (data.value) {
        return createData({ type: { kind: "boolean" }, value: true });
      }
      const result = await executeStatement(
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
    lazyHandler: async (
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

      const trueResult = await executeStatement(...trueWithContext);
      const falseResult = falseWithContext
        ? await executeStatement(...falseWithContext)
        : createData({ type: { kind: "undefined" } });

      const resultType = resolveUnionType([trueResult.type, falseResult.type]);

      const selectedResult =
        !data.value && falseResult ? falseResult : trueResult;
      if (isDataOfType(selectedResult, "error")) return selectedResult;
      return createData({ type: resultType, value: selectedResult.value });
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
  {
    name: "localeCompare",
    parameters: [{ type: { kind: "string" } }, { type: { kind: "string" } }],
    handler: (_, data: IData<StringType>, p1: IData<StringType>) => {
      return createData({
        type: { kind: "number" },
        value: data.value.localeCompare(p1.value),
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

const getTupleOperations = (
  dataType: OperationType["parameters"][number]
): OperationListItem[] => [
  {
    name: "get",
    parameters: [dataType, { type: { kind: "number" } }],
    handler: (context, data: IData<ArrayType>, p1: IData<NumberType>) => {
      const item = data.value.at(p1.value);
      if (!item) return createData();
      const value = getStatementResult(item, context);
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
    name: "join",
    parameters: [dataType, { type: { kind: "string" } }],
    handler: (context, data: IData<ArrayType>, p1: IData<StringType>) => {
      return createData({
        type: { kind: "string" },
        value: data.value
          .map((item) => getStatementResult(item, context).value)
          .join(p1.value),
      });
    },
  },
];

const arrayOperations: OperationListItem[] = [
  ...getTupleOperations({
    type: { kind: "array", elementType: { kind: "unknown" } },
  }),
  {
    name: "concat",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "array", elementType: { kind: "unknown" } } },
    ],
    handler: (_, data: IData<ArrayType>, p1: IData<ArrayType>) => {
      const newArray = data.value.concat(p1.value);
      return createData({
        type: {
          kind: "array",
          elementType: resolveUnionType([
            data.type.elementType,
            p1.type.elementType,
          ]),
        },
        value: newArray,
      });
    },
  },
  {
    name: "map",
    parameters: getArrayCallbackParameters,
    handler: async (
      context,
      data: IData<ArrayType>,
      operation: IData<OperationType>
    ) => {
      const results = await executeArrayOperation(data, operation, context);
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
    handler: async (
      context,
      data: IData<ArrayType>,
      operation: IData<OperationType>
    ) => {
      const results = await executeArrayOperation(data, operation, context);
      const found = results.find((r) => Boolean(r.value));
      return createData({ type: found?.type, value: found?.value });
    },
  },
  {
    name: "filter",
    parameters: getArrayCallbackParameters,
    handler: async (
      context,
      data: IData<ArrayType>,
      operation: IData<OperationType>
    ) => {
      const results = await executeArrayOperation(data, operation, context);
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
    handler: async (
      context,
      data: IData<ArrayType>,
      operation: IData<OperationType>
    ) => {
      const sorted = await asyncSort(data.value, async (a, b) => {
        const result = await executeOperation(
          operationToListItem(operation),
          getStatementResult(a, context),
          [b],
          context
        );
        return Number(result.value) || 0;
      });
      return createData({ type: data.type, value: sorted });
    },
  },
];

const getObjectOperations = (
  dataType: OperationType["parameters"][number]
): OperationListItem[] => [
  {
    name: "get",
    parameters: [dataType, { type: { kind: "string" } }],
    handler: (
      context,
      data: IData<ObjectType | DictionaryType>,
      p1: IData<StringType>
    ) => {
      const item = data.value.get(p1.value);
      if (!item) return createData();
      const value = getStatementResult(item, context) as IData;
      return createData({ type: value.type, value: value.value });
    },
  },
  {
    name: "has",
    parameters: [dataType, { type: { kind: "string" } }],
    handler: (
      _,
      data: IData<ObjectType | DictionaryType>,
      p1: IData<StringType>
    ) => {
      return createData({
        type: { kind: "boolean" },
        value: data.value.has(p1.value),
      });
    },
  },
  {
    name: "keys",
    parameters: [dataType],
    handler: (_, data: IData<ObjectType | DictionaryType>) => {
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
    parameters: [dataType],
    handler: (context, data: IData<ObjectType | DictionaryType>) => {
      return createData({
        type: {
          kind: "array",
          elementType: resolveUnionType(
            isDataOfType(data, "object")
              ? Object.values(data.type.properties)
              : [(data.type as DictionaryType).elementType]
          ),
        },
        value: [...data.value.values()].map((item) => {
          const itemResult = getStatementResult(item, context) as IData;
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
  {
    name: "entries",
    parameters: [dataType],
    handler: (context, data: IData<ObjectType | DictionaryType>) => {
      const newValues = [...data.value.entries()].map(([key, value]) => {
        const valueResult = getStatementResult(value, context);
        return createStatement({
          data: createData({
            type: {
              kind: "tuple",
              elements: [{ kind: "string" }, valueResult.type],
            },
            value: [
              createStatement({
                data: createData({ type: { kind: "string" }, value: key }),
              }),
              createStatement({ data: valueResult }),
            ],
          }),
        });
      });

      const elementType = resolveUnionType(
        newValues.flatMap((v) => (v.data as IData<TupleType>).type.elements[1])
      );

      return createData({
        type: {
          kind: "array",
          elementType: {
            kind: "tuple",
            elements: [{ kind: "string" }, elementType],
          },
        },
        value: newValues,
      });
    },
  },
];

const dictionaryOperations: OperationListItem[] = [
  ...getObjectOperations({
    type: { kind: "dictionary", elementType: { kind: "unknown" } },
  }),
  {
    name: "merged",
    parameters: [
      { type: { kind: "dictionary", elementType: { kind: "unknown" } } },
      { type: { kind: "dictionary", elementType: { kind: "unknown" } } },
    ],
    handler: (_, data: IData<DictionaryType>, p1: IData<DictionaryType>) => {
      const newValue = new Map([...data.value, ...p1.value]);
      return createData({
        type: {
          kind: "dictionary",
          elementType: resolveUnionType([
            data.type.elementType,
            p1.type.elementType,
          ]),
        },
        value: newValue,
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
  ...getTupleOperations({ type: { kind: "tuple", elements: [] } }),
  ...arrayOperations,
  ...getObjectOperations({ type: { kind: "object", properties: {} } }),
  ...dictionaryOperations,
  ...operationOperations,
  ...unknownOperations,
  ...unionOperations,
];

async function executeArrayOperation(
  data: IData<ArrayType>,
  operation: IData<OperationType>,
  context: Context
): Promise<IData[]> {
  const settledResults = await Promise.allSettled(
    data.value.map((item, index) => {
      const itemData = getStatementResult(item, context);
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
    })
  );

  return settledResults.map((result) =>
    result.status === "fulfilled"
      ? result.value
      : createRuntimeError(result.reason)
  );
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
  context: Context
) => {
  if (data.type.kind === "never") return false;
  const operationParameters = resolveParameters(operationItem, data, context);
  const firstParam = operationParameters[0]?.type ?? { kind: "undefined" };
  if (isDataOfType(data, "instance") && firstParam.kind === "instance") {
    return firstParam.className === data.type.className;
  }
  return data.type.kind === "union" && firstParam.kind !== "union"
    ? data.type.types.every((t) => t.kind === firstParam.kind)
    : data.type.kind === firstParam.kind || firstParam.kind === "unknown";
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
        isTypeCompatible(newParam.data.type, prevParam.data.type) &&
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

  const result = newOperation.isManual
    ? createData({ type: { kind: "undefined" } })
    : await executeOperation(newOperation, data, newParameters, {
        ...context,
        operationId: _operationId,
      });

  if (!newOperation.isManual) {
    setResult(_operationId, {
      data: { ...result, id: _operationId },
      isPending: false,
    });
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

function createRuntimeError(error: unknown): IData {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return createData({
    type: { kind: "error", errorType: "runtime_error" },
    value: { reason: errorMessage },
  });
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
    await Promise.allSettled(
      data.value.constructorArgs.map((arg) => executeStatement(arg, context))
    );
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
  executeDataValue(statement.data, context);

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

    const _context: Context = {
      ...context,
      operationId: operation.id,
      narrowedTypes: narrowedTypes,
      skipExecution: getSkipExecution({
        context,
        data: resultData,
        operationName: operation.value.name,
      }),
    };

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
        !foundOp.isManual ||
        (foundOp.isManual &&
          resultType.kind !== "undefined" &&
          !existingResult);

      if (shouldExecute) {
        const result = await executeOperation(
          foundOp,
          resultData,
          operation.value.parameters,
          _context
        );
        operationResult = { ...result, id: operation.id };
      } else if (existingResult) {
        operationResult = existingResult;
      } else if (foundOp.isManual) {
        // For yet-to-execute manual operations, return an undefined type placeholder result.
        operationResult = createData({ type: { kind: "undefined" } });
      }
    }
    context.setResult?.(operation.id, {
      data: operationResult,
      isPending: false,
    });
    resultData = operationResult;
  }

  return resolveReference(resultData, context);
}

export async function setOperationResults(
  operation: IData<OperationType>,
  context: Context
): Promise<void> {
  const _context: Context = {
    getResult: context.getResult,
    getInstance: context.getInstance,
    setInstance: context.setInstance,
    setResult: context.setResult,
    variables: createContextVariables(
      operation.value.parameters,
      context,
      operation
    ),
  };
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
    const context: Context = {
      variables: new Map(prevContext.variables),
      getResult: prevContext.getResult,
      getInstance: prevContext.getInstance,
      setInstance: prevContext.setInstance,
    };
    const allInputs = [data, ...parameters];
    resolvedParams.forEach((_param, index) => {
      if (_param.name && allInputs[index]) {
        const param = { ...allInputs[index], type: _param.type };
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
