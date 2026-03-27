import { IData, IStatement, OperationType, UnionType } from "../types";
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
  resolveConstructorArgs,
  resolveUnionType,
  getStatementResult,
  createStatement,
  isObject,
} from "../utils";
import { wretchOperations } from "./wretch";
import {
  getArrayCallbackParams,
  getObjectParam,
  getUnionParam,
  remedaOperations,
} from "./remeda";
import { Context, OperationListItem } from "../execution/types";

export function createRuntimeError(error: unknown): IData {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return createData({
    type: { kind: "error", errorType: "runtime_error" },
    value: { reason: errorMessage },
  });
}

const unknownOperations: OperationListItem[] = [
  {
    name: "toString",
    parameters: [{ type: { kind: "unknown" } }],
    handler: (context, data: IData) => {
      const rawValue = getRawValueFromData(data, context);
      const value =
        isObject(rawValue, ["toString"]) &&
        typeof rawValue.toString === "function"
          ? rawValue.toString()
          : JSON.stringify(rawValue);
      return createDataFromRawValue(value, context);
    },
  },
  {
    name: "log",
    parameters: [{ type: { kind: "unknown" }, isRest: true }],
    handler: (context, data: IData) => {
      const value = console.log(getRawValueFromData(data, context));
      return createDataFromRawValue(value, context);
    },
  },
];

