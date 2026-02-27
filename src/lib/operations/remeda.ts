import * as R from "remeda";
import {
  ArrayType,
  Context,
  DataType,
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
  getStatementResult,
  isDataOfType,
  operationToListItem,
} from "../utils";

function createRuntimeError(error: unknown): IData {
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

function getArrayCallbackParameters(data: IData, returnType?: DataType) {
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
        result: returnType ?? { kind: "unknown" },
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
          createStatement({ data: createData(itemData) }),
          createStatement({
            data: createData({ type: { kind: "number" }, value: index }),
            isOptional: true,
          }),
          createStatement({ data, isOptional: true }),
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
    parameters: (data) => getArrayCallbackParameters(data, { kind: "number" }),
    handler: async (
      context,
      data: IData<ArrayType>,
      operation: IData<OperationType>
    ) => {
      const values = await executeArrayOperation(data, operation, context);
      const result = R.sumBy(
        values.map((item) => item.value),
        (x) => x as number
      );
      return createData({ type: { kind: "number" }, value: result });
    },
  },
  {
    name: "meanBy",
    parameters: (data) => getArrayCallbackParameters(data, { kind: "number" }),
    handler: async (
      context,
      data: IData<ArrayType>,
      operation: IData<OperationType>
    ) => {
      const values = await executeArrayOperation(data, operation, context);
      const result = R.meanBy(
        values.map((item) => item.value),
        (x) => x as number
      );
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
    handler: async (
      context,
      data: IData<NumberType>,
      operation: IData<OperationType>
    ) => {
      const range = createDataFromRawValue(
        R.range(0, data.value),
        context
      ) as IData<ArrayType>;
      const values = await executeArrayOperation(range, operation, context);
      const result = R.sumBy(
        values.map((item) => item.value),
        (x) => x as number
      );
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
    parameters: (data) => getArrayCallbackParameters(data, { kind: "boolean" }),
    handler: async (
      context,
      data: IData<ArrayType>,
      operation: IData<OperationType>
    ) => {
      const values = getRawValueFromData(data, context) as [];
      const conditions = await executeArrayOperation(data, operation, context);
      const result = R.splitWhen(
        values,
        (_, i) => conditions[i].value as boolean
      );
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
    parameters: (data) => [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      {
        type: isDataOfType(data, "array")
          ? data.type.elementType
          : { kind: "unknown" },
      },
      ...getArrayCallbackParameters(data).slice(1),
    ],
    handler: async (
      context,
      data: IData<ArrayType>,
      item: IData,
      operation: IData<OperationType>
    ) => {
      const values = getRawValueFromData(data, context) as unknown[];
      const itemValue = getRawValueFromData(item, context);
      const arrResults = await executeArrayOperation(data, operation, context);
      const result = R.sortedIndexBy(values, itemValue, async (_, i) =>
        i ? arrResults[i].value : undefined
      );
      return createDataFromRawValue(result, context);
    },
  },
  {
    name: "sortedIndexWith",
    parameters: (data) => getArrayCallbackParameters(data, { kind: "boolean" }),
    handler: async (
      context,
      data: IData<ArrayType>,
      operation: IData<OperationType>
    ) => {
      const values = await executeArrayOperation(data, operation, context);
      const result = R.sortedIndexWith(
        values.map((item) => item.value),
        (x) => x as boolean
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
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "unknown" } },
      {
        type: {
          kind: "operation",
          parameters: [
            { name: "item", type: { kind: "unknown" } },
            { name: "index", type: { kind: "number" }, isOptional: true },
          ],
          result: { kind: "unknown" },
        },
      },
    ],
    handler: async (
      context,
      data: IData<ArrayType>,
      item: IData,
      operation: IData<OperationType>
    ) => {
      const values = getRawValueFromData(data, context) as unknown[];
      const itemValue = getRawValueFromData(item, context);
      const arrResults = await executeArrayOperation(data, operation, context);
      const result = R.sortedLastIndexBy(values, itemValue, async (_, i) =>
        i ? arrResults[i].value : undefined
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
];
