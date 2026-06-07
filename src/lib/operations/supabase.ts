import { createClient } from "@supabase/supabase-js";
import { IData, DataType, OperationType } from "@/lib/types";
import {
  createDataFromRawValue,
  getRawValueFromData,
  isObject,
  createRuntimeError,
} from "@/lib/utils";
import { customInstances, InstanceTypeConfig } from "@/lib/packages/registry";
import { Context, OperationListItem } from "@/lib/execution/types";

class SupabaseClientClass {
  static [Symbol.hasInstance](instance: unknown): boolean {
    return (
      typeof instance === "object" &&
      instance !== null &&
      (customInstances.get(instance) === SupabaseClientClass ||
        ("from" in instance && "rpc" in instance && "functions" in instance))
    );
  }
}

class SupabaseQueryBuilderClass {
  static [Symbol.hasInstance](instance: unknown): boolean {
    return (
      typeof instance === "object" &&
      instance !== null &&
      (customInstances.get(instance) === SupabaseQueryBuilderClass ||
        ("select" in instance && "insert" in instance && "url" in instance))
    );
  }
}

class SupabaseBuilderClass {
  static [Symbol.hasInstance](instance: unknown): boolean {
    return (
      typeof instance === "object" &&
      instance !== null &&
      (customInstances.get(instance) === SupabaseBuilderClass ||
        ("then" in instance && "url" in instance))
    );
  }
}

const TString: DataType = { kind: "string" };
const TNumber: DataType = { kind: "number" };
const TBoolean: DataType = { kind: "boolean" };
const TUnknown: DataType = { kind: "unknown" };
const TDict: DataType = {
  kind: "dictionary",
  elementType: { kind: "unknown" },
};
const TUnknownArray: DataType = { kind: "array", elementType: TUnknown };

const ClientType: DataType = {
  kind: "instance",
  className: "supabase.Client",
  constructorArgs: [],
};

const QueryBuilderType: DataType = {
  kind: "instance",
  className: "supabase.QueryBuilder",
  constructorArgs: [],
};

const BuilderType: DataType = {
  kind: "instance",
  className: "supabase.Builder",
  constructorArgs: [],
};

function wrapBuilder(
  value: unknown,
  context: Context,
  expectedType?: DataType
): IData {
  if (isObject(value) && !customInstances.has(value)) {
    if ("select" in value && "insert" in value && "url" in value) {
      customInstances.set(value, SupabaseQueryBuilderClass);
    } else if ("then" in value && "url" in value) {
      customInstances.set(value, SupabaseBuilderClass);
    }
  }

  return createDataFromRawValue(value, {
    ...context,
    expectedType: expectedType ?? BuilderType,
  });
}

function callMethod(target: object, path: string, args: unknown[]) {
  const segments = path.split(".");
  let receiver = target;

  for (const segment of segments.slice(0, -1)) {
    const next = (receiver as Record<string, unknown>)[segment];
    if (!isObject(next)) throw new Error(`Supabase member "${path}" not found`);
    receiver = next;
  }

  const methodName = segments[segments.length - 1];
  const method = (receiver as Record<string, unknown>)[methodName];
  if (typeof method !== "function") {
    throw new Error(`Supabase method "${path}" not found`);
  }

  return method.apply(receiver, args);
}

type MethodOperationSpec = Omit<
  OperationListItem,
  "handler" | "parameters" | "source"
> & {
  inputType: DataType;
  sourceName: string;
  parameters?: OperationListItem["parameters"];
  resultType?: DataType;
  wrapResult?: boolean;
};

function getParameters(
  parameters: OperationListItem["parameters"] | undefined,
  data: IData
) {
  if (!parameters) return [];
  return typeof parameters === "function" ? parameters(data) : parameters;
}

function createMethodOperation({
  inputType,
  sourceName,
  parameters,
  resultType,
  wrapResult = true,
  ...operation
}: MethodOperationSpec): OperationListItem {
  return {
    ...operation,
    expectedType: resultType,
    parameters: (data) => [
      { type: inputType },
      ...getParameters(parameters, data),
    ],
    source: {
      name: sourceName,
      callStyle: "method",
    },
    handler: (context, data: IData, ...args: IData[]) => {
      const instance = getRawValueFromData(data, context);
      if (!isObject(instance)) {
        return createRuntimeError("Supabase instance not found");
      }

      try {
        const rawArgs = args.map((arg) => getRawValueFromData(arg, context));
        const result = callMethod(instance, operation.name, rawArgs);
        return wrapResult
          ? wrapBuilder(result, context, resultType)
          : createDataFromRawValue(result, context);
      } catch (error) {
        return createRuntimeError(error);
      }
    },
  };
}

