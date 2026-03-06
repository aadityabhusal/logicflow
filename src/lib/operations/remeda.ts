import * as R from "remeda";
import {
  ArrayType,
  Context,
  DataType,
  IData,
  OperationListItem,
  OperationType,
} from "../types";
import {
  createDataFromRawValue,
  getRawValueFromData,
  isDataOfType,
  resolveUnionType,
  unwrapThenable,
} from "../utils";

export function getArrayCallbackParams(
  data: IData,
  options?: {
    elementType?: DataType;
    secondData?: true | DataType;
    returnType?: DataType;
    twoParams?: boolean;
    fourParams?: boolean;
    accumulator?: boolean;
  }
): OperationType["parameters"] {
  const itemType = (data.type as ArrayType).elementType ?? {
    kind: "undefined",
  };
  return [
    {
      type: {
        kind: "array",
        elementType: options?.elementType ?? { kind: "unknown" },
      },
    },
    ...(options?.secondData === true
      ? [{ type: { kind: "array", elementType: { kind: "unknown" } } }]
      : options?.secondData
      ? [{ type: options?.secondData }]
      : []),
    {
      type: {
        kind: "operation",
        parameters: [
          ...(options?.accumulator
            ? [{ name: "acc", type: { kind: "unknown" } }]
            : []),
          ...(options?.twoParams || options?.fourParams
            ? [
                { name: "first", type: itemType },
                {
                  name: "second",
                  type: options?.twoParams ? itemType : { kind: "unknown" },
                },
              ]
            : [{ name: "item", type: itemType }]),
          ...(options?.twoParams
            ? []
            : [
                { name: "index", type: { kind: "number" }, isOptional: true },
                { name: "data", type: data.type, isOptional: true },
              ]),
        ],
        result: options?.returnType ?? { kind: "unknown" },
      },
    },
    ...(options?.accumulator ? [{ type: { kind: "unknown" } }] : []),
  ] as OperationType["parameters"];
}

export function getObjectParam(): OperationType["parameters"][number] {
  return {
    type: resolveUnionType([
      { kind: "object", properties: [] },
      { kind: "dictionary", elementType: { kind: "unknown" } },
    ]),
  };
}

function getObjectCallbackParams(
  data: IData,
  options?: {
    reverseParams?: boolean;
    returnType?: DataType;
    withData?: boolean;
  }
): OperationType["parameters"] {
  const valueType: DataType =
    data.type.kind === "object"
      ? resolveUnionType(data.type.properties.map((v) => v.value))
      : data.type.kind === "dictionary"
      ? data.type.elementType
      : { kind: "unknown" };
  return [
    getObjectParam(),
    {
      type: {
        kind: "operation",
        parameters: options?.reverseParams
          ? [
              { name: "key", type: { kind: "string" } },
              { name: "value", type: valueType },
            ]
          : [
              { name: "value", type: valueType },
              { name: "key", type: { kind: "string" } },
              ...(options?.withData
                ? [{ name: "obj", type: data.type, isOptional: true }]
                : []),
            ],
        result: options?.returnType ?? { kind: "unknown" },
      },
    },
  ];
}

function getEvolverValueType(type: DataType) {
  const operationType: OperationType = {
    kind: "operation",
    parameters: [{ name: "data", type }],
    result: { kind: "unknown" },
  };
  return type.kind === "object" || type.kind === "dictionary"
    ? resolveUnionType([operationType, getEvolverType(type)])
    : operationType;
}

function getEvolverType(dataType: DataType): DataType {
  if (dataType.kind !== "object" && dataType.kind !== "dictionary") {
    return { kind: "undefined" };
  }
  if (dataType.kind === "object") {
    const properties = dataType.properties.map(({ key, value }) => {
      return { key, value: getEvolverValueType(value) };
    });
    return { kind: "object", properties, required: dataType.required };
  }
  return {
    kind: "dictionary",
    elementType: getEvolverValueType(dataType.elementType),
  };
}

type FunctionKeys<T> = {
  [K in keyof T]: T[K] extends (...args: never[]) => unknown ? K : never;
}[keyof T];