const unionOperations: OperationListItem[] = [
  {
    name: "isTypeOf",
    parameters: (data) => [getUnionParam(data), { type: { kind: "unknown" } }],
    handler: (context, data: IData, type: IData) => {
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
];

const undefinedOperations: OperationListItem[] = [];

const booleanOperations: OperationListItem[] = [
  {
    name: "and",
    parameters: [{ type: { kind: "boolean" } }, { type: { kind: "unknown" } }],
    lazyHandler: (context, data: IData, trueStatement: IStatement) => {
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
    lazyHandler: (context, data: IData, falseStatement: IStatement) => {
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
    name: "not",
    parameters: [{ type: { kind: "boolean" } }],
    handler: (context, data: IData) => {
      const value = getRawValueFromData(data, context);
      return createDataFromRawValue(!value, context);
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
      data: IData,
      trueBranch: IStatement,
      falseBranch?: IStatement
    ) => {
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

const stringOperations: OperationListItem[] = [
  {
    name: "length",
    parameters: [{ type: { kind: "string" } }],
    handler: (context, data: IData) => {
      const value = getRawValueFromData(data, context) as string;
      return createDataFromRawValue(value.length, context);
    },
  },
  {
    name: "concat",
    parameters: [{ type: { kind: "string" } }, { type: { kind: "string" } }],
    handler: (context, data: IData, p1: IData) => {
      const value = getRawValueFromData(data, context) as string;
      const p1Value = getRawValueFromData(p1, context) as string;
      return createDataFromRawValue(value.concat(p1Value), context);
    },
  },
  {
    name: "includes",
    parameters: [{ type: { kind: "string" } }, { type: { kind: "string" } }],
    handler: (context, data: IData, p1: IData) => {
      const value = getRawValueFromData(data, context) as string;
      const p1Value = getRawValueFromData(p1, context) as string;
      return createDataFromRawValue(value.includes(p1Value), context);
    },
  },
  {
    name: "localeCompare",
    parameters: [{ type: { kind: "string" } }, { type: { kind: "string" } }],
    handler: (context, data: IData, p1: IData) => {
      const value = getRawValueFromData(data, context) as string;
      const p1Value = getRawValueFromData(p1, context) as string;
      return createDataFromRawValue(value.localeCompare(p1Value), context);
    },
  },
];

const numberOperations: OperationListItem[] = [
  {
    name: "power",
    parameters: [{ type: { kind: "number" } }, { type: { kind: "number" } }],
    handler: (context, data: IData, p1: IData) => {
      const value = getRawValueFromData(data, context) as number;
      const p1Value = getRawValueFromData(p1, context) as number;
      return createDataFromRawValue(Math.pow(value, p1Value), context);
    },
  },
  {
    name: "mod",
    parameters: [{ type: { kind: "number" } }, { type: { kind: "number" } }],
    handler: (context, data: IData, p1: IData) => {
      const value = getRawValueFromData(data, context) as number;
      const p1Value = getRawValueFromData(p1, context) as number;
      return createDataFromRawValue(value % p1Value, context);
    },
  },
  {
    name: "lessThan",
    parameters: [{ type: { kind: "number" } }, { type: { kind: "number" } }],
    handler: (context, data: IData, p1: IData) => {
      const value = getRawValueFromData(data, context) as number;
      const p1Value = getRawValueFromData(p1, context) as number;
      return createDataFromRawValue(value < p1Value, context);
    },
  },
  {
    name: "lessThanOrEqual",
    parameters: [{ type: { kind: "number" } }, { type: { kind: "number" } }],
    handler: (context, data: IData, p1: IData) => {
      const value = getRawValueFromData(data, context) as number;
      const p1Value = getRawValueFromData(p1, context) as number;
      return createDataFromRawValue(value <= p1Value, context);
    },
  },
  {
    name: "greaterThan",
    parameters: [{ type: { kind: "number" } }, { type: { kind: "number" } }],
    handler: (context, data: IData, p1: IData) => {
      const value = getRawValueFromData(data, context) as number;
      const p1Value = getRawValueFromData(p1, context) as number;
      return createDataFromRawValue(value > p1Value, context);
    },
  },
  {
    name: "greaterThanOrEqual",
    parameters: [{ type: { kind: "number" } }, { type: { kind: "number" } }],
    handler: (context, data: IData, p1: IData) => {
      const value = getRawValueFromData(data, context) as number;
      const p1Value = getRawValueFromData(p1, context) as number;
      return createDataFromRawValue(value >= p1Value, context);
    },
  },
];

const tupleOperations: OperationListItem[] = [
  {
    name: "get",
    parameters: [
      { type: { kind: "tuple", elements: [] } },
      { type: { kind: "number" } },
    ],
    handler: (context, data: IData, p1: IData) => {
      const value = getRawValueFromData(data, context) as [];
      const p1Value = getRawValueFromData(p1, context) as number;
      return createDataFromRawValue(value.at(p1Value), context);
    },
  },
  {
    name: "length",
    parameters: [{ type: { kind: "tuple", elements: [] } }],
    handler: (context, data: IData) => {
      const value = getRawValueFromData(data, context) as [];
      return createDataFromRawValue(value.length, context);
    },
  },
  {
    name: "join",
    parameters: [
      { type: { kind: "tuple", elements: [] } },
      { type: { kind: "string" } },
    ],
    handler: (context, data: IData, p1: IData) => {
      const value = getRawValueFromData(data, context) as [];
      const p1Value = getRawValueFromData(p1, context) as string;
      return createDataFromRawValue(value.join(p1Value), context);
    },
  },
];

const arrayOperations: OperationListItem[] = [
  {
    name: "at",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "number" } },
    ],
    handler: (context, data: IData, index: IData) => {
      const value = getRawValueFromData(data, context) as unknown[];
      const indexValue = getRawValueFromData(index, context) as number;
      return createDataFromRawValue(value.at(indexValue), context);
    },
  },
  {
    name: "includes",
    parameters: [
      { type: { kind: "array", elementType: { kind: "string" } } },
      { type: { kind: "unknown" } },
    ],
    handler: (context, data: IData, element: IData) => {
      const value = getRawValueFromData(data, context) as unknown[];
      const elementValue = getRawValueFromData(element, context);
      return createDataFromRawValue(value.includes(elementValue), context);
    },
  },
  {
    name: "indexOf",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "unknown" } },
    ],
    handler: (context, data: IData, element: IData) => {
      const value = getRawValueFromData(data, context) as unknown[];
      const elementValue = getRawValueFromData(element, context);
      return createDataFromRawValue(value.indexOf(elementValue), context);
    },
  },
  {
    name: "lastIndexOf",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "unknown" } },
    ],
    handler: (context, data: IData, element: IData) => {
      const value = getRawValueFromData(data, context) as unknown[];
      const elementValue = getRawValueFromData(element, context);
      return createDataFromRawValue(value.lastIndexOf(elementValue), context);
    },
  },
  {
    name: "slice",
    parameters: [
      { type: { kind: "array", elementType: { kind: "unknown" } } },
      { type: { kind: "number" }, isOptional: true },
      { type: { kind: "number" }, isOptional: true },
    ],
    handler: (context, data: IData, start: IData, end: IData) => {
      const value = getRawValueFromData(data, context) as unknown[];
      const startValue = getRawValueFromData(start, context) as number;
      const endValue = getRawValueFromData(end, context) as number;
      return createDataFromRawValue(value.slice(startValue, endValue), context);
    },
  },
  {
    name: "some",
    parameters: (data) =>
      getArrayCallbackParams(data, { returnType: { kind: "boolean" } }),
    handler: (context, data: IData, callback: IData) => {
      const _context = { ...context, isSync: true } as Context;
      const value = getRawValueFromData(data, _context) as unknown[];
      const callbackOp = getRawValueFromData(callback, _context) as (
        ...args: unknown[]
      ) => unknown;
      return createDataFromRawValue(value.some(callbackOp), _context);
    },
  },
  {
    name: "every",
    parameters: (data) =>
      getArrayCallbackParams(data, { returnType: { kind: "boolean" } }),
    handler: (context, data: IData, callback: IData) => {
      const _context = { ...context, isSync: true } as Context;
      const value = getRawValueFromData(data, _context) as unknown[];
      const callbackOp = getRawValueFromData(callback, _context) as (
        ...args: unknown[]
      ) => unknown;
      return createDataFromRawValue(value.every(callbackOp), _context);
    },
  },
];

