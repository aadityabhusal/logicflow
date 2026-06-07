import {
  IData,
  OperationType,
  UnionType,
  DataType,
  PackageNamespace,
  ProjectFile,
} from "../types";
import { DataTypes } from "../data";
import {
  createData,
  getUnionActiveType,
  isDataOfType,
  isTypeCompatible,
  getRawValueFromData,
  createDataFromRawValue,
  createThenable,
  unwrapThenable,
  createStatement,
  resolveConstructorArgs,
  updateContextWithNarrowedTypes,
  operationToListItem,
  createRuntimeError,
  resolveParameters,
  createFileVariables,
} from "../utils";
import {
  createOperationHandler,
  FunctionKeys,
  getArrayCallbackParams,
  getObjectParam,
  getUnionParam,
  remedaOperations,
} from "./remeda";
import { immerOperations } from "./immer";
import * as _ from "./runtime";
import { Context, OperationListItem, Variable } from "../execution/types";
import {
  loadedPackageOperations,
  loadPackage,
  resetPackageRegistry,
  SOURCE_PACKAGE_MAP,
  InstanceTypes,
} from "../packages/registry";

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
  {
    name: "get",
    parameters: (data) => [
      getObjectParam(data, { includeInstance: true }),
      { type: { kind: "string" } },
    ],
  },
  {
    name: "has",
    parameters: (data) => [
      getObjectParam(data, { includeInstance: true }),
      { type: { kind: "string" } },
    ],
  },
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
  { name: "toNumber", parameters: [{ type: { kind: "string" } }] },
  {
    name: "getMessage",
    parameters: [{ type: { kind: "error", errorType: "custom_error" } }],
    expectedType: { kind: "string" },
  },
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
    parameters: [
      { type: { kind: "boolean" } },
      { type: DataTypes.operation.type },
    ],
    lazyHandler: (context, data, cb) => {
      if (!getRawValueFromData(data, context)) {
        return createDataFromRawValue(false, context);
      }
      const result = (
        getRawValueFromData(
          cb.data,
          updateContextWithNarrowedTypes(context, data)
        ) as () => unknown
      )();
      return (result instanceof Promise ? result : createThenable(result)).then(
        (r) => createDataFromRawValue(r, context)
      );
    },
  },
  {
    name: "or",
    parameters: [
      { type: { kind: "boolean" } },
      { type: DataTypes.operation.type },
    ],
    lazyHandler: (context, data, cb) => {
      if (getRawValueFromData(data, context)) {
        return createDataFromRawValue(true, context);
      }
      const result = (
        getRawValueFromData(
          cb.data,
          updateContextWithNarrowedTypes(context, data)
        ) as () => unknown
      )();
      return (result instanceof Promise ? result : createThenable(result)).then(
        (r) => createDataFromRawValue(r, context)
      );
    },
  },
  {
    name: "thenElse",
    parameters: [
      { type: { kind: "boolean" } },
      { type: DataTypes.operation.type },
      { type: DataTypes.operation.type, isOptional: true },
    ],
    lazyHandler: (context, data, trueCb, falseCb?) => {
      const value = getRawValueFromData(data, context);
      const _context = value
        ? updateContextWithNarrowedTypes(context, data, "thenElse", 0)
        : updateContextWithNarrowedTypes(context, data, "thenElse", 1);
      const result = value
        ? (getRawValueFromData(trueCb.data, _context) as () => unknown)()
        : falseCb
          ? (getRawValueFromData(falseCb.data, _context) as () => unknown)()
          : undefined;
      return (result instanceof Promise ? result : createThenable(result)).then(
        (res) => createDataFromRawValue(res, context)
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
    expectedType: (data) => {
      if (isDataOfType(data, "operation")) return data.type.result;
      return { kind: "unknown" };
    },
    handler: (context, data, ...params) => {
      const opData = data as IData<OperationType>;

      const restIdx =
        !opData.value.instanceId && opData.value.statements.length > 0
          ? opData.type.parameters.findIndex((p) => p.isRest)
          : -1;
      if (restIdx !== -1) {
        const restData = createData({
          value: params.slice(restIdx).map((data) => createStatement({ data })),
        });
        params = params.slice(0, restIdx).concat(restData);
      }

      const sourceData = params[0] || createData();
      let opListItem: OperationListItem | undefined;
      if (isBuiltInOperationRef(opData)) {
        const name = opData.value.name!;
        opListItem = builtInOperationsByName
          .get(name)!
          .filter(isReferenceableBuiltInOperation)
          .find((op) => {
            const resolved = resolveParameters(op, sourceData, context);
            return resolved[0]?.type.kind !== "never";
          });
        if (!opListItem) {
          return createRuntimeError(`"${name}" cannot be called as data`);
        }
        // Operation refs are validated against their stored function signature by `call`.
        // Do not re-derive data-dependent parameter types from earlier arguments here.
        return opListItem.handler(context, sourceData, ...params.slice(1));
      } else if (!opData.value.instanceId && !opData.value.isAsync) {
        opListItem = operationToListItem(opData);
      }

      if (opListItem) {
        const opParams = params
          .slice(1)
          .map((data) => createStatement({ data }));

        const args = [opListItem, sourceData, opParams, context] as const;
        if (context.isSync) return context.executeOperationSync(...args);
        return context.executeOperation(...args);
      }

      const operation = getRawValueFromData(data, context) as (
        ..._: unknown[]
      ) => unknown;

      const result = operation(
        ...params.map((p) => unwrapThenable(getRawValueFromData(p, context)))
      );

      if (opData.value.isAsync) {
        return createDataFromRawValue(
          result instanceof Promise ? result : Promise.resolve(result),
          { ...context, expectedType: opData.type.result }
        );
      }

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
          result: { kind: "unknown" },
        },
      },
    ],
    expectedType: {
      kind: "instance",
      className: "Promise",
      constructorArgs: [],
      result: { kind: "unknown" },
    },
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
    parameters: [{ type: { kind: "unknown" } }],
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

function prefixExternalPackageName(op: OperationListItem): OperationListItem {
  const sourceName = op.source?.name;
  if (!sourceName) return op;
  const packageName = SOURCE_PACKAGE_MAP[sourceName];
  if (!packageName) return op;
  return { ...op, name: `${packageName}.${op.name}` };
}

function getTypeKeys(type: DataType): string[] {
  if (type.kind === "union") return type.types.flatMap(getTypeKeys);
  if (type.kind === "instance")
    return [`instance:${type.className}`, "instance"];
  return [type.kind];
}

function getFirstParamKind(op: OperationListItem): string[] {
  if (typeof op.parameters !== "function") {
    const firstType = op.parameters[0]?.type;
    return firstType ? [...getTypeKeys(firstType)] : ["unknown"];
  }
  for (const val of Object.values(DataTypes)) {
    const firstType = op.parameters(createData({ type: val.type }))[0]?.type;
    if (firstType && firstType.kind !== "never") {
      const keys = getTypeKeys(firstType);
      if (keys.length > 0) return keys;
    }
  }
  return ["unknown"];
}

export function getAllOperations(): OperationListItem[] {
  const result: OperationListItem[] = [...coreOperations];
  for (const ops of loadedPackageOperations.values()) result.push(...ops);
  return result;
}

export function getOperationsForDataType(data: IData): OperationListItem[] {
  const keys = [...getTypeKeys(data.type), "unknown"];

  const seen = new Set<string>();
  const result: OperationListItem[] = [];
  for (const key of keys) {
    const ops = builtInOperationsByKind.get(key);
    if (!ops) continue;
    for (const op of ops) {
      if (seen.has(op.name)) continue;
      seen.add(op.name);
      result.push(op);
    }
  }
  return result;
}

export function rebuildIndexes() {
  builtInOperationsByKind.clear();
  builtInOperationsByName.clear();
  // get/has accept any instance type but sampling stops before reaching
  // the instance DataTypes entry, so we index them manually here.
  const instanceAccessOps = new Set(["get", "has"]);
  for (const op of getAllOperations()) {
    for (const key of getFirstParamKind(op)) {
      const list = builtInOperationsByKind.get(key);
      if (list) list.push(op);
      else builtInOperationsByKind.set(key, [op]);
    }
    if (instanceAccessOps.has(op.name)) {
      const list = builtInOperationsByKind.get("instance");
      if (list) list.push(op);
      else builtInOperationsByKind.set("instance", [op]);
    }
    const list = builtInOperationsByName.get(op.name);
    if (list) list.push(op);
    else builtInOperationsByName.set(op.name, [op]);
  }
}

export async function syncPackageRegistry(
  packages: PackageNamespace[] = []
): Promise<PromiseSettledResult<void>[]> {
  resetPackageRegistry();
  const results = await Promise.allSettled(
    packages.map(({ name }) => loadPackage(name))
  );
  rebuildIndexes();
  return results;
}

export const coreOperations: OperationListItem[] = [
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
  ...immerOperations,
  ...remedaOperations,
  ...requestOperations,
].map(prefixExternalPackageName);

const builtInOperationsByKind = new Map<string, OperationListItem[]>();
export const builtInOperationsByName = new Map<string, OperationListItem[]>();
rebuildIndexes();

export function isReferenceableBuiltInOperation(
  operation: OperationListItem
): operation is Extract<OperationListItem, { handler: unknown }> {
  const parameters = Array.isArray(operation.parameters)
    ? operation.parameters
    : operation.parameters(createData());
  return (
    "handler" in operation &&
    !("lazyHandler" in operation) &&
    parameters[0]?.type.kind !== "instance" &&
    !["call", "await"].includes(operation.name)
  );
}

function isBuiltInOperationRef(data: IData): boolean {
  if (!isDataOfType(data, "operation")) return false;
  const { name, statements } = data.value;
  return !!name && statements.length === 0 && builtInOperationsByName.has(name);
}

export function createExecutionVariables(
  context: Context,
  files: ProjectFile[] = [],
  envVariables: { key: string; value: string }[] = []
) {
  const variables = new Map<string, Variable>();
  const seenNames = new Set<string>();
  const sampleData = createData();

  for (const operation of getAllOperations()) {
    if (!isReferenceableBuiltInOperation(operation)) continue;
    if (seenNames.has(operation.name)) continue;
    seenNames.add(operation.name);

    const params = resolveParameters(operation, sampleData, context);
    if (params[0]?.type.kind === "never") continue;

    const resultType =
      typeof operation.expectedType === "function"
        ? operation.expectedType(sampleData)
        : (operation.expectedType ?? { kind: "unknown" });

    variables.set(operation.name, {
      data: createData({
        id: `builtin:${operation.name}`,
        type: {
          kind: "operation",
          parameters:
            params[0]?.isOptional && params[0]?.type.kind === "undefined"
              ? params.slice(1)
              : params,
          result: resultType,
        },
        value: {
          name: operation.name,
          parameters: [],
          statements: [],
          source: operation.source,
        },
      }),
    });
  }

  const executionVariables = createFileVariables(files, variables);
  for (const envVar of envVariables) {
    executionVariables.set(envVar.key, {
      data: createData({ value: envVar.value }),
      isEnv: true,
    });
  }
  return executionVariables;
}