export type HandlerConfig = {
  expectedType?: DataType | ((data: IData) => DataType);
  shouldCacheResult?: boolean;
};

export function createOperationHandler(
  operationName: FunctionKeys<typeof R>,
  config?: HandlerConfig
) {
  return (context: Context, ...args: IData[]): IData => {
    const _context = { ...context, isSync: true };
    const rawArgs = args.map((arg) =>
      unwrapThenable(getRawValueFromData(arg, _context))
    );
    const result = (R[operationName] as (...args: unknown[]) => unknown)(
      ...rawArgs
    );

    const expectedType = config?.expectedType
      ? typeof config.expectedType === "function"
        ? config.expectedType(args[0])
        : config.expectedType
      : undefined;

    return createDataFromRawValue(result, { ..._context, expectedType });
  };
}

export const remedaOperationList: {
  name: FunctionKeys<typeof R>;
  parameters: OperationListItem["parameters"];
  config?: HandlerConfig;
}[] = [
  {
    name: "add",
    parameters: [{ type: { kind: "number" } }, { type: { kind: "number" } }],
  },
  {
    name: "subtract",
    parameters: [{ type: { kind: "number" } }, { type: { kind: "number" } }],
  },
  {
    name: "multiply",
    parameters: [{ type: { kind: "number" } }, { type: { kind: "number" } }],
  },
  {
    name: "divide",
    parameters: [{ type: { kind: "number" } }, { type: { kind: "number" } }],
  },
  {
    name: "ceil",
    parameters: [{ type: { kind: "number" } }, { type: { kind: "number" } }],
  },
  {
    name: "floor",
    parameters: [{ type: { kind: "number" } }, { type: { kind: "number" } }],
  },
  {
    name: "round",
    parameters: [{ type: { kind: "number" } }, { type: { kind: "number" } }],
  },
  {
    name: "clamp",
    parameters: [
      { type: { kind: "number" } },
      {
        type: {
          kind: "object",
          properties: [
            { key: "min", value: { kind: "number" } },
            { key: "max", value: { kind: "number" } },
          ],
          required: [],
        },
      },
    ],
  },
  {
    name: "sum",
    parameters: [{ type: { kind: "array", elementType: { kind: "number" } } }],
  },
  {
    name: "product",
    parameters: [{ type: { kind: "array", elementType: { kind: "number" } } }],
  },
  {
    name: "mean",
    parameters: [{ type: { kind: "array", elementType: { kind: "number" } } }],
  },
  {
    name: "median",
    parameters: [{ type: { kind: "array", elementType: { kind: "number" } } }],
  },
  {
    name: "sumBy",
    parameters: (data) =>
      getArrayCallbackParams(data, { returnType: { kind: "number" } }),
  },
  {
    name: "meanBy",
    parameters: (data) =>
      getArrayCallbackParams(data, { returnType: { kind: "number" } }),
  },
  { name: "toUpperCase", parameters: [{ type: { kind: "string" } }] },
  { name: "toLowerCase", parameters: [{ type: { kind: "string" } }] },
  { name: "capitalize", parameters: [{ type: { kind: "string" } }] },
  { name: "uncapitalize", parameters: [{ type: { kind: "string" } }] },
  { name: "toCamelCase", parameters: [{ type: { kind: "string" } }] },
  { name: "toKebabCase", parameters: [{ type: { kind: "string" } }] },
  { name: "toSnakeCase", parameters: [{ type: { kind: "string" } }] },
  { name: "toTitleCase", parameters: [{ type: { kind: "string" } }] },
  {
    name: "startsWith",
    parameters: [{ type: { kind: "string" } }, { type: { kind: "string" } }],
  },
  {
    name: "endsWith",
    parameters: [{ type: { kind: "string" } }, { type: { kind: "string" } }],
  },
  {
    name: "truncate",
    parameters: [
      { type: { kind: "string" } },
      { type: { kind: "number" } },
      {
        type: {
          kind: "object",
          properties: [
            { key: "omission", value: { kind: "string" } },
            { key: "separator", value: { kind: "string" } },
          ],
          required: [],
        },
        isOptional: true,
      },
    ],
  },
  { name: "stringToPath", parameters: [{ type: { kind: "string" } }] },
  {
    name: "split",
    parameters: [{ type: { kind: "string" } }, { type: { kind: "string" } }],
  },
  {
    name: "sliceString",
    parameters: [
      { type: { kind: "string" } },
      { type: { kind: "number" } },
      { type: { kind: "number" }, isOptional: true },
    ],
  },
  {
    name: "first",
    parameters: [{ type: { kind: "array", elementType: { kind: "unknown" } } }],
  },
  {
    name: "last",
    parameters: [{ type: { kind: "array", elementType: { kind: "unknown" } } }],
  },
  {
    name: "only",
    parameters: [{ type: { kind: "array", elementType: { kind: "unknown" } } }],
  },
  {
    name: "dropLast",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "number" } },
    ],
  },
  {
    name: "takeLast",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "number" } },
    ],
  },
  {
    name: "concat",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "array", elementType: { kind: "unknown" } } },
    ],
  },
  {
    name: "reverse",
    parameters: [{ type: { kind: "array", elementType: { kind: "unknown" } } }],
  },
  {
    name: "shuffle",
    parameters: [{ type: { kind: "array", elementType: { kind: "unknown" } } }],
  },
  {
    name: "sort",
    parameters: (data) => getArrayCallbackParams(data, { twoParams: true }),
  },
  {
    name: "unique",
    parameters: [{ type: { kind: "array", elementType: { kind: "unknown" } } }],
  },
  {
    name: "chunk",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "number" } },
    ],
  },
  {
    name: "drop",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "number" } },
    ],
  },
  {
    name: "take",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "number" } },
    ],
  },
  {
    name: "flat",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "number" }, isOptional: true },
    ],
  },
  {
    name: "range",
    parameters: [{ type: { kind: "number" } }, { type: { kind: "number" } }],
  },
  {
    name: "times",
    parameters: [
      { type: { kind: "number" } },
      {
        type: {
          kind: "operation",
          parameters: [{ name: "index", type: { kind: "number" } }],
          result: { kind: "unknown" },
        },
      },
    ],
  },
  {
    name: "sample",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "number" } },
    ],
  },
  {
    name: "join",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "string" } },
    ],
  },
  {
    name: "zip",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "array", elementType: { kind: "unknown" } } },
    ],
    config: {
      expectedType: {
        kind: "array",
        elementType: { kind: "tuple", elements: [] },
      },
    },
  },
  {
    name: "difference",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "array", elementType: { kind: "unknown" } } },
    ],
  },
  {
    name: "intersection",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "array", elementType: { kind: "unknown" } } },
    ],
  },
  {
    name: "splitAt",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "number" } },
    ],
    config: {
      expectedType: (data) => ({
        kind: "tuple",
        elements: data?.type.kind === "array" ? [data.type, data.type] : [],
      }),
    },
  },
  {
    name: "splitWhen",
    parameters: (data) =>
      getArrayCallbackParams(data, { returnType: { kind: "boolean" } }),
    config: {
      expectedType: { kind: "tuple", elements: [] },
    },
  },
  {
    name: "splice",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "number" } },
      { type: { kind: "number" } },
      { type: { kind: "array", elementType: { kind: "unknown" } } },
    ],
  },
  {
    name: "sortedIndex",
    parameters: (data) => [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      {
        type: isDataOfType(data, "array")
          ? data.type.elementType
          : { kind: "unknown" },
      },
    ],
  },
  {
    name: "sortedIndexBy",
    parameters: (data) =>
      getArrayCallbackParams(data, {
        secondData: isDataOfType(data, "array")
          ? data.type.elementType
          : { kind: "unknown" },
      }),
  },
  {
    name: "sortedIndexWith",
    parameters: (data) =>
      getArrayCallbackParams(data, { returnType: { kind: "boolean" } }),
  },
  {
    name: "sortedLastIndex",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "unknown" } },
    ],
  },
  {
    name: "sortedLastIndexBy",
    parameters: (data) =>
      getArrayCallbackParams(data, {
        secondData: isDataOfType(data, "array")
          ? data.type.elementType
          : { kind: "unknown" },
      }),
  },
  {
    name: "swapIndices",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "number" } },
      { type: { kind: "number" } },
    ],
  },
  {
    name: "hasAtLeast",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "number" } },
    ],
  },
  {
    name: "zipWith",
    parameters: (data) =>
      getArrayCallbackParams(data, { secondData: true, fourParams: true }),
  },
  {
    name: "uniqueWith",
    parameters: (data) => getArrayCallbackParams(data, { twoParams: true }),
  },
  {
    name: "intersectionWith",
    parameters: (data) =>
      getArrayCallbackParams(data, {
        returnType: { kind: "boolean" },
        secondData: true,
        twoParams: true,
      }),
  },
  {
    name: "differenceWith",
    parameters: (data) =>
      getArrayCallbackParams(data, {
        returnType: { kind: "boolean" },
        secondData: true,
        twoParams: true,
      }),
  },
  { name: "map", parameters: getArrayCallbackParams },
  { name: "filter", parameters: getArrayCallbackParams },
  { name: "find", parameters: getArrayCallbackParams },
  { name: "findIndex", parameters: getArrayCallbackParams },
  { name: "findLast", parameters: getArrayCallbackParams },
  { name: "findLastIndex", parameters: getArrayCallbackParams },
  { name: "flatMap", parameters: getArrayCallbackParams },
  {
    name: "reduce",
    parameters: (data) => getArrayCallbackParams(data, { accumulator: true }),
  },
  { name: "forEach", parameters: getArrayCallbackParams },
  {
    name: "mapWithFeedback",
    parameters: (data) => getArrayCallbackParams(data, { accumulator: true }),
  },
  { name: "dropWhile", parameters: getArrayCallbackParams },
  { name: "takeWhile", parameters: getArrayCallbackParams },
  { name: "dropLastWhile", parameters: getArrayCallbackParams },
  { name: "takeLastWhile", parameters: getArrayCallbackParams },
  {
    name: "partition",
    parameters: getArrayCallbackParams,
    config: {
      expectedType: (data) => ({
        kind: "tuple",
        elements: data?.type.kind === "array" ? [data.type, data.type] : [],
      }),
    },
  },
  { name: "groupBy", parameters: getArrayCallbackParams },
  { name: "countBy", parameters: getArrayCallbackParams },
  { name: "keys", parameters: [getObjectParam()] },
  { name: "values", parameters: [getObjectParam()] },
  { name: "invert", parameters: [getObjectParam()] },
  {
    name: "entries",
    parameters: [getObjectParam()],
    config: {
      expectedType: {
        kind: "array",
        elementType: {
          kind: "tuple",
          elements: [{ kind: "string" }, { kind: "unknown" }],
        },
      },
    },
  },
  {
    name: "fromEntries",
    parameters: [
      {
        type: {
          kind: "array",
          elementType: {
            kind: "tuple",
            elements: [{ kind: "string" }, { kind: "unknown" }],
          },
        },
      },
    ],
  },
  {
    name: "fromKeys",
    parameters: (data) =>
      getArrayCallbackParams(data, { elementType: { kind: "string" } }),
  },
  {
    name: "pick",
    parameters: [
      getObjectParam(),
      { type: { kind: "array", elementType: { kind: "string" } } },
    ],
  },
  {
    name: "omit",
    parameters: [
      getObjectParam(),
      { type: { kind: "array", elementType: { kind: "string" } } },
    ],
  },
  {
    name: "pickBy",
    parameters: (data) =>
      getObjectCallbackParams(data, { returnType: { kind: "boolean" } }),
  },
  {
    name: "omitBy",
    parameters: (data) =>
      getObjectCallbackParams(data, { returnType: { kind: "boolean" } }),
  },
  { name: "merge", parameters: [getObjectParam(), getObjectParam()] },
  {
    name: "mergeAll",
    parameters: [
      { type: { kind: "array", elementType: getObjectParam().type } },
    ],
  },
  { name: "mergeDeep", parameters: [getObjectParam(), getObjectParam()] },
  {
    name: "mapKeys",
    parameters: (data) =>
      getObjectCallbackParams(data, {
        reverseParams: true,
        returnType: { kind: "string" },
      }),
  },
  { name: "mapValues", parameters: getObjectCallbackParams },
  { name: "mapToObj", parameters: getArrayCallbackParams },
  {
    name: "pullObject",
    parameters: (data) => {
      const params = getArrayCallbackParams(data);
      return params.concat(params.slice(-1));
    },
  },
  {
    name: "indexBy",
    parameters: (data) =>
      getArrayCallbackParams(data, { returnType: { kind: "string" } }),
  },
  {
    name: "groupByProp",
    parameters: [
      { type: { kind: "array", elementType: getObjectParam().type } },
      { type: { kind: "string" } },
    ],
  },
  {
    name: "objOf",
    parameters: [{ type: { kind: "unknown" } }, { type: { kind: "string" } }],
  },
  {
    name: "pathOr",
    parameters: [
      getObjectParam(),
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "unknown" } },
    ],
  },
  {
    name: "set",
    parameters: [
      getObjectParam(),
      { type: { kind: "string" } },
      { type: { kind: "unknown" } },
    ],
  },
  {
    name: "setPath",
    parameters: [
      getObjectParam(),
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "unknown" } },
    ],
  },
  {
    name: "addProp",
    parameters: [
      getObjectParam(),
      { type: { kind: "string" } },
      { type: { kind: "unknown" } },
    ],
  },
  {
    name: "swapProps",
    parameters: [
      getObjectParam(),
      { type: { kind: "string" } },
      { type: { kind: "string" } },
    ],
  },
  {
    name: "evolve",
    parameters: (data) => [
      getObjectParam(),
      { type: getEvolverType(data.type) },
    ],
  },
  { name: "hasSubObject", parameters: [getObjectParam(), getObjectParam()] },
  {
    name: "length",
    parameters: [{ type: { kind: "array", elementType: { kind: "unknown" } } }],
  },
  { name: "clone", parameters: [{ type: { kind: "unknown" } }] },
  {
    name: "tap",
    parameters: [
      { type: { kind: "unknown" } },
      {
        type: {
          kind: "operation",
          parameters: [{ name: "value", type: { kind: "unknown" } }],
          result: { kind: "unknown" },
        },
      },
    ],
  },
  {
    name: "forEachObj",
    parameters: (data) => getObjectCallbackParams(data, { withData: true }),
  },
  {
    name: "isIncludedIn",
    parameters: [
      { type: { kind: "unknown" } },
      { type: { kind: "array", elementType: { kind: "unknown" } } },
    ],
  },
  {
    name: "isDeepEqual",
    parameters: [{ type: { kind: "unknown" } }, { type: { kind: "unknown" } }],
  },
  {
    name: "isShallowEqual",
    parameters: [{ type: { kind: "unknown" } }, { type: { kind: "unknown" } }],
  },

  {
    name: "randomInteger",
    parameters: [{ type: { kind: "number" } }, { type: { kind: "number" } }],
  },
  { name: "randomString", parameters: [{ type: { kind: "number" } }] },
  {
    name: "defaultTo",
    parameters: [{ type: { kind: "unknown" } }, { type: { kind: "unknown" } }],
  },
  {
    name: "allPass",
    parameters: (data) => [
      { type: { kind: "unknown" } },
      {
        type: {
          kind: "array",
          elementType: {
            kind: "operation",
            parameters: [{ type: data.type, name: "data" }],
            result: { kind: "boolean" },
          },
        },
      },
    ],
  },
  {
    name: "anyPass",
    parameters: (data) => [
      { type: { kind: "unknown" } },
      {
        type: {
          kind: "array",
          elementType: {
            kind: "operation",
            parameters: [{ type: data.type, name: "data" }],
            result: { kind: "boolean" },
          },
        },
      },
    ],
  },
];

export const remedaOperations: OperationListItem[] = remedaOperationList.map(
  (operation) => ({
    ...operation,
    handler: createOperationHandler(operation.name, operation.config),
  })
);
