import {
  IData,
  OperationListItem,
  InstanceDataType,
  OperationType,
  Context,
  IStatement,
} from "../types";
import {
  createData,
  getRawValueFromData,
  createDataFromRawValue,
  operationToListItem,
  createStatement,
} from "../utils";
import { getPromiseArgsType, InstanceTypes } from "../data";
import { createRuntimeError } from "../built-in-operations";
import { nanoid } from "nanoid";
import { Wretch, WretchResponseChain, WretchError } from "wretch";

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
    handler: (context, data: IData<InstanceDataType>, ...args: IData[]) => {
      const instance = getRawValueFromData(data, context) as Wretch;
      if (!instance) {
        return createRuntimeError("Wretch instance not found");
      }
      try {
        const result = method(instance, context, ...args);

        // If result is a Wretch instance (chaining), create a new instance data
        if (
          typeof result === "object" &&
          result !== null &&
          "url" in result &&
          "fetch" in result
        ) {
          const newInstanceId = nanoid();
          context.setInstance(newInstanceId, result);
          const resultData = createData({
            type: {
              kind: "instance",
              className: "Wretch",
              constructorArgs: InstanceTypes.Wretch.constructorArgs,
            },
          });
          return {
            ...resultData,
            value: { ...resultData.value, instanceId: newInstanceId },
          };
        }

        // If result is a WretchResponseChain
        // We know it's a response chain if it has 'res', 'json', 'text' methods but NOT 'url' (which Wretch has)
        if (
          typeof result === "object" &&
          result !== null &&
          "res" in result &&
          "json" in result &&
          !("url" in result)
        ) {
          const newInstanceId = nanoid();
          context.setInstance(newInstanceId, result);
          const resultData = createData({
            type: {
              kind: "instance",
              className: "WretchResponseChain",
              constructorArgs: [],
            },
          });
          return {
            ...resultData,
            value: { ...resultData.value, instanceId: newInstanceId },
          };
        }

        return createDataFromRawValue(result, context);
      } catch (error) {
        return createRuntimeError(error);
      }
    },
  };
}

// Helper for WretchResponseChain operations
function createChainOperation(
  name: string,
  method: (
    instance: WretchResponseChain<unknown, unknown, unknown, unknown>,
    context: Context,
    ...args: IData[]
  ) => unknown,
  parameters: OperationListItem["parameters"] = []
): OperationListItem {
  return {
    name,
    parameters: (data) => [
      {
        type: {
          kind: "instance",
          className: "WretchResponseChain",
          constructorArgs: [],
        },
      },
      ...(typeof parameters === "function" ? parameters(data) : parameters),
    ],
    handler: (context, data: IData<InstanceDataType>, ...args: IData[]) => {
      const instance = getRawValueFromData(
        data,
        context
      ) as WretchResponseChain<unknown, unknown, unknown, unknown>;
      if (!instance) {
        return createRuntimeError("WretchResponseChain instance not found");
      }

      try {
        const result = method(instance, context, ...args);

        // Check if it returns a Promise (for res, json, text)
        if (result instanceof Promise) {
          const newInstanceId = nanoid();
          context.setInstance(newInstanceId, result);
          // The promise result type depends on the method.
          // json -> unknown
          // text -> string
          // res -> Response (Instance)

          let promiseResolveType: OperationType["parameters"] = [
            { name: "value", type: { kind: "unknown" } },
          ];
          if (name === "text") {
            promiseResolveType = [{ name: "value", type: { kind: "string" } }];
          } else if (name === "res") {
            promiseResolveType = [
              {
                name: "value",
                type: {
                  kind: "instance",
                  className: "Response",
                  constructorArgs: [],
                },
              },
            ];
          }

          const resultData = createData({
            type: {
              kind: "instance",
              className: "Promise",
              constructorArgs: getPromiseArgsType(promiseResolveType),
            },
          });
          return {
            ...resultData,
            value: { ...resultData.value, instanceId: newInstanceId },
          };
        }

        // Check if it returns WretchResponseChain (for error handlers)
        if (
          typeof result === "object" &&
          result !== null &&
          "res" in result &&
          "json" in result
        ) {
          const newInstanceId = nanoid();
          context.setInstance(newInstanceId, result);
          const resultData = createData({
            type: {
              kind: "instance",
              className: "WretchResponseChain",
              constructorArgs: [],
            },
          });
          return {
            ...resultData,
            value: { ...resultData.value, instanceId: newInstanceId },
          };
        }

        return createDataFromRawValue(result, context);
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
      {
        type: {
          kind: "instance",
          className: "WretchResponseChain",
          constructorArgs: [],
        },
      },
      {
        type: {
          kind: "operation",
          parameters: [
            {
              name: "err",
              type: { kind: "error", errorType: "custom_error" },
            },
          ],
          result: { kind: "unknown" },
        },
      },
    ],
    lazyHandler: async (
      context: Context,
      chainData: IData<InstanceDataType>,
      callbackStmt: IStatement
    ) => {
      const instance = getRawValueFromData(
        chainData,
        context
      ) as WretchResponseChain<unknown, unknown, unknown, unknown>;
      if (!instance)
        return createRuntimeError("WretchResponseChain instance not found");

      const callbackOp = callbackStmt.data as IData<OperationType>;

      // We wrap the wretch method.
      // Wretch methods like .notFound(cb) return the chain itself (WretchResponseChain).
      // The callback `cb` is executed if the error matches.

      // Problem: We can't await `context.executeOperation` inside a synchronous Wretch callback if Wretch expects a sync return or doesn't await it.
      // Wretch documentation says: "The callback ... can return a replacement response (Promise<Response> | Response) ..."
      // So it supports async callbacks!
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newChain = (instance as any)[methodName](
        async (error: WretchError) => {
          const errorData = createDataFromRawValue(error, context);

          // Execute the callback operation
          const result = await context.executeOperation(
            operationToListItem(callbackOp, "callback"),
            chainData, // usage context, maybe irrelevant for `call`
            [createStatement({ data: errorData })], // arguments
            context
          );
          return getRawValueFromData(result, context);
        }
      );

      // newChain is the WretchResponseChain (mutable or new instance)
      const newInstanceId = nanoid();
      context.setInstance(newInstanceId, newChain);

      const resultData = createData({
        type: {
          kind: "instance",
          className: "WretchResponseChain",
          constructorArgs: [],
        },
      });

      return {
        ...resultData,
        value: { ...resultData.value, instanceId: newInstanceId },
      };
    },
  })
);

export const wretchOperations: OperationListItem[] = [
  ...wretchInstanceOperations,
  ...chainPromiseOperations,
  ...wretchErrorOperations,
];
