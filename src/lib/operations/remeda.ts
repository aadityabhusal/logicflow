import * as R from "remeda";
import {
  ArrayType,
  Context,
  DataType,
  DictionaryType,
  IData,
  NumberType,
  ObjectType,
  OperationListItem,
  OperationType,
  StringType,
} from "../types";
import {
  createData,
  createDataFromRawValue,
  createStatement,
  getRawValueFromData,
  isDataOfType,
  operationToListItem,
  resolveUnionType,
} from "../utils";

function getArrayCallbackParams(
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
    ...(options?.accumulator
      ? [{ type: { kind: "unknown" } }]
      : options?.secondData === true
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
  ] as OperationType["parameters"];
}

function createCallback<T>(_operation: IData<OperationType>, context: Context) {
  const operation = operationToListItem(_operation);
  return (..._args: unknown[]) => {
    const [data, ...args] = _args;
    const result = context.executeOperationSync(
      operation,
      createDataFromRawValue(data, { ...context }),
      args.map((arg) =>
        createStatement({
          data: createDataFromRawValue(arg, { ...context }),
        })
      ),
      { ...context, isSync: true }
    );
    return getRawValueFromData(result, context) as T;
  };
}

function getObjectParam(): OperationType["parameters"][number] {
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

export const remedaOperations: OperationListItem[] = [
  // Math operations using remeda
  {
    name: "add",
    parameters: [{ type: { kind: "number" } }, { type: { kind: "number" } }],
    handler: (_, data: IData<NumberType>, p1: IData<NumberType>) => {
      return createData({
        type: { kind: "number" },
        value: R.add(data.value, p1.value),
      });
    },
  },
  {
    name: "subtract",
    parameters: [{ type: { kind: "number" } }, { type: { kind: "number" } }],
    handler: (_, data: IData<NumberType>, p1: IData<NumberType>) => {
      return createData({
        type: { kind: "number" },
        value: R.subtract(data.value, p1.value),
      });
    },
  },
  {
    name: "multiply",
    parameters: [{ type: { kind: "number" } }, { type: { kind: "number" } }],
    handler: (_, data: IData<NumberType>, p1: IData<NumberType>) => {
      return createData({
        type: { kind: "number" },
        value: R.multiply(data.value, p1.value),
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
        value: R.divide(data.value, p1.value),
      });
    },
  },
  {
    name: "ceil",
    parameters: [{ type: { kind: "number" } }, { type: { kind: "number" } }],
    handler: (_, data: IData<NumberType>, precision: IData<NumberType>) => {
      return createData({
        type: { kind: "number" },
        value: R.ceil(data.value, precision.value),
      });
    },
  },
  {
    name: "floor",
    parameters: [{ type: { kind: "number" } }, { type: { kind: "number" } }],
    handler: (_, data: IData<NumberType>, precision: IData<NumberType>) => {
      return createData({
        type: { kind: "number" },
        value: R.floor(data.value, precision.value),
      });
    },
  },
  {
    name: "round",
    parameters: [{ type: { kind: "number" } }, { type: { kind: "number" } }],
    handler: (_, data: IData<NumberType>, precision: IData<NumberType>) => {
      return createData({
        type: { kind: "number" },
        value: R.round(data.value, precision.value),
      });
    },
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
    handler: (context, data: IData<NumberType>, options: IData<ObjectType>) => {
      const { min, max } = getRawValueFromData(options, context) as Record<
        string,
        number
      >;
      return createData({
        type: { kind: "number" },
        value: R.clamp(data.value, { min, max }),
      });
    },
  },
  {
    name: "sum",
    parameters: [{ type: { kind: "array", elementType: { kind: "number" } } }],
    handler: (context, data: IData<ArrayType>) => {
      const values = getRawValueFromData(data, context) as number[];
      return createData({ type: { kind: "number" }, value: R.sum(values) });
    },
  },
  {
    name: "product",
    parameters: [{ type: { kind: "array", elementType: { kind: "number" } } }],
    handler: (context, data: IData<ArrayType>) => {
      const values = getRawValueFromData(data, context) as number[];
      return createData({ type: { kind: "number" }, value: R.product(values) });
    },
  },
  {
    name: "mean",
    parameters: [{ type: { kind: "array", elementType: { kind: "number" } } }],
    handler: (context, data: IData<ArrayType>) => {
      const values = getRawValueFromData(data, context) as number[];
      return createData({ type: { kind: "number" }, value: R.mean(values) });
    },
  },
  {
    name: "median",
    parameters: [{ type: { kind: "array", elementType: { kind: "number" } } }],
    handler: (context, data: IData<ArrayType>) => {
      const values = getRawValueFromData(data, context) as number[];
      return createData({ type: { kind: "number" }, value: R.median(values) });
    },
  },
  {
    name: "sumBy",
    parameters: (data) =>
      getArrayCallbackParams(data, { returnType: { kind: "number" } }),
    handler: async (
      context,
      data: IData<ArrayType>,
      operation: IData<OperationType>
    ) => {
      const values = getRawValueFromData(data, context) as number[];
      const result = R.sumBy(values, createCallback(operation, context));
      return createData({ type: { kind: "number" }, value: result });
    },
  },
  {
    name: "meanBy",
    parameters: (data) =>
      getArrayCallbackParams(data, { returnType: { kind: "number" } }),
    handler: (
      context,
      data: IData<ArrayType>,
      operation: IData<OperationType>
    ) => {
      const values = getRawValueFromData(data, context) as number[];
      const result = R.meanBy(values, createCallback(operation, context));
      return createData({ type: { kind: "number" }, value: result });
    },
  },
  // String operations using remeda
  {
    name: "toUpperCase",
    parameters: [{ type: { kind: "string" } }],
    handler: (_, data: IData<StringType>) => {
      return createData({
        type: { kind: "string" },
        value: R.toUpperCase(data.value),
      });
    },
  },
  {
    name: "toLowerCase",
    parameters: [{ type: { kind: "string" } }],
    handler: (_, data: IData<StringType>) => {
      return createData({
        type: { kind: "string" },
        value: R.toLowerCase(data.value),
      });
    },
  },
  {
    name: "capitalize",
    parameters: [{ type: { kind: "string" } }],
    handler: (_, data: IData<StringType>) => {
      return createData({
        type: { kind: "string" },
        value: R.capitalize(data.value),
      });
    },
  },
  {
    name: "uncapitalize",
    parameters: [{ type: { kind: "string" } }],
    handler: (_, data: IData<StringType>) => {
      return createData({
        type: { kind: "string" },
        value: R.uncapitalize(data.value),
      });
    },
  },
  {
    name: "toCamelCase",
    parameters: [{ type: { kind: "string" } }],
    handler: (_, data: IData<StringType>) => {
      return createData({
        type: { kind: "string" },
        value: R.toCamelCase(data.value),
      });
    },
  },
  {
    name: "toKebabCase",
    parameters: [{ type: { kind: "string" } }],
    handler: (_, data: IData<StringType>) => {
      return createData({
        type: { kind: "string" },
        value: R.toKebabCase(data.value),
      });
    },
  },
  {
    name: "toSnakeCase",
    parameters: [{ type: { kind: "string" } }],
    handler: (_, data: IData<StringType>) => {
      return createData({
        type: { kind: "string" },
        value: R.toSnakeCase(data.value),
      });
    },
  },
  {
    name: "toTitleCase",
    parameters: [{ type: { kind: "string" } }],
    handler: (_, data: IData<StringType>) => {
      return createData({
        type: { kind: "string" },
        value: R.toTitleCase(data.value),
      });
    },
  },
  {
    name: "startsWith",
    parameters: [{ type: { kind: "string" } }, { type: { kind: "string" } }],
    handler: (_, data: IData<StringType>, prefix: IData<StringType>) => {
      return createData({
        type: { kind: "boolean" },
        value: R.startsWith(data.value, prefix.value),
      });
    },
  },
  {
    name: "endsWith",
    parameters: [{ type: { kind: "string" } }, { type: { kind: "string" } }],
    handler: (_, data: IData<StringType>, suffix: IData<StringType>) => {
      return createData({
        type: { kind: "boolean" },
        value: R.endsWith(data.value, suffix.value),
      });
    },
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
    handler: (
      context,
      data: IData<StringType>,
      n: IData<NumberType>,
      options?: IData<ObjectType>
    ) => {
      const [omission, separator] = options
        ? (getRawValueFromData(options, context) as string[])
        : [];
      return createData({
        type: { kind: "string" },
        value: R.truncate(data.value, Number(n.value), { omission, separator }),
      });
    },
  },
  {
    name: "stringToPath",
    parameters: [{ type: { kind: "string" } }],
    handler: (context, data: IData<StringType>) => {
      return createDataFromRawValue(R.stringToPath(data.value), context);
    },
  },
  {
    name: "split",
    parameters: [{ type: { kind: "string" } }, { type: { kind: "string" } }],
    handler: (_, data: IData<StringType>, separator: IData<StringType>) => {
      const result = R.split(data.value, separator.value);
      return createData({
        type: { kind: "array", elementType: { kind: "string" } },
        value: result.map((value) =>
          createStatement({
            data: createData({ type: { kind: "string" }, value }),
          })
        ),
      });
    },
  },
  {
    name: "sliceString",
    parameters: [
      { type: { kind: "string" } },
      { type: { kind: "number" } },
      { type: { kind: "number" }, isOptional: true },
    ],
    handler: (
      _,
      data: IData<StringType>,
      start: IData<NumberType>,
      end?: IData<NumberType>
    ) => {
      const result = R.sliceString(data.value, start.value, end?.value);
      return createData({ type: { kind: "string" }, value: result });
    },
  },
  // Array operations using remeda
  {
    name: "first",
    parameters: [{ type: { kind: "array", elementType: { kind: "unknown" } } }],
    handler: (context, data: IData<ArrayType>) => {
      const values = getRawValueFromData(data, context) as [];
      return createDataFromRawValue(R.first(values), context);
    },
  },
  {
    name: "last",
    parameters: [{ type: { kind: "array", elementType: { kind: "unknown" } } }],
    handler: (context, data: IData<ArrayType>) => {
      const values = getRawValueFromData(data, context) as [];
      return createDataFromRawValue(R.last(values), context);
    },
  },
  {
    name: "only",
    parameters: [{ type: { kind: "array", elementType: { kind: "unknown" } } }],
    handler: (context, data: IData<ArrayType>) => {
      const values = getRawValueFromData(data, context) as [];
      return createDataFromRawValue(R.only(values), context);
    },
  },
  {
    name: "dropLast",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "number" } },
    ],
    handler: (context, data: IData<ArrayType>, n: IData<NumberType>) => {
      const values = getRawValueFromData(data, context) as [];
      return createDataFromRawValue(R.dropLast(values, n.value), context);
    },
  },
  {
    name: "takeLast",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "number" } },
    ],
    handler: (context, data: IData<ArrayType>, n: IData<NumberType>) => {
      const values = getRawValueFromData(data, context) as [];
      return createDataFromRawValue(R.takeLast(values, n.value), context);
    },
  },
  {
    name: "concat",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "array", elementType: { kind: "unknown" } } },
    ],
    handler: (context, data: IData<ArrayType>, other: IData<ArrayType>) => {
      const values = getRawValueFromData(data, context) as [];
      const otherValues = getRawValueFromData(other, context) as [];
      return createDataFromRawValue(R.concat(values, otherValues), context);
    },
  },
  {
    name: "reverse",
    parameters: [{ type: { kind: "array", elementType: { kind: "unknown" } } }],
    handler: (context, data: IData<ArrayType>) => {
      const values = getRawValueFromData(data, context) as [];
      return createData({
        type: data.type,
        value: R.reverse(values).map((item) =>
          createStatement({ data: createDataFromRawValue(item, context) })
        ),
      });
    },
  },
  {
    name: "shuffle",
    parameters: [{ type: { kind: "array", elementType: { kind: "unknown" } } }],
    handler: (context, data: IData<ArrayType>) => {
      const values = getRawValueFromData(data, context) as [];
      return createData({
        type: data.type,
        value: R.shuffle(values).map((item) =>
          createStatement({ data: createDataFromRawValue(item, context) })
        ),
      });
    },
  },
  {
    name: "sort",
    parameters: (data) => getArrayCallbackParams(data, { twoParams: true }),
    handler: (
      context,
      data: IData<ArrayType>,
      operation: IData<OperationType>
    ) => {
      const values = getRawValueFromData(data, context) as unknown[];
      const result = R.sort(values, createCallback(operation, context));
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "unique",
    parameters: [{ type: { kind: "array", elementType: { kind: "unknown" } } }],
    handler: (context, data: IData<ArrayType>) => {
      const values = getRawValueFromData(data, context) as [];
      return createDataFromRawValue(R.unique(values), context);
    },
  },
  {
    name: "chunk",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "number" } },
    ],
    handler: (context, data: IData<ArrayType>, size: IData<NumberType>) => {
      const values = getRawValueFromData(data, context) as [];
      return createDataFromRawValue(R.chunk(values, size.value), context);
    },
  },
  {
    name: "drop",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "number" } },
    ],
    handler: (context, data: IData<ArrayType>, n: IData<NumberType>) => {
      const values = getRawValueFromData(data, context) as [];
      return createDataFromRawValue(R.drop(values, n.value), context);
    },
  },
  {
    name: "take",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "number" } },
    ],
    handler: (context, data: IData<ArrayType>, n: IData<NumberType>) => {
      const values = getRawValueFromData(data, context) as [];
      return createDataFromRawValue(R.take(values, n.value), context);
    },
  },
  {
    name: "flat",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "number" }, isOptional: true },
    ],
    handler: (context, data: IData<ArrayType>, depth?: IData<NumberType>) => {
      const values = getRawValueFromData(data, context) as [];
      return createDataFromRawValue(
        R.flat(values, depth?.value as undefined),
        context
      );
    },
  },
  {
    name: "range",
    parameters: [{ type: { kind: "number" } }, { type: { kind: "number" } }],
    handler: (context, start: IData<NumberType>, end: IData<NumberType>) => {
      return createDataFromRawValue(R.range(start.value, end.value), context);
    },
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
    handler: (
      context,
      data: IData<NumberType>,
      operation: IData<OperationType>
    ) => {
      const value = getRawValueFromData(data, context) as number;
      const result = R.times(value, createCallback(operation, context));
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "sample",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "number" } },
    ],
    handler: (context, data: IData<ArrayType>, size: IData<NumberType>) => {
      const values = getRawValueFromData(data, context) as [];
      return createDataFromRawValue(R.sample(values, size.value), context);
    },
  },
  {
    name: "join",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "string" } },
    ],
    handler: (context, data: IData<ArrayType>, glue: IData<StringType>) => {
      const values = getRawValueFromData(data, context) as [];
      return createData({
        type: { kind: "string" },
        value: R.join(values, glue.value),
      });
    },
  },
  {
    name: "zip",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "array", elementType: { kind: "unknown" } } },
    ],
    handler: (context, data: IData<ArrayType>, second: IData<ArrayType>) => {
      const values = getRawValueFromData(data, context) as [];
      const secondValues = getRawValueFromData(second, context) as [];
      return createDataFromRawValue(R.zip(values, secondValues), {
        ...context,
        expectedType: {
          kind: "array",
          elementType: { kind: "tuple", elements: [] },
        },
      });
    },
  },
  {
    name: "difference",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "array", elementType: { kind: "unknown" } } },
    ],
    handler: (context, data: IData<ArrayType>, other: IData<ArrayType>) => {
      const values = getRawValueFromData(data, context) as [];
      const otherValues = getRawValueFromData(other, context) as [];
      return createDataFromRawValue(R.difference(values, otherValues), context);
    },
  },
  {
    name: "intersection",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "array", elementType: { kind: "unknown" } } },
    ],
    handler: (context, data: IData<ArrayType>, other: IData<ArrayType>) => {
      const values = getRawValueFromData(data, context) as [];
      const otherValues = getRawValueFromData(other, context) as [];
      return createDataFromRawValue(
        R.intersection(values, otherValues),
        context
      );
    },
  },
  {
    name: "splitAt",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "number" } },
    ],
    handler: (context, data: IData<ArrayType>, index: IData<NumberType>) => {
      const values = getRawValueFromData(data, context) as [];
      return createDataFromRawValue(R.splitAt(values, index.value), {
        ...context,
        expectedType: { kind: "tuple", elements: [data.type, data.type] },
      });
    },
  },
  {
    name: "splitWhen",
    parameters: (data) =>
      getArrayCallbackParams(data, { returnType: { kind: "boolean" } }),
    handler: (
      context,
      data: IData<ArrayType>,
      operation: IData<OperationType>
    ) => {
      const values = getRawValueFromData(data, context) as unknown[];
      const result = R.splitWhen(values, createCallback(operation, context));
      return createDataFromRawValue(result, {
        ...context,
        expectedType: { kind: "tuple", elements: [] },
      });
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
    handler: (
      context,
      data: IData<ArrayType>,
      start: IData<NumberType>,
      count: IData<NumberType>,
      replacement: IData<ArrayType>
    ) => {
      const values = getRawValueFromData(data, context) as [];
      const replacements = getRawValueFromData(replacement, context) as [];
      const result = R.splice(values, start.value, count.value, replacements);
      return createDataFromRawValue(result, context);
    },
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
    handler: (context, data: IData<ArrayType>, item: IData) => {
      const values = getRawValueFromData(data, context) as [];
      return createData({
        type: { kind: "number" },
        value: R.sortedIndex(values, item.value),
      });
    },
  },
  {
    name: "sortedIndexBy",
    parameters: (data) =>
      getArrayCallbackParams(data, {
        secondData: isDataOfType(data, "array")
          ? data.type.elementType
          : { kind: "unknown" },
      }),
    handler: (
      context,
      data: IData<ArrayType>,
      item: IData,
      operation: IData<OperationType>
    ) => {
      const values = getRawValueFromData(data, context) as unknown[];
      const itemValue = getRawValueFromData(item, context);
      const result = R.sortedIndexBy(
        values,
        itemValue,
        createCallback(operation, context)
      );
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "sortedIndexWith",
    parameters: (data) =>
      getArrayCallbackParams(data, { returnType: { kind: "boolean" } }),
    handler: (
      context,
      data: IData<ArrayType>,
      operation: IData<OperationType>
    ) => {
      const values = getRawValueFromData(data, context) as unknown[];
      const result = R.sortedIndexWith(
        values,
        createCallback(operation, context)
      );
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "sortedLastIndex",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "unknown" } },
    ],
    handler: (context, data: IData<ArrayType>, item: IData) => {
      const values = getRawValueFromData(data, context) as [];
      return createData({
        type: { kind: "number" },
        value: R.sortedLastIndex(values, item.value),
      });
    },
  },
  {
    name: "sortedLastIndexBy",
    parameters: (data) =>
      getArrayCallbackParams(data, {
        secondData: isDataOfType(data, "array")
          ? data.type.elementType
          : { kind: "unknown" },
      }),
    handler: (
      context,
      data: IData<ArrayType>,
      item: IData,
      operation: IData<OperationType>
    ) => {
      const values = getRawValueFromData(data, context) as unknown[];
      const itemValue = getRawValueFromData(item, context);
      const result = R.sortedLastIndexBy(
        values,
        itemValue,
        createCallback(operation, context)
      );
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "swapIndices",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "number" } },
      { type: { kind: "number" } },
    ],
    handler: (
      context,
      data: IData<ArrayType>,
      index1: IData<NumberType>,
      index2: IData<NumberType>
    ) => {
      const values = getRawValueFromData(data, context) as [];
      const result = R.swapIndices(values, index1.value, index2.value);
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "hasAtLeast",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "number" } },
    ],
    handler: (context, data: IData<ArrayType>, minimum: IData<NumberType>) => {
      const values = getRawValueFromData(data, context) as [];
      return createData({
        type: { kind: "boolean" },
        value: R.hasAtLeast(values, Number(minimum.value)),
      });
    },
  },
  {
    name: "zipWith",
    parameters: (data) =>
      getArrayCallbackParams(data, { secondData: true, fourParams: true }),
    handler: (
      context,
      first: IData<ArrayType>,
      second: IData<ArrayType>,
      operation: IData<OperationType>
    ) => {
      const firstValues = getRawValueFromData(first, context) as unknown[];
      const secondValues = getRawValueFromData(second, context) as unknown[];
      const results = R.zipWith(
        firstValues,
        secondValues,
        createCallback(operation, context)
      );
      return createDataFromRawValue(results, context);
    },
  },
  {
    name: "uniqueWith",
    parameters: (data) => getArrayCallbackParams(data, { twoParams: true }),
    handler: (
      context,
      data: IData<ArrayType>,
      operation: IData<OperationType>
    ) => {
      const values = getRawValueFromData(data, context) as unknown[];
      const result = R.uniqueWith(values, createCallback(operation, context));
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "intersectionWith",
    parameters: (data) =>
      getArrayCallbackParams(data, {
        returnType: { kind: "boolean" },
        secondData: true,
        twoParams: true,
      }),
    handler: (
      context,
      data: IData<ArrayType>,
      other: IData<ArrayType>,
      operation: IData<OperationType>
    ) => {
      const dataArr = getRawValueFromData(data, context) as unknown[];
      const otherArr = getRawValueFromData(other, context) as unknown[];
      const result = R.intersectionWith(
        dataArr,
        otherArr,
        createCallback(operation, context)
      );
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "differenceWith",
    parameters: (data) =>
      getArrayCallbackParams(data, {
        returnType: { kind: "boolean" },
        secondData: true,
        twoParams: true,
      }),
    handler: (
      context,
      data: IData<ArrayType>,
      other: IData<ArrayType>,
      operation: IData<OperationType>
    ) => {
      const dataArr = getRawValueFromData(data, context) as unknown[];
      const otherArr = getRawValueFromData(other, context) as unknown[];
      const result = R.differenceWith(
        dataArr,
        otherArr,
        createCallback(operation, context)
      );
      return createDataFromRawValue(result, context);
    },
  },
  // Array operations with callbacks using remeda
  {
    name: "map",
    parameters: getArrayCallbackParams,
    handler: (
      context,
      data: IData<ArrayType>,
      operation: IData<OperationType>
    ) => {
      const values = getRawValueFromData(data, context) as unknown[];
      const result = R.map(values, createCallback(operation, context));
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "filter",
    parameters: getArrayCallbackParams,
    handler: (
      context,
      data: IData<ArrayType>,
      operation: IData<OperationType>
    ) => {
      const values = getRawValueFromData(data, context) as unknown[];
      const result = R.filter(values, createCallback(operation, context));
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "find",
    parameters: getArrayCallbackParams,
    handler: (
      context,
      data: IData<ArrayType>,
      operation: IData<OperationType>
    ) => {
      const values = getRawValueFromData(data, context) as unknown[];
      const result = R.find(values, createCallback(operation, context));
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "findIndex",
    parameters: getArrayCallbackParams,
    handler: (
      context,
      data: IData<ArrayType>,
      operation: IData<OperationType>
    ) => {
      const values = getRawValueFromData(data, context) as unknown[];
      const result = R.findIndex(values, createCallback(operation, context));
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "findLast",
    parameters: getArrayCallbackParams,
    handler: (
      context,
      data: IData<ArrayType>,
      operation: IData<OperationType>
    ) => {
      const values = getRawValueFromData(data, context) as unknown[];
      const result = R.findLast(values, createCallback(operation, context));
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "findLastIndex",
    parameters: getArrayCallbackParams,
    handler: (
      context,
      data: IData<ArrayType>,
      operation: IData<OperationType>
    ) => {
      const values = getRawValueFromData(data, context) as unknown[];
      const result = R.findLastIndex(
        values,
        createCallback(operation, context)
      );
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "flatMap",
    parameters: getArrayCallbackParams,
    handler: (
      context,
      data: IData<ArrayType>,
      operation: IData<OperationType>
    ) => {
      const values = getRawValueFromData(data, context) as unknown[];
      const result = R.flatMap(
        values,
        createCallback<unknown[]>(operation, context)
      );
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "every",
    parameters: getArrayCallbackParams,
    handler: (
      context,
      data: IData<ArrayType>,
      operation: IData<OperationType>
    ) => {
      const values = getRawValueFromData(data, context) as unknown[];
      const result = values.every(createCallback(operation, context));
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "some",
    parameters: getArrayCallbackParams,
    handler: (
      context,
      data: IData<ArrayType>,
      operation: IData<OperationType>
    ) => {
      const values = getRawValueFromData(data, context) as unknown[];
      const result = values.some(createCallback(operation, context));
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "reduce",
    parameters: (data) => getArrayCallbackParams(data, { accumulator: true }),
    handler: (
      context,
      data: IData<ArrayType>,
      initialValue: IData,
      operation: IData<OperationType>
    ) => {
      const result = R.reduce(
        getRawValueFromData(data, context) as unknown[],
        createCallback(operation, context),
        getRawValueFromData(initialValue, context)
      );
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "forEach",
    parameters: getArrayCallbackParams,
    handler: (
      context,
      data: IData<ArrayType>,
      operation: IData<OperationType>
    ) => {
      const values = getRawValueFromData(data, context) as unknown[];
      R.forEach(values, createCallback(operation, context));
      return createData({ type: { kind: "undefined" } });
    },
  },
  {
    name: "mapWithFeedback",
    parameters: (data) => getArrayCallbackParams(data, { accumulator: true }),
    handler: (
      context,
      data: IData<ArrayType>,
      initialValue: IData,
      operation: IData<OperationType>
    ) => {
      const results = R.mapWithFeedback(
        getRawValueFromData(data, context) as unknown[],
        createCallback(operation, context),
        getRawValueFromData(initialValue, context)
      );
      return createDataFromRawValue(results, context);
    },
  },
  {
    name: "dropWhile",
    parameters: getArrayCallbackParams,
    handler: (
      context,
      data: IData<ArrayType>,
      operation: IData<OperationType>
    ) => {
      const values = getRawValueFromData(data, context) as unknown[];
      const result = R.dropWhile(values, createCallback(operation, context));
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "takeWhile",
    parameters: getArrayCallbackParams,
    handler: (
      context,
      data: IData<ArrayType>,
      operation: IData<OperationType>
    ) => {
      const values = getRawValueFromData(data, context) as unknown[];
      const result = R.takeWhile(values, createCallback(operation, context));
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "dropLastWhile",
    parameters: getArrayCallbackParams,
    handler: (
      context,
      data: IData<ArrayType>,
      operation: IData<OperationType>
    ) => {
      const values = getRawValueFromData(data, context) as unknown[];
      const result = R.dropLastWhile(
        values,
        createCallback(operation, context)
      );
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "takeLastWhile",
    parameters: getArrayCallbackParams,
    handler: (
      context,
      data: IData<ArrayType>,
      operation: IData<OperationType>
    ) => {
      const values = getRawValueFromData(data, context) as unknown[];
      const result = R.takeLastWhile(
        values,
        createCallback(operation, context)
      );
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "partition",
    parameters: getArrayCallbackParams,
    handler: (
      context,
      data: IData<ArrayType>,
      operation: IData<OperationType>
    ) => {
      const values = getRawValueFromData(data, context) as unknown[];
      const result = R.partition(values, createCallback(operation, context));
      return createDataFromRawValue(result, {
        ...context,
        expectedType: { kind: "tuple", elements: [data.type, data.type] },
      });
    },
  },
  {
    name: "groupBy",
    parameters: getArrayCallbackParams,
    handler: (
      context,
      data: IData<ArrayType>,
      operation: IData<OperationType>
    ) => {
      const values = getRawValueFromData(data, context) as unknown[];
      const result = R.groupBy(values, createCallback(operation, context));
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "countBy",
    parameters: getArrayCallbackParams,
    handler: (
      context,
      data: IData<ArrayType>,
      operation: IData<OperationType>
    ) => {
      const values = getRawValueFromData(data, context) as unknown[];
      const result = R.countBy(values, createCallback(operation, context));
      return createDataFromRawValue(result, context);
    },
  },
  // Object operations using remeda
  {
    name: "keys",
    parameters: [getObjectParam()],
    handler: (context, data: IData<ObjectType | DictionaryType>) => {
      const rawObj = getRawValueFromData(data, context) as Record<
        string,
        unknown
      >;
      const result = R.keys(rawObj);
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "values",
    parameters: [getObjectParam()],
    handler: (context, data: IData<ObjectType | DictionaryType>) => {
      const rawObj = getRawValueFromData(data, context) as Record<
        string,
        unknown
      >;
      const result = R.values(rawObj);
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "invert",
    parameters: [getObjectParam()],
    handler: (context, data: IData<ObjectType | DictionaryType>) => {
      const rawObj = getRawValueFromData(data, context) as Record<
        string,
        string
      >;
      const result = R.invert(rawObj);
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "entries",
    parameters: [getObjectParam()],
    handler: (context, data: IData<ObjectType | DictionaryType>) => {
      const rawObj = getRawValueFromData(data, context) as Record<
        string,
        unknown
      >;
      const result = R.entries(rawObj);
      return createDataFromRawValue(result, {
        ...context,
        expectedType: {
          kind: "array",
          elementType: {
            kind: "tuple",
            elements: [{ kind: "string" }, { kind: "unknown" }],
          },
        },
      });
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
    handler: (context, data: IData<ArrayType>) => {
      const entries = getRawValueFromData(data, context) as [string, unknown][];
      const result = R.fromEntries(entries);
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "fromKeys",
    parameters: (data) =>
      getArrayCallbackParams(data, { elementType: { kind: "string" } }),
    handler: (
      context,
      keys: IData<ArrayType>,
      operation: IData<OperationType>
    ) => {
      const keyArr = getRawValueFromData(keys, context) as string[];
      const result = R.fromKeys(keyArr, createCallback(operation, context));
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "pick",
    parameters: [
      getObjectParam(),
      { type: { kind: "array", elementType: { kind: "string" } } },
    ],
    handler: (
      context,
      data: IData<ObjectType | DictionaryType>,
      keys: IData<ArrayType>
    ) => {
      const rawObj = getRawValueFromData(data, context) as Record<
        string,
        unknown
      >;
      const keyArr = getRawValueFromData(keys, context) as string[];
      const result = R.pick(rawObj, keyArr);
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "omit",
    parameters: [
      getObjectParam(),
      { type: { kind: "array", elementType: { kind: "string" } } },
    ],
    handler: (
      context,
      data: IData<ObjectType | DictionaryType>,
      keys: IData<ArrayType>
    ) => {
      const rawObj = getRawValueFromData(data, context) as Record<
        string,
        unknown
      >;
      const keyArr = getRawValueFromData(keys, context) as string[];
      const result = R.omit(rawObj, keyArr);
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "pickBy",
    parameters: (data) =>
      getObjectCallbackParams(data, { returnType: { kind: "boolean" } }),
    handler: (
      context,
      data: IData<ObjectType | DictionaryType>,
      operation: IData<OperationType>
    ) => {
      const rawObj = getRawValueFromData(data, context) as Record<
        string,
        unknown
      >;
      const result = R.pickBy(rawObj, createCallback(operation, context));
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "omitBy",
    parameters: (data) =>
      getObjectCallbackParams(data, { returnType: { kind: "boolean" } }),
    handler: (
      context,
      data: IData<ObjectType | DictionaryType>,
      operation: IData<OperationType>
    ) => {
      const rawObj = getRawValueFromData(data, context) as Record<
        string,
        unknown
      >;
      const result = R.omitBy(rawObj, createCallback(operation, context));
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "merge",
    parameters: [getObjectParam(), getObjectParam()],
    handler: (context, data: IData<ObjectType>, source: IData<ObjectType>) => {
      const rawObj = getRawValueFromData(data, context) as Record<
        string,
        unknown
      >;
      const rawSource = getRawValueFromData(source, context) as Record<
        string,
        unknown
      >;
      const result = R.merge(rawObj, rawSource);
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "mergeAll",
    parameters: [
      { type: { kind: "array", elementType: getObjectParam().type } },
    ],
    handler: (context, data: IData<ArrayType>) => {
      const objects = getRawValueFromData(data, context) as Record<
        string,
        unknown
      >[];
      const result = R.mergeAll(objects);
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "mergeDeep",
    parameters: [getObjectParam(), getObjectParam()],
    handler: (context, data: IData<ObjectType>, source: IData<ObjectType>) => {
      const rawObj = getRawValueFromData(data, context) as Record<
        string,
        unknown
      >;
      const rawSource = getRawValueFromData(source, context) as Record<
        string,
        unknown
      >;
      const result = R.mergeDeep(rawObj, rawSource);
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "mapKeys",
    parameters: (data) =>
      getObjectCallbackParams(data, {
        reverseParams: true,
        returnType: { kind: "string" },
      }),
    handler: (
      context,
      data: IData<ObjectType | DictionaryType>,
      operation: IData<OperationType>
    ) => {
      const rawObj = getRawValueFromData(data, context) as Record<
        string,
        unknown
      >;
      const result = R.mapKeys(
        rawObj,
        createCallback<string>(operation, context)
      );
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "mapValues",
    parameters: getObjectCallbackParams,
    handler: (
      context,
      data: IData<ObjectType | DictionaryType>,
      operation: IData<OperationType>
    ) => {
      const rawObj = getRawValueFromData(data, context) as Record<
        string,
        unknown
      >;
      const result = R.mapValues(rawObj, createCallback(operation, context));
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "mapToObj",
    parameters: getArrayCallbackParams,
    handler: (
      context,
      data: IData<ArrayType>,
      operation: IData<OperationType>
    ) => {
      const values = getRawValueFromData(data, context) as unknown[];
      const result = R.mapToObj(
        values,
        createCallback<[string, unknown]>(operation, context)
      );
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "pullObject",
    parameters: (data) => {
      const params = getArrayCallbackParams(data);
      return params.concat(params.slice(-1));
    },
    handler: (
      context,
      data: IData<ArrayType>,
      keyExtractor: IData<OperationType>,
      valueExtractor: IData<OperationType>
    ) => {
      const values = getRawValueFromData(data, context) as unknown[];
      const result = R.pullObject(
        values,
        createCallback<string>(keyExtractor, context),
        createCallback(valueExtractor, context)
      );
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "indexBy",
    parameters: (data) =>
      getArrayCallbackParams(data, { returnType: { kind: "string" } }),
    handler: (
      context,
      data: IData<ArrayType>,
      operation: IData<OperationType>
    ) => {
      const values = getRawValueFromData(data, context) as unknown[];
      const result = R.indexBy(
        values,
        createCallback<string>(operation, context)
      );
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "groupByProp",
    parameters: [
      { type: { kind: "array", elementType: getObjectParam().type } },
      { type: { kind: "string" } },
    ],
    handler: (context, data: IData<ArrayType>, prop: IData<StringType>) => {
      const values = getRawValueFromData(data, context) as Record<
        string,
        unknown
      >[];
      const result = R.groupByProp(
        values,
        getRawValueFromData(prop, context) as never
      );
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "objOf",
    parameters: [{ type: { kind: "unknown" } }, { type: { kind: "string" } }],
    handler: (context, value: IData, key: IData<StringType>) => {
      const rawValue = getRawValueFromData(value, context);
      const result = R.objOf(
        rawValue,
        getRawValueFromData(key, context) as string
      );
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "pathOr",
    parameters: [
      getObjectParam(),
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "unknown" } },
    ],
    handler: (
      context,
      data: IData,
      path: IData<ArrayType>,
      defaultValue: IData
    ) => {
      const rawValue = getRawValueFromData(data, context);
      const pathArr = getRawValueFromData(path, context) as [never];
      const rawDefault = getRawValueFromData(defaultValue, context) as never;
      const result = R.pathOr(rawValue, pathArr, rawDefault);
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "set",
    parameters: [
      getObjectParam(),
      { type: { kind: "string" } },
      { type: { kind: "unknown" } },
    ],
    handler: (
      context,
      data: IData<ObjectType>,
      prop: IData<StringType>,
      value: IData
    ) => {
      const rawObj = getRawValueFromData(data, context) as Record<
        string,
        unknown
      >;
      const rawValue = getRawValueFromData(value, context);
      const result = R.set(rawObj, prop.value, rawValue);
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "setPath",
    parameters: [
      getObjectParam(),
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "unknown" } },
    ],
    handler: (context, data: IData, path: IData<ArrayType>, value: IData) => {
      const rawValue = getRawValueFromData(data, context);
      const pathArr = getRawValueFromData(path, context) as [];
      const val = getRawValueFromData(value, context);
      const result = R.setPath(rawValue, pathArr, val);
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "addProp",
    parameters: [
      getObjectParam(),
      { type: { kind: "string" } },
      { type: { kind: "unknown" } },
    ],
    handler: (context, data: IData, prop: IData<StringType>, value: IData) => {
      const rawValue = getRawValueFromData(data, context);
      const val = getRawValueFromData(value, context);
      const result = R.addProp(rawValue, prop.value, val);
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "swapProps",
    parameters: [
      getObjectParam(),
      { type: { kind: "string" } },
      { type: { kind: "string" } },
    ],
    handler: (
      context,
      data: IData<ObjectType>,
      key1: IData<StringType>,
      key2: IData<StringType>
    ) => {
      const rawObj = getRawValueFromData(data, context) as Record<
        string,
        unknown
      >;
      const rawKey1 = getRawValueFromData(key1, context) as string;
      const rawKey2 = getRawValueFromData(key2, context) as string;
      return createDataFromRawValue(
        R.swapProps(rawObj, rawKey1, rawKey2),
        context
      );
    },
  },
  {
    name: "evolve",
    parameters: [
      getObjectParam(),
      { type: { kind: "object", properties: [] } },
    ],
    handler: (context, data: IData<ObjectType>, evolver: IData<ObjectType>) => {
      const rawObj = getRawValueFromData(data, context) as Record<
        string,
        unknown
      >;
      const rawEvolver = getRawValueFromData(evolver, context) as Record<
        string,
        (data: unknown) => unknown
      >;
      return createDataFromRawValue(R.evolve(rawObj, rawEvolver), context);
    },
  },
  {
    name: "hasSubObject",
    parameters: [getObjectParam(), getObjectParam()],
    handler: (
      context,
      data: IData<ObjectType>,
      subObject: IData<ObjectType>
    ) => {
      const rawObj = getRawValueFromData(data, context) as Record<
        string,
        unknown
      >;
      const rawSubObj = getRawValueFromData(subObject, context) as Record<
        string,
        unknown
      >;
      return createDataFromRawValue(R.hasSubObject(rawObj, rawSubObj), context);
    },
  },
  {
    name: "length",
    parameters: [{ type: { kind: "array", elementType: { kind: "unknown" } } }],
    handler: (context, data: IData<ArrayType>) => {
      const values = getRawValueFromData(data, context) as [];
      return createDataFromRawValue(R.length(values), context);
    },
  },
  {
    name: "clone",
    parameters: [{ type: { kind: "unknown" } }],
    handler: (context, data: IData) => {
      const result = R.clone(getRawValueFromData(data, context));
      return createDataFromRawValue(result, context);
    },
  },
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
    handler: (context, data: IData, operation: IData<OperationType>) => {
      const rawValue = getRawValueFromData(data, context);
      const result = R.tap(rawValue, createCallback(operation, context));
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "forEachObj",
    parameters: (data) => getObjectCallbackParams(data, { withData: true }),
    handler: (
      context,
      data: IData<ObjectType | DictionaryType>,
      operation: IData<OperationType>
    ) => {
      const rawObj = getRawValueFromData(data, context) as Record<
        string,
        unknown
      >;
      R.forEachObj(rawObj, createCallback<void>(operation, context));
      return createDataFromRawValue(undefined, context);
    },
  },
  // Random operations using remeda
  {
    name: "isIncludedIn",
    parameters: [
      { type: { kind: "unknown" } },
      { type: { kind: "array", elementType: { kind: "unknown" } } },
    ],
    handler: (context, data: IData, container: IData<ArrayType>) => {
      const rawValue = getRawValueFromData(data, context);
      const containerArr = getRawValueFromData(container, context) as unknown[];
      return createDataFromRawValue(
        R.isIncludedIn(rawValue, containerArr),
        context
      );
    },
  },
  {
    name: "randomInteger",
    parameters: [{ type: { kind: "number" } }, { type: { kind: "number" } }],
    handler: (context, from: IData, to: IData) => {
      const result = R.randomInteger(
        getRawValueFromData(from, context) as number,
        getRawValueFromData(to, context) as number
      );
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "randomString",
    parameters: [{ type: { kind: "number" } }],
    handler: (context, length: IData) => {
      const result = R.randomString(
        getRawValueFromData(length, context) as number
      );
      return createDataFromRawValue(result, context);
    },
  },
  // Logic operations using remeda
  {
    name: "defaultTo",
    parameters: [{ type: { kind: "unknown" } }, { type: { kind: "unknown" } }],
    handler: (context, data: IData, fallback: IData) => {
      const rawValue = getRawValueFromData(data, context);
      const rawFallback = getRawValueFromData(fallback, context);
      return createDataFromRawValue(
        R.defaultTo(rawValue, rawFallback),
        context
      );
    },
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
    handler: async (context, data: IData, operations: IData<ArrayType>) => {
      const rawData = getRawValueFromData(data, context);
      const callbacks = operations.value.map((op) =>
        createCallback<boolean>(op.data as IData<OperationType>, context)
      );
      return createDataFromRawValue(R.allPass(rawData, callbacks), context);
    },
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
    handler: async (context, data: IData, operations: IData<ArrayType>) => {
      const rawData = getRawValueFromData(data, context);
      const callbacks = operations.value.map((op) =>
        createCallback<boolean>(op.data as IData<OperationType>, context)
      );
      return createDataFromRawValue(R.anyPass(rawData, callbacks), context);
    },
  },
];
