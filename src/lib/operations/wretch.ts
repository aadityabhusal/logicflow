import {
  IData,
  OperationListItem,
  OperationType,
  Context,
  IStatement,
  DataType,
} from "@/lib/types";
import {
  getRawValueFromData,
  createDataFromRawValue,
  resolveReference,
  isObject,
} from "@/lib/utils";
import { createRuntimeError } from "@/lib/built-in-operations";
import { Wretch, WretchResponseChain } from "wretch";
import {
  customInstances,
  WretchClass,
  WretchResponseChainClass,
} from "@/lib/data";

// Helper to create Wretch operations
function createWretchOperation(
  name: string,
  method: (instance: Wretch, context: Context, ...args: IData[]) => unknown,
  parameters: OperationListItem["parameters"] = [],
  shouldCacheResult?: boolean
): OperationListItem {
  return {
    name,
    parameters: (data) => [
      { type: { kind: "instance", className: "Wretch", constructorArgs: [] } },
      ...(typeof parameters === "function" ? parameters(data) : parameters),
    ],
    shouldCacheResult,
    handler: (context, data: IData, ...args: IData[]) => {
      const instance = getRawValueFromData(data, context) as Wretch;
      if (!instance) return createRuntimeError("Wretch instance not found");
      try {
        const result = method(instance, context, ...args);
        if (isObject(result) && !customInstances.has(result)) {
          if ("url" in result && "fetch" in result) {
            customInstances.set(result, WretchClass);
          } else if ("res" in result && "json" in result) {
            customInstances.set(result, WretchResponseChainClass);
          }
        }

        return createDataFromRawValue(result, context);
      } catch (error) {
        return createRuntimeError(error);
      }
    },
  };
}

const WretchResponseChainType: DataType = {
  kind: "instance",
  className: "WretchResponseChain",
  constructorArgs: [],
};

// Helper for WretchResponseChain operations
function createChainOperation<T extends WretchResponseChain<unknown>>(
  name: string,
  method: (instance: T, context: Context, ...args: IData[]) => unknown,
  parameters: OperationListItem["parameters"] = []
): OperationListItem {
  return {
    name,
    parameters: (data) => [
      { type: WretchResponseChainType },
      ...(typeof parameters === "function" ? parameters(data) : parameters),
    ],
    handler: (context, data: IData, ...args: IData[]) => {
      const instance = getRawValueFromData(data, context) as T;
      if (!instance) {
        return createRuntimeError("WretchResponseChain instance not found");
      }

      try {
        const result = method(instance, context, ...args);
        let expectedType: DataType | undefined;
        if (result instanceof Promise) {
          expectedType =
            name === "text"
              ? { kind: "string" }
              : name === "res"
              ? { kind: "instance", className: "Response", constructorArgs: [] }
              : undefined;
        } else {
          customInstances.set(result as T, WretchResponseChainClass);
        }
        return createDataFromRawValue(result, { ...context, expectedType });
      } catch (e) {
        return createRuntimeError(e);
      }
    },
  };
}