const dictionaryOperations: OperationListItem[] = [
  {
    name: "get",
    parameters: [getObjectParam(), { type: { kind: "string" } }],
    handler: (context, data: IData, p1: IData) => {
      const value = getRawValueFromData(data, context) as Record<
        string,
        unknown
      >;
      const p1Value = getRawValueFromData(p1, context) as string;
      return createDataFromRawValue(value[p1Value], context);
    },
  },
  {
    name: "has",
    parameters: [getObjectParam(), { type: { kind: "string" } }],
    handler: (context, data: IData, p1: IData) => {
      const value = getRawValueFromData(data, context) as Record<
        string,
        unknown
      >;
      const p1Value = getRawValueFromData(p1, context) as string;
      return createDataFromRawValue(p1Value in value, context);
    },
  },
];

const operationOperations: OperationListItem[] = [
  {
    name: "call",
    parameters: (data) => [
      { type: isDataOfType(data, "operation") ? data.type : { kind: "never" } },
      ...(isDataOfType(data, "operation") ? data.type.parameters : []),
    ],
    handler: (context, data: IData, ...params: IData[]) => {
      const operation = getRawValueFromData(data, context) as (
        ..._: unknown[]
      ) => unknown;

      const restParamsIndex = (
        data as IData<OperationType>
      ).value.parameters.findIndex((p) => p.isRest);

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
  method: (instance: InstanceValue<T>, context: Context) => Partial<IData>,
  parameters: OperationListItem["parameters"] = []
): OperationListItem {
  return {
    name,
    parameters: (data) => [
      { type: { kind: "instance", className, constructorArgs: [] } },
      ...(typeof parameters === "function" ? parameters(data) : parameters),
    ],
    handler: (context, data: IData) => {
      const instance = getRawValueFromData(data, context) as InstanceValue<T>;
      if (!instance) {
        return createRuntimeError(`${className} instance not found`);
      }
      // TODO: use this like when this function works with a persistent instance
      // context.setInstance(data.value.instanceId, instance);
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

function getResolveCallbackType(data: IData): OperationType {
  const fallback: OperationType = {
    kind: "operation",
    parameters: [{ name: "value", type: { kind: "unknown" } }],
    result: { kind: "undefined" },
  };
  if (!isDataOfType(data, "instance")) return fallback;
  const resolveCallback = data.value.constructorArgs?.[0]?.data;
  if (!isDataOfType(resolveCallback, "operation")) return fallback;
  return isDataOfType(resolveCallback.value.parameters[0].data, "operation")
    ? resolveCallback.value.parameters[0].data.type
    : fallback;
}

const promiseOperations: OperationListItem[] = [
  {
    name: "then",
    parameters: (data) => [
      { type: { kind: "instance", className: "Promise", constructorArgs: [] } },
      { type: getResolveCallbackType(data) },
    ],
    isAsync: true,
    handler: (context, promiseData: IData, callback: IData) => {
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
    isAsync: true,
    handler: (context, promiseData: IData, errorCallback: IData) => {
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
    handler: async (context, promiseData: IData) => {
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
  {
    name: "fetch",
    shouldCacheResult: true,
    isAsync: true,
    parameters: [
      { type: { kind: "string" } },
      {
        type: { kind: "dictionary", elementType: { kind: "unknown" } },
        name: "options",
        isOptional: true,
      },
    ],
    handler: (context, url: IData, options?: IData) => {
      const urlValue = getRawValueFromData(url, context) as string;
      const fetchOptions = options?.value
        ? (getRawValueFromData(options, context) as Record<string, unknown>)
        : undefined;
      const fetchPromise = fetch(urlValue, fetchOptions);
      return createDataFromRawValue(fetchPromise, {
        ...context,
        expectedType: {
          kind: "instance",
          className: "Response",
          constructorArgs: resolveConstructorArgs(
            InstanceTypes.Response.constructorArgs
          ),
        },
      });
    },
  },
];

const responseOperations: OperationListItem[] = [
  {
    name: "json",
    isAsync: true,
    parameters: [
      {
        type: { kind: "instance", className: "Response", constructorArgs: [] },
      },
    ],
    handler: (context, data: IData) => {
      const instance = getRawValueFromData(data, context) as Response;
      if (!instance) return createRuntimeError("Response instance not found");
      return createDataFromRawValue(instance.clone().json(), context);
    },
  },
  {
    name: "text",
    isAsync: true,
    parameters: [
      {
        type: { kind: "instance", className: "Response", constructorArgs: [] },
      },
    ],
    handler: (context, data: IData) => {
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
    handler: (context, data: IData) => {
      const instance = getRawValueFromData(data, context) as Response;
      if (!instance) return createRuntimeError("Response instance not found");
      return createData({
        type: { kind: "number" },
        value: instance.status,
      });
    },
  },
];

export const builtInOperations: OperationListItem[] = [
  ...undefinedOperations,
  ...stringOperations,
  ...numberOperations,
  ...booleanOperations,
  ...tupleOperations,
  ...arrayOperations,
  ...dictionaryOperations,
  ...operationOperations,
  ...unionOperations,
  ...dateOperations,
  ...urlOperations,
  ...promiseOperations,
  ...responseOperations,
  ...wretchOperations,
  ...remedaOperations,
  ...unknownOperations,
];