const createClientOp: OperationListItem = {
  name: "createClient",
  parameters: [
    { type: TString, name: "url" },
    { type: TString, name: "key" },
    { type: TDict, name: "options", isOptional: true },
  ],
  shouldCacheResult: true,
  expectedType: ClientType,
  source: { name: "supabase" },
  handler: (context, urlData, keyData, optionsData) => {
    try {
      const url = getRawValueFromData(urlData, context) as string;
      const key = getRawValueFromData(keyData, context) as string;
      const options = optionsData
        ? (getRawValueFromData(optionsData, context) as Record<string, unknown>)
        : undefined;
      const result = createClient(url, key, options);

      if (isObject(result) && !customInstances.has(result)) {
        customInstances.set(result, SupabaseClientClass);
      }

      return createDataFromRawValue(result, {
        ...context,
        expectedType: ClientType,
      });
    } catch (error) {
      return createRuntimeError(error);
    }
  },
};

const clientOperationList: MethodOperationSpec[] = [
  {
    name: "from",
    inputType: ClientType,
    sourceName: "supabaseClient",
    parameters: [{ type: TString, name: "table" }],
    resultType: QueryBuilderType,
  },
  {
    name: "schema",
    inputType: ClientType,
    sourceName: "supabaseClient",
    parameters: [{ type: TString, name: "schema" }],
    resultType: ClientType,
  },
  {
    name: "rpc",
    inputType: ClientType,
    sourceName: "supabaseClient",
    parameters: [
      { type: TString, name: "functionName" },
      { type: TDict, name: "args", isOptional: true },
      { type: TDict, name: "options", isOptional: true },
    ],
    resultType: BuilderType,
  },
];

const queryBuilderOperationList: MethodOperationSpec[] = [
  {
    name: "select",
    inputType: QueryBuilderType,
    sourceName: "supabaseQueryBuilder",
    parameters: [
      { type: TString, name: "columns", isOptional: true },
      { type: TDict, name: "options", isOptional: true },
    ],
    resultType: BuilderType,
  },
  {
    name: "insert",
    inputType: QueryBuilderType,
    sourceName: "supabaseQueryBuilder",
    parameters: [
      { type: TUnknown, name: "values" },
      { type: TDict, name: "options", isOptional: true },
    ],
    resultType: BuilderType,
  },
  {
    name: "upsert",
    inputType: QueryBuilderType,
    sourceName: "supabaseQueryBuilder",
    parameters: [
      { type: TUnknown, name: "values" },
      { type: TDict, name: "options", isOptional: true },
    ],
    resultType: BuilderType,
  },
  {
    name: "update",
    inputType: QueryBuilderType,
    sourceName: "supabaseQueryBuilder",
    parameters: [
      { type: TUnknown, name: "values" },
      { type: TDict, name: "options", isOptional: true },
    ],
    resultType: BuilderType,
  },
  {
    name: "delete",
    inputType: QueryBuilderType,
    sourceName: "supabaseQueryBuilder",
    parameters: [{ type: TDict, name: "options", isOptional: true }],
    resultType: BuilderType,
  },
];

const columnValueParams = [
  { type: TString, name: "column" },
  { type: TUnknown, name: "value" },
];