const wretchInstanceOperations: OperationListItem[] = [
  // Wretch Instance Methods
  createWretchOperation(
    "url",
    (instance, _, p1) => instance.url(p1.value as string),
    [
      { type: { kind: "string" }, name: "url" },
      { type: { kind: "boolean" }, name: "replace", isOptional: true },
    ]
  ),
  createWretchOperation(
    "options",
    (instance, context, p1, p2) =>
      instance.options(
        getRawValueFromData(p1, context) as Record<string, unknown>,
        p2?.value as boolean
      ),
    [
      {
        type: { kind: "dictionary", elementType: { kind: "unknown" } },
        name: "options",
      }, // WretchOptions is Record<string, unknown> roughly
      { type: { kind: "boolean" }, name: "replace", isOptional: true },
    ]
  ),
  createWretchOperation(
    "headers",
    (instance, context, p1) =>
      instance.headers(
        getRawValueFromData(p1, context) as Record<string, string>
      ),
    [
      {
        type: { kind: "dictionary", elementType: { kind: "string" } },
        name: "headerValues",
      }, // HeadersInit simplification
    ]
  ),
  createWretchOperation(
    "accept",
    (instance, _, p1) => instance.accept(p1.value as string),
    [{ type: { kind: "string" }, name: "headerValue" }]
  ),
  createWretchOperation(
    "content",
    (instance, _, p1) => instance.content(p1.value as string),
    [{ type: { kind: "string" }, name: "headerValue" }]
  ),
  createWretchOperation(
    "auth",
    (instance, _, p1) => instance.auth(p1.value as string),
    [{ type: { kind: "string" }, name: "headerValue" }]
  ),
  // Middlewares - Skipping complex middleware configuration for now or treating as array of unknown
  // createWretchOperation("middlewares", ...),

  createWretchOperation(
    "body",
    (instance, context, p1) => instance.body(getRawValueFromData(p1, context)),
    [{ type: { kind: "unknown" }, name: "contents" }]
  ),
  createWretchOperation(
    "json",
    (instance, context, p1, p2) =>
      instance.json(
        getRawValueFromData(p1, context) as object,
        p2?.value as string
      ),
    [
      { type: { kind: "object", properties: [] }, name: "jsObject" },
      { type: { kind: "string" }, name: "contentType", isOptional: true },
    ]
  ),

  // HTTP Methods returning WretchResponseChain
  createWretchOperation(
    "fetch",
    (instance, context, p1, p2, p3) =>
      instance.fetch(
        p1?.value as string,
        p2?.value as string,
        p3 ? getRawValueFromData(p3, context) : undefined
      ),
    [
      { type: { kind: "string" }, name: "method", isOptional: true },
      { type: { kind: "string" }, name: "url", isOptional: true },
      { type: { kind: "unknown" }, name: "body", isOptional: true },
    ],
    true
  ),
  createWretchOperation(
    "get",
    (instance, _, p1) => instance.get(p1?.value as string),
    [{ type: { kind: "string" }, name: "url", isOptional: true }],
    true
  ),
  createWretchOperation(
    "delete",
    (instance, _, p1) => instance.delete(p1?.value as string),
    [{ type: { kind: "string" }, name: "url", isOptional: true }],
    true
  ),
  createWretchOperation(
    "put",
    (instance, context, p1, p2) =>
      instance.put(
        p1 ? getRawValueFromData(p1, context) : undefined,
        p2?.value as string
      ),
    [
      { type: { kind: "unknown" }, name: "body", isOptional: true },
      { type: { kind: "string" }, name: "url", isOptional: true },
    ],
    true
  ),
  createWretchOperation(
    "post",
    (instance, context, p1, p2) =>
      instance.post(
        p1 ? getRawValueFromData(p1, context) : undefined,
        p2?.value as string
      ),
    [
      { type: { kind: "unknown" }, name: "body", isOptional: true },
      { type: { kind: "string" }, name: "url", isOptional: true },
    ],
    true
  ),
  createWretchOperation(
    "patch",
    (instance, context, p1, p2) =>
      instance.patch(
        p1 ? getRawValueFromData(p1, context) : undefined,
        p2?.value as string
      ),
    [
      { type: { kind: "unknown" }, name: "body", isOptional: true },
      { type: { kind: "string" }, name: "url", isOptional: true },
    ],
    true
  ),
  createWretchOperation(
    "head",
    (instance, _, p1) => instance.head(p1?.value as string),
    [{ type: { kind: "string" }, name: "url", isOptional: true }],
    true
  ),
  createWretchOperation(
    "opts",
    (instance, _, p1) => instance.opts(p1?.value as string),
    [{ type: { kind: "string" }, name: "url", isOptional: true }],
    true
  ),
];

// Chain methods that return promises
const chainPromiseOperations: OperationListItem[] = [
  createChainOperation(
    "res",
    (instance) => instance.res().then((res) => res.clone()),
    []
  ),
  createChainOperation(
    "json",
    (instance) => instance.res().then((res) => res.clone().json()),
    []
  ),
  createChainOperation(
    "text",
    (instance) => instance.res().then((res) => res.clone().text()),
    []
  ),
];

// Re-implement error handlers with lazyHandler
const errorMethods = [
  "error",
  "badRequest",
  "unauthorized",
  "forbidden",
  "notFound",
  "timeout",
  "internalError",
  "fetchError",
] as const;

const wretchErrorOperations: OperationListItem[] = errorMethods.map(
  (methodName) => ({
    name: methodName,
    parameters: [
      { type: WretchResponseChainType },
      {
        type: {
          kind: "operation",
          parameters: [
            {
              name: "reason",
              type: { kind: "error", errorType: "custom_error" },
            },
          ],
          result: { kind: "unknown" },
        },
      },
    ],
    lazyHandler: (
      context: Context,
      chainData: IData,
      _callback: IStatement
    ) => {
      const instance = getRawValueFromData(
        chainData,
        context
      ) as WretchResponseChain<unknown>;
      if (!instance)
        return createRuntimeError("WretchResponseChain instance not found");

      const callback = resolveReference(
        _callback.data,
        context
      ) as IData<OperationType>;
      const newChain = (instance[methodName] as (_: unknown) => unknown)(
        getRawValueFromData(callback, context)
      );
      return createDataFromRawValue(newChain, context);
    },
  })
);

export const wretchOperations: OperationListItem[] = [
  ...wretchInstanceOperations,
  ...chainPromiseOperations,
  ...wretchErrorOperations,
];
