import {
  IData,
  IStatement,
  OperationType,
  StringType,
  ArrayType,
  NumberType,
  BooleanType,
  ObjectType,
  OperationListItem,
  DictionaryType,
  TupleType,
  UnionType,
  InstanceDataType,
  Context,
} from "./types";
import { InstanceTypes } from "./data";
import {
  createData,
  createStatement,
  getStatementResult,
  getUnionActiveType,
  isDataOfType,
  isTypeCompatible,
  resolveUnionType,
  updateContextWithNarrowedTypes,
  getRawValueFromData,
  operationToListItem,
  createDataFromRawValue,
} from "./utils";

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

async function executeArrayOperation(
  data: IData<ArrayType>,
  operation: IData<OperationType>,
  context: Context
): Promise<IData[]> {
  const settledResults = await Promise.allSettled(
    data.value.map((item, index) => {
      const itemData = getStatementResult(item, context);
      return context.executeOperation(
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

export function createRuntimeError(error: unknown): IData {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return createData({
    type: { kind: "error", errorType: "runtime_error" },
    value: { reason: errorMessage },
  });
}

async function asyncSort<T>(
  arr: T[],
  compare: (a: T, b: T) => Promise<number>
): Promise<T[]> {
  if (arr.length <= 1) return [...arr];
  const mid = Math.floor(arr.length / 2);
  const left = await asyncSort(arr.slice(0, mid), compare);
  const right = await asyncSort(arr.slice(mid), compare);

  const sorted: T[] = [];
  let l = 0;
  let r = 0;
  while (l < left.length && r < right.length) {
    if ((await compare(left[l], right[r])) <= 0) {
      sorted.push(left[l++]);
    } else {
      sorted.push(right[r++]);
    }
  }
  return [...sorted, ...left.slice(l), ...right.slice(r)];
}

const unknownOperations: OperationListItem[] = [
  {
    name: "isEqual",
    parameters: (data) => [{ type: { kind: "unknown" } }, { type: data.type }],
    handler: (context, data: IData, p1: IData) => {
      return createData({
        type: { kind: "boolean" },
        value:
          JSON.stringify(getRawValueFromData(data, context)) ===
          JSON.stringify(getRawValueFromData(p1, context)),
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
      const result = await context.executeStatement(trueStatement, {
        ...context,
        ...updateContextWithNarrowedTypes(context, data),
      });
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
      const result = await context.executeStatement(falseStatement, {
        ...context,
        ...updateContextWithNarrowedTypes(context, data),
      });
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
        {
          ...context,
          ...updateContextWithNarrowedTypes(context, data, "thenElse"),
        },
      ] as const;
      const falseWithContext = falseBranch
        ? ([
            falseBranch,
            {
              ...context,
              ...updateContextWithNarrowedTypes(context, data, "thenElse", 1),
            },
          ] as const)
        : undefined;

      const trueResult = await context.executeStatement(...trueWithContext);
      const falseResult = falseWithContext
        ? await context.executeStatement(...falseWithContext)
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
        const result = await context.executeOperation(
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
    handler: async (context, data: IData<OperationType>, ...p: IData[]) => {
      const jsCallback = context.getInstance(`${data.id}-operation`);
      if (typeof jsCallback === "function") {
        const rawArgs = p.map((param) => getRawValueFromData(param, context));
        try {
          const result = await jsCallback(...rawArgs);
          return createDataFromRawValue(result, context, data.type.result.kind);
        } catch (error) {
          return createRuntimeError(error);
        }
      }

      return context.executeOperation(
        operationToListItem(data, "call"),
        p[0],
        p.slice(1).map((data) => createStatement({ data })),
        context
      );
    },
  },
];

type InstanceValue<T extends keyof typeof InstanceTypes> = InstanceType<
  (typeof InstanceTypes)[T]["Constructor"]
>;
function createInstanceOperation<T extends keyof typeof InstanceTypes>(
  className: T,
  name: string,
  method: (instance: InstanceValue<T>, context: Context) => Partial<IData>,
  parameters: OperationListItem["parameters"] = []
): OperationListItem {
  return {
    name,
    parameters: (data) => [
      { type: { kind: "instance", className, constructorArgs: [] } },
      ...(typeof parameters === "function" ? parameters(data) : parameters),
    ],
    handler: (context, data: IData<InstanceDataType>) => {
      const instance = getRawValueFromData(data, context) as InstanceValue<T>;
      if (!instance) {
        return createRuntimeError(`${className} instance not found`);
      }
      return createData(method(instance, context));
    },
  };
}

const dateOperations: OperationListItem[] = [
  createInstanceOperation("Date", "getFullYear", (instance) => ({
    type: { kind: "number" },
    value: instance.getFullYear(),
  })),
  createInstanceOperation("Date", "getMonth", (instance) => ({
    type: { kind: "number" },
    value: instance.getMonth(),
  })),
  createInstanceOperation("Date", "getDate", (instance) => ({
    type: { kind: "number" },
    value: instance.getDate(),
  })),
  createInstanceOperation("Date", "getTime", (instance) => ({
    type: { kind: "number" },
    value: instance.getTime(),
  })),
  createInstanceOperation("Date", "getHours", (instance) => ({
    type: { kind: "number" },
    value: instance.getHours(),
  })),
  createInstanceOperation("Date", "getMinutes", (instance) => ({
    type: { kind: "number" },
    value: instance.getMinutes(),
  })),
  createInstanceOperation("Date", "getSeconds", (instance) => ({
    type: { kind: "number" },
    value: instance.getSeconds(),
  })),
  createInstanceOperation("Date", "toISOString", (instance) => ({
    type: { kind: "string" },
    value: instance.toISOString(),
  })),
  createInstanceOperation("Date", "toDateString", (instance) => ({
    type: { kind: "string" },
    value: instance.toDateString(),
  })),
];

const urlOperations: OperationListItem[] = [
  createInstanceOperation("URL", "getHref", (instance) => ({
    type: { kind: "string" },
    value: instance.href,
  })),
  createInstanceOperation("URL", "getOrigin", (instance) => ({
    type: { kind: "string" },
    value: instance.origin,
  })),
  createInstanceOperation("URL", "getProtocol", (instance) => ({
    type: { kind: "string" },
    value: instance.protocol,
  })),
  createInstanceOperation("URL", "getHostname", (instance) => ({
    type: { kind: "string" },
    value: instance.hostname,
  })),
  createInstanceOperation("URL", "getPort", (instance) => ({
    type: { kind: "string" },
    value: instance.port,
  })),
  createInstanceOperation("URL", "getPathname", (instance) => ({
    type: { kind: "string" },
    value: instance.pathname,
  })),
  createInstanceOperation("URL", "getSearch", (instance) => ({
    type: { kind: "string" },
    value: instance.search,
  })),
  createInstanceOperation("URL", "getHash", (instance) => ({
    type: { kind: "string" },
    value: instance.hash,
  })),
  createInstanceOperation("URL", "toString", (instance) => ({
    type: { kind: "string" },
    value: instance.toString(),
  })),
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
  ...unionOperations,
  ...dateOperations,
  ...urlOperations,
  ...unknownOperations,
];
