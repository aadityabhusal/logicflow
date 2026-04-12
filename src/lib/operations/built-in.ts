import { IData, OperationType, UnionType } from "../types";
import { InstanceTypes } from "../data";
import {
  createData,
  getUnionActiveType,
  isDataOfType,
  isTypeCompatible,
  updateContextWithNarrowedTypes,
  getRawValueFromData,
  createDataFromRawValue,
  createThenable,
  unwrapThenable,
  getStatementResult,
  createStatement,
  resolveUnionType,
  resolveConstructorArgs,
} from "../utils";
import { wretchOperations } from "./wretch";
import {
  createOperationHandler,
  FunctionKeys,
  getArrayCallbackParams,
  getObjectParam,
  getUnionParam,
  remedaOperations,
} from "./remeda";
import * as _ from "./runtime";
import { Context, OperationListItem } from "../execution/types";

export function createRuntimeError(error: unknown) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return createData({
    type: { kind: "error", errorType: "runtime_error" },
    value: { reason: errorMessage },
  });
}

const basicOperationList: (Omit<OperationListItem, "handler" | "source"> & {
  name: FunctionKeys<typeof _>;
})[] = [
  { name: "length", parameters: [{ type: { kind: "string" } }] },
  {
    name: "concat",
    parameters: [{ type: { kind: "string" } }, { type: { kind: "string" } }],
  },
  {
    name: "includes",
    parameters: [{ type: { kind: "string" } }, { type: { kind: "string" } }],
  },
  {
    name: "localeCompare",
    parameters: [{ type: { kind: "string" } }, { type: { kind: "string" } }],
  },
  {
    name: "power",
    parameters: [{ type: { kind: "number" } }, { type: { kind: "number" } }],
  },
  {
    name: "mod",
    parameters: [{ type: { kind: "number" } }, { type: { kind: "number" } }],
  },
  {
    name: "lessThan",
    parameters: [{ type: { kind: "number" } }, { type: { kind: "number" } }],
  },
  {
    name: "lessThanOrEqual",
    parameters: [{ type: { kind: "number" } }, { type: { kind: "number" } }],
  },
  {
    name: "greaterThan",
    parameters: [{ type: { kind: "number" } }, { type: { kind: "number" } }],
  },
  {
    name: "greaterThanOrEqual",
    parameters: [{ type: { kind: "number" } }, { type: { kind: "number" } }],
  },
  { name: "not", parameters: [{ type: { kind: "boolean" } }] },
  {
    name: "at",
    parameters: [
      { type: { kind: "tuple", elements: [] } },
      { type: { kind: "number" } },
    ],
  },
  {
    name: "join",
    parameters: [
      { type: { kind: "tuple", elements: [] } },
      { type: { kind: "string" } },
    ],
  },
  {
    name: "toArray",
    parameters: [{ type: { kind: "tuple", elements: [] } }],
    expectedType: { kind: "array", elementType: { kind: "unknown" } },
  },
  {
    name: "at",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "number" } },
    ],
  },
  {
    name: "indexOf",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "unknown" } },
    ],
  },
  {
    name: "lastIndexOf",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "unknown" } },
    ],
  },
  {
    name: "slice",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "number" }, isOptional: true },
      { type: { kind: "number" }, isOptional: true },
    ],
  },
  {
    name: "toTuple",
    parameters: [{ type: { kind: "array", elementType: { kind: "unknown" } } }],
    expectedType: { kind: "tuple", elements: [] },
  },
  { name: "get", parameters: [getObjectParam(), { type: { kind: "string" } }] },
  { name: "has", parameters: [getObjectParam(), { type: { kind: "string" } }] },
  {
    name: "toObject",
    parameters: [
      { type: { kind: "dictionary", elementType: { kind: "unknown" } } },
    ],
    expectedType: { kind: "object", properties: [], required: [] },
  },
  {
    name: "toDictionary",
    parameters: [{ type: { kind: "object", properties: [] } }],
    expectedType: { kind: "dictionary", elementType: { kind: "unknown" } },
  },
  {
    name: "some",
    parameters: (data) =>
      getArrayCallbackParams(data, { returnType: { kind: "boolean" } }),
  },
  {
    name: "every",
    parameters: (data) =>
      getArrayCallbackParams(data, { returnType: { kind: "boolean" } }),
  },
  {
    name: "log",
    parameters: [{ type: { kind: "unknown" }, isRest: true }],
  },
  { name: "toString", parameters: [{ type: { kind: "unknown" } }] },
  {
    name: "fetch",
    parameters: [
      { type: { kind: "string" } },
      {
        type: { kind: "dictionary", elementType: { kind: "unknown" } },
        name: "options",
        isOptional: true,
      },
    ],
    expectedType: {
      kind: "instance",
      className: "Response",
      constructorArgs: resolveConstructorArgs(
        InstanceTypes.Response.constructorArgs
      ),
    },
    shouldCacheResult: true,
  },
];

