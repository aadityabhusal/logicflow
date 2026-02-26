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
  createStatement,
  getStatementResult,
  operationToListItem,
} from "../utils";

function createRuntimeError(error: unknown): IData {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return createData({
    type: { kind: "error", errorType: "runtime_error" },
    value: { reason: errorMessage },
  });
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
    handler: (context, data: IData<NumberType>, p1: IData<ObjectType>) => {
      const [min, max] = p1.value.entries.map(
        (entry) => getStatementResult(entry.value, context).value as number
      );
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
      const values = data.value.map(
        (item) => getStatementResult(item, context).value as number
      );
      return createData({ type: { kind: "number" }, value: R.sum(values) });
    },
  },
  {
    name: "product",
    parameters: [{ type: { kind: "array", elementType: { kind: "number" } } }],
    handler: (context, data: IData<ArrayType>) => {
      const values = data.value.map(
        (item) => getStatementResult(item, context).value as number
      );
      return createData({ type: { kind: "number" }, value: R.product(values) });
    },
  },
  {
    name: "mean",
    parameters: [{ type: { kind: "array", elementType: { kind: "number" } } }],
    handler: (context, data: IData<ArrayType>) => {
      const values = data.value.map(
        (item) => getStatementResult(item, context).value as number
      );
      return createData({ type: { kind: "number" }, value: R.mean(values) });
    },
  },
  {
    name: "median",
    parameters: [{ type: { kind: "array", elementType: { kind: "number" } } }],
    handler: (context, data: IData<ArrayType>) => {
      const values = data.value.map(
        (item) => getStatementResult(item, context).value as number
      );
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
        ? options.value.entries.map(
            (entry) => getStatementResult(entry.value, context).value as string
          )
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
    handler: (_, data: IData<StringType>) => {
      const result = R.stringToPath(data.value);
      return createData({
        type: {
          kind: "array",
          elementType: {
            kind: "union",
            types: [{ kind: "string" }, { kind: "number" }],
          },
        },
        value: result.map((item) =>
          createStatement({
            data: createData(
              typeof item === "number"
                ? { type: { kind: "number" }, value: item }
                : { type: { kind: "string" }, value: item }
            ),
          })
        ),
      });
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
];