const builderOperationList: MethodOperationSpec[] = [
  {
    name: "select",
    inputType: BuilderType,
    sourceName: "supabaseBuilder",
    parameters: [{ type: TString, name: "columns", isOptional: true }],
    resultType: BuilderType,
  },
  ...[
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "is",
    "contains",
    "containedBy",
    "overlaps",
  ].map((name) => ({
    name,
    inputType: BuilderType,
    sourceName: "supabaseBuilder",
    parameters: columnValueParams,
    resultType: BuilderType,
  })),
  ...[
    "like",
    "ilike",
    "likeAllOf",
    "likeAnyOf",
    "ilikeAllOf",
    "ilikeAnyOf",
    "regexMatch",
    "regexIMatch",
  ].map((name) => ({
    name,
    inputType: BuilderType,
    sourceName: "supabaseBuilder",
    parameters: [
      { type: TString, name: "column" },
      {
        type:
          name.endsWith("AllOf") || name.endsWith("AnyOf")
            ? TUnknownArray
            : TString,
        name:
          name.endsWith("AllOf") || name.endsWith("AnyOf")
            ? "patterns"
            : "pattern",
      },
    ],
    resultType: BuilderType,
  })),
  ...["in", "notIn"].map((name) => ({
    name,
    inputType: BuilderType,
    sourceName: "supabaseBuilder",
    parameters: [
      { type: TString, name: "column" },
      { type: TUnknownArray, name: "values" },
    ],
    resultType: BuilderType,
  })),
  {
    name: "match",
    inputType: BuilderType,
    sourceName: "supabaseBuilder",
    parameters: [{ type: TDict, name: "query" }],
    resultType: BuilderType,
  },
  ...["not", "filter"].map((name) => ({
    name,
    inputType: BuilderType,
    sourceName: "supabaseBuilder",
    parameters: [
      { type: TString, name: "column" },
      { type: TString, name: "operator" },
      { type: TUnknown, name: "value" },
    ],
    resultType: BuilderType,
  })),
  {
    name: "isDistinct",
    inputType: BuilderType,
    sourceName: "supabaseBuilder",
    parameters: columnValueParams,
    resultType: BuilderType,
  },
  {
    name: "or",
    inputType: BuilderType,
    sourceName: "supabaseBuilder",
    parameters: [
      { type: TString, name: "filters" },
      { type: TDict, name: "options", isOptional: true },
    ],
    resultType: BuilderType,
  },
  ...["rangeGt", "rangeGte", "rangeLt", "rangeLte", "rangeAdjacent"].map(
    (name) => ({
      name,
      inputType: BuilderType,
      sourceName: "supabaseBuilder",
      parameters: [
        { type: TString, name: "column" },
        { type: TString, name: "range" },
      ],
      resultType: BuilderType,
    })
  ),
  {
    name: "textSearch",
    inputType: BuilderType,
    sourceName: "supabaseBuilder",
    parameters: [
      { type: TString, name: "column" },
      { type: TString, name: "query" },
      { type: TDict, name: "options", isOptional: true },
    ],
    resultType: BuilderType,
  },
  {
    name: "order",
    inputType: BuilderType,
    sourceName: "supabaseBuilder",
    parameters: [
      { type: TString, name: "column" },
      { type: TDict, name: "options", isOptional: true },
    ],
    resultType: BuilderType,
  },
  {
    name: "limit",
    inputType: BuilderType,
    sourceName: "supabaseBuilder",
    parameters: [
      { type: TNumber, name: "count" },
      { type: TDict, name: "options", isOptional: true },
    ],
    resultType: BuilderType,
  },
  {
    name: "range",
    inputType: BuilderType,
    sourceName: "supabaseBuilder",
    parameters: [
      { type: TNumber, name: "from" },
      { type: TNumber, name: "to" },
      { type: TDict, name: "options", isOptional: true },
    ],
    resultType: BuilderType,
  },
  ...[
    "single",
    "maybeSingle",
    "csv",
    "geojson",
    "throwOnError",
    "stripNulls",
    "rollback",
  ].map((name) => ({
    name,
    inputType: BuilderType,
    sourceName: "supabaseBuilder",
    parameters: [],
    resultType: BuilderType,
  })),
  {
    name: "explain",
    inputType: BuilderType,
    sourceName: "supabaseBuilder",
    parameters: [{ type: TDict, name: "options", isOptional: true }],
    resultType: BuilderType,
  },
  {
    name: "maxAffected",
    inputType: BuilderType,
    sourceName: "supabaseBuilder",
    parameters: [{ type: TNumber, name: "value" }],
    resultType: BuilderType,
  },
  {
    name: "retry",
    inputType: BuilderType,
    sourceName: "supabaseBuilder",
    parameters: [{ type: TBoolean, name: "enabled" }],
    resultType: BuilderType,
  },
  {
    name: "setHeader",
    inputType: BuilderType,
    sourceName: "supabaseBuilder",
    parameters: [
      { type: TString, name: "name" },
      { type: TString, name: "value" },
    ],
    resultType: BuilderType,
  },
  {
    name: "abortSignal",
    inputType: BuilderType,
    sourceName: "supabaseBuilder",
    parameters: [{ type: TUnknown, name: "signal" }],
    resultType: BuilderType,
  },
];

const builderThenOp: OperationListItem = {
  name: "then",
  parameters: [
    { type: BuilderType },
    {
      type: {
        kind: "operation",
        parameters: [{ name: "value", type: TUnknown }],
        result: TUnknown,
      },
      name: "callback",
    },
  ],
  source: {
    name: "supabaseBuilder",
    callStyle: "method",
  },
  handler: (context, builderData, callbackData) => {
    const builder = getRawValueFromData(builderData, context);
    if (!isObject(builder)) {
      return createRuntimeError("Supabase builder not found");
    }

    try {
      const result = callMethod(builder, "then", [
        getRawValueFromData(callbackData, context),
      ]);
      return createDataFromRawValue(result, {
        ...context,
        expectedType: (callbackData.type as OperationType).result,
      });
    } catch (error) {
      return createRuntimeError(error);
    }
  },
};

const functionsInvokeOp = createMethodOperation({
  name: "functions.invoke",
  inputType: ClientType,
  sourceName: "supabaseFunctions",
  parameters: [
    { type: TString, name: "functionName" },
    { type: TDict, name: "options", isOptional: true },
  ],
  wrapResult: false,
});

export const operations: OperationListItem[] = [
  createClientOp,
  ...clientOperationList.map(createMethodOperation),
  ...queryBuilderOperationList.map(createMethodOperation),
  ...builderOperationList.map(createMethodOperation),
  builderThenOp,
  functionsInvokeOp,
];

export const instanceTypes: Record<string, InstanceTypeConfig> = {
  "supabase.Client": {
    name: "supabase.Client",
    Constructor: SupabaseClientClass,
    constructorArgs: [],
    hideFromDropdown: true,
    importInfo: { packageName: "supabase" },
  },
  "supabase.QueryBuilder": {
    name: "supabase.QueryBuilder",
    Constructor: SupabaseQueryBuilderClass,
    constructorArgs: [],
    hideFromDropdown: true,
    importInfo: { packageName: "supabase" },
  },
  "supabase.Builder": {
    name: "supabase.Builder",
    Constructor: SupabaseBuilderClass,
    constructorArgs: [],
    hideFromDropdown: true,
    importInfo: { packageName: "supabase" },
  },
};

export default { operations, instanceTypes };