const lazyOperations: OperationListItem[] = [
  {
    name: "and",
    parameters: [{ type: { kind: "boolean" } }, { type: { kind: "unknown" } }],
    lazyHandler: (context, data, trueStatement) => {
      if (!getRawValueFromData(data, context)) {
        return createDataFromRawValue(false, context);
      }
      const execute = context.isSync
        ? context.executeStatementSync
        : context.executeStatement;

      const result = execute(
        trueStatement,
        updateContextWithNarrowedTypes(context, data)
      );

      return (result instanceof Promise ? result : createThenable(result)).then(
        (r) => createDataFromRawValue(getRawValueFromData(r, context), context)
      );
    },
  },
  {
    name: "or",
    parameters: [{ type: { kind: "boolean" } }, { type: { kind: "unknown" } }],
    lazyHandler: (context, data, falseStatement) => {
      if (getRawValueFromData(data, context)) {
        return createDataFromRawValue(true, context);
      }
      const execute = context.isSync
        ? context.executeStatementSync
        : context.executeStatement;

      const result = execute(
        falseStatement,
        updateContextWithNarrowedTypes(context, data)
      );

      return (result instanceof Promise ? result : createThenable(result)).then(
        (r) => createDataFromRawValue(getRawValueFromData(r, context), context)
      );
    },
  },
  {
    name: "thenElse",
    parameters: [
      { type: { kind: "boolean" } },
      { type: { kind: "unknown" } },
      { type: { kind: "unknown" }, isOptional: true },
    ],
    lazyHandler: (context, data, trueBranch, falseBranch?) => {
      const value = getRawValueFromData(data, context);
      const execute = context.isSync
        ? context.executeStatementSync
        : context.executeStatement;

      const result = value
        ? execute(
            trueBranch,
            updateContextWithNarrowedTypes(context, data, "thenElse", 0)
          )
        : falseBranch
          ? execute(
              falseBranch,
              updateContextWithNarrowedTypes(context, data, "thenElse", 1)
            )
          : createDataFromRawValue(undefined, context);

      return (result instanceof Promise ? result : createThenable(result)).then(
        (res) =>
          createDataFromRawValue(getRawValueFromData(res, context), {
            ...context,
            expectedType: resolveUnionType(
              value
                ? [res.type, getStatementResult(trueBranch, context).type]
                : [getStatementResult(trueBranch, context).type, res.type]
            ),
          })
      );
    },
  },
];

const specialOperations: OperationListItem[] = [
  {
    name: "isTypeOf",
    parameters: (data) => [getUnionParam(data), { type: { kind: "unknown" } }],
    handler: (context, data, type) => {
      return createData({
        type: { kind: "boolean" },
        value: isTypeCompatible(
          getUnionActiveType(data.type as UnionType, {
            value: data.value,
            context,
          }),
          type.type,
          context
        ),
      });
    },
    narrowType: (_, _data, param) => param.type,
  },
  {
    name: "call",
    parameters: (data) => [
      { type: isDataOfType(data, "operation") ? data.type : { kind: "never" } },
      ...(isDataOfType(data, "operation") ? data.type.parameters : []),
    ],
    handler: (context, data, ...params) => {
      const operation = getRawValueFromData(data, context) as (
        ..._: unknown[]
      ) => unknown;

      const restParamsIndex = (
        data as IData<OperationType>
      ).type.parameters.findIndex((p) => p.isRest);

      if (restParamsIndex !== -1) {
        const restParams = createData({
          value: params
            .slice(restParamsIndex)
            .map((data) => createStatement({ data })),
        });
        params = params.slice(0, restParamsIndex).concat(restParams);
      }

      const result = operation(
        ...params.map((p) => unwrapThenable(getRawValueFromData(p, context)))
      );
      return (result instanceof Promise ? result : createThenable(result)).then(
        (r) => createDataFromRawValue(r, context)
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
  method: (
    instance: InstanceValue<T>,
    context: Context,
    ...extraArgs: unknown[]
  ) => unknown,
  parameters: OperationListItem["parameters"] = []
): OperationListItem {
  return {
    name,
    parameters: (data) => [
      { type: { kind: "instance", className, constructorArgs: [] } },
      ...(typeof parameters === "function" ? parameters(data) : parameters),
    ],
    handler: (context, data, ...extraArgs) => {
      const instance = getRawValueFromData(data, context) as InstanceValue<T>;
      if (!instance) {
        return createRuntimeError(`${className} instance not found`);
      }
      const resolvedExtra = extraArgs.map((arg) =>
        getRawValueFromData(arg, context)
      );
      return createDataFromRawValue(
        method(instance, context, ...resolvedExtra),
        context
      );
    },
  };
}

const dateOperations: OperationListItem[] = [
  createInstanceOperation("Date", "getFullYear", (instance) =>
    instance.getFullYear()
  ),
  createInstanceOperation("Date", "getMonth", (instance) =>
    instance.getMonth()
  ),
  createInstanceOperation("Date", "getDate", (instance) => instance.getDate()),
  createInstanceOperation("Date", "getTime", (instance) => instance.getTime()),
  createInstanceOperation("Date", "getHours", (instance) =>
    instance.getHours()
  ),
  createInstanceOperation("Date", "getMinutes", (instance) =>
    instance.getMinutes()
  ),
  createInstanceOperation("Date", "getSeconds", (instance) =>
    instance.getSeconds()
  ),
  createInstanceOperation("Date", "toISOString", (instance) =>
    instance.toISOString()
  ),
  createInstanceOperation("Date", "toDateString", (instance) =>
    instance.toDateString()
  ),
];

const urlOperations: OperationListItem[] = [
  createInstanceOperation("URL", "getHref", (instance) => instance.href),
  createInstanceOperation("URL", "getOrigin", (instance) => instance.origin),
  createInstanceOperation(
    "URL",
    "getProtocol",
    (instance) => instance.protocol
  ),
  createInstanceOperation(
    "URL",
    "getHostname",
    (instance) => instance.hostname
  ),
  createInstanceOperation("URL", "getPort", (instance) => instance.port),
  createInstanceOperation(
    "URL",
    "getPathname",
    (instance) => instance.pathname
  ),
  createInstanceOperation("URL", "getSearch", (instance) => instance.search),
  createInstanceOperation("URL", "getHash", (instance) => instance.hash),
  createInstanceOperation("URL", "toString", (instance) => instance.toString()),
];

function getResolveCallbackType(data: IData): OperationType {
  const fallback: OperationType = {
    kind: "operation",
    parameters: [{ name: "value", type: { kind: "unknown" } }],
    result: { kind: "unknown" },
  };
  if (!isDataOfType(data, "instance")) return fallback;
  const resolveCallback = data.value.constructorArgs?.[0]?.data;
  if (!isDataOfType(resolveCallback, "operation")) return fallback;
  return isDataOfType(resolveCallback.value.parameters[0].data, "operation")
    ? {
        ...resolveCallback.value.parameters[0].data.type,
        result: { kind: "unknown" },
      }
    : fallback;
}

const promiseOperations: OperationListItem[] = [
  {
    name: "then",
    parameters: (data) => [
      { type: { kind: "instance", className: "Promise", constructorArgs: [] } },
      { type: getResolveCallbackType(data) },
    ],
    handler: (context, promiseData, callback) => {
      try {
        const promiseValue = getRawValueFromData(
          promiseData,
          context
        ) as Promise<unknown>;
        const newPromise = promiseValue.then(
          getRawValueFromData(callback, context) as (_: unknown) => unknown
        );
        return createDataFromRawValue(newPromise, {
          ...context,
          expectedType: (callback.type as OperationType).result,
        });
      } catch (error) {
        return createRuntimeError(error);
      }
    },
  },
  {
    name: "catch",
    parameters: [
      { type: { kind: "instance", className: "Promise", constructorArgs: [] } },
      {
        type: {
          kind: "operation",
          parameters: [{ name: "reason", type: { kind: "unknown" } }],
          result: { kind: "undefined" },
        },
      },
    ],
    handler: (context, promiseData, errorCallback) => {
      try {
        const promiseValue = getRawValueFromData(
          promiseData,
          context
        ) as Promise<unknown>;
        const newPromise = promiseValue.catch(
          getRawValueFromData(errorCallback, context) as (_: unknown) => unknown
        );
        return createDataFromRawValue(newPromise, {
          ...context,
          expectedType: (errorCallback.type as OperationType).result,
        });
      } catch (error) {
        return createRuntimeError(error);
      }
    },
  },
  {
    name: "await",
    parameters: [
      { type: { kind: "instance", className: "Promise", constructorArgs: [] } },
    ],
    handler: async (context, promiseData) => {
      try {
        const promiseValue = getRawValueFromData(
          promiseData,
          context
        ) as Promise<unknown>;
        const resolvedValue = await promiseValue;
        return createDataFromRawValue(resolvedValue, context);
      } catch (error) {
        return createRuntimeError(error);
      }
    },
  },
];

const responseOperations: OperationListItem[] = [
  {
    name: "json",
    parameters: [
      {
        type: { kind: "instance", className: "Response", constructorArgs: [] },
      },
    ],
    handler: (context, data) => {
      const instance = getRawValueFromData(data, context) as Response;
      if (!instance) return createRuntimeError("Response instance not found");
      return createDataFromRawValue(instance.clone().json(), context);
    },
  },
  {
    name: "text",
    parameters: [
      {
        type: { kind: "instance", className: "Response", constructorArgs: [] },
      },
    ],
    handler: (context, data) => {
      const instance = getRawValueFromData(data, context) as Response;
      if (!instance) return createRuntimeError("Response instance not found");
      return createDataFromRawValue(instance.clone().text(), {
        ...context,
        expectedType: { kind: "string" },
      });
    },
  },
  {
    name: "getStatus",
    parameters: [
      {
        type: { kind: "instance", className: "Response", constructorArgs: [] },
      },
    ],
    handler: (context, data) => {
      const instance = getRawValueFromData(data, context) as Response;
      if (!instance) return createRuntimeError("Response instance not found");
      return createDataFromRawValue(instance.status, context);
    },
  },
];

const requestOperations: OperationListItem[] = [
  createInstanceOperation("Request", "getUrl", (instance) => instance.url),
  createInstanceOperation(
    "Request",
    "getMethod",
    (instance) => instance.method
  ),
  createInstanceOperation(
    "Request",
    "getHeader",
    (instance, _context, headerName) =>
      instance.headers.get(headerName as string) || "",
    [{ type: { kind: "string" }, name: "headerName" }]
  ),
  createInstanceOperation(
    "Request",
    "getQuery",
    (instance, _context, paramName) =>
      new URL(instance.url).searchParams.get(paramName as string) || "",
    [{ type: { kind: "string" }, name: "paramName" }]
  ),
  createInstanceOperation(
    "Request",
    "getPath",
    (instance) => new URL(instance.url).pathname
  ),
  {
    name: "json",
    parameters: [
      {
        type: { kind: "instance", className: "Request", constructorArgs: [] },
      },
    ],
    handler: (context, data) => {
      const instance = getRawValueFromData(data, context) as Request;
      if (!instance) return createRuntimeError("Request instance not found");
      return createDataFromRawValue(instance.clone().json(), context);
    },
  },
  {
    name: "text",
    parameters: [
      {
        type: { kind: "instance", className: "Request", constructorArgs: [] },
      },
    ],
    handler: (context, data) => {
      const instance = getRawValueFromData(data, context) as Request;
      if (!instance) return createRuntimeError("Request instance not found");
      return createDataFromRawValue(instance.clone().text(), {
        ...context,
        expectedType: { kind: "string" },
      });
    },
  },
];

export const builtInOperations: OperationListItem[] = [
  ...basicOperationList.map((operation) => ({
    ...operation,
    handler: createOperationHandler(_, operation.name, operation.expectedType),
  })),
  ...lazyOperations,
  ...specialOperations,
  ...dateOperations,
  ...urlOperations,
  ...promiseOperations,
  ...responseOperations,
  ...wretchOperations,
  ...remedaOperations,
  ...requestOperations,
];
