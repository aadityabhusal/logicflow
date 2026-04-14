import { nanoid } from "nanoid";
import { isDeepEqual } from "remeda";
import {
  DataTypes,
  ErrorTypesData,
  InstanceTypeConfig,
  InstanceTypes,
} from "./data";
import {
  IData,
  IStatement,
  DataType,
  IDropdownItem,
  DataValue,
  OperationType,
  ConditionType,
  UnionType,
  ProjectFile,
  ArrayType,
  ObjectType,
  DictionaryType,
  TupleType,
  MapValue,
  InstanceDataType,
} from "./types";
import { Context, OperationListItem, Thenable } from "./execution/types";

/* Create */

export function createData<T extends DataType>(
  props?: Partial<IData<T>>
): IData<T> {
  const emptyContext = {
    scopeId: "_root_",
    variables: new Map(),
    getResult: () => undefined,
    getInstance: () => undefined,
    setInstance: () => undefined,
    executeOperation: () => Promise.resolve(createData()),
    executeOperationSync: () => createData(),
    executeStatement: () => Promise.resolve(createData()),
    executeStatementSync: () => createData(),
    getContext: () => emptyContext,
    setContext: () => undefined,
    setResult: () => undefined,
  };
  const type = (props?.type ??
    inferTypeFromValue(props?.value, emptyContext)) as T;
  return {
    id: props?.id ?? nanoid(),
    type,
    value:
      props?.value !== undefined || type.kind === "undefined"
        ? (props?.value as DataValue<T>)
        : createDefaultValue(type),
  };
}

export function createStatement(props?: Partial<IStatement>): IStatement {
  const newData = props?.data || createData();
  const newId = props?.id || nanoid();
  return {
    id: newId,
    name: props?.name,
    data: newData,
    operations: props?.operations || [],
    isOptional: props?.isOptional,
    isRest: props?.isRest,
  };
}

export function isValidIdentifier(name: string): boolean {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name);
}

export function createVariableName({
  prefix,
  prev,
  indexOffset = 0,
}: {
  prefix: string;
  prev: (IStatement | string | ProjectFile)[];
  indexOffset?: number;
}) {
  const index = prev
    .map((s) => (typeof s === "string" ? s : s.name))
    .reduce((acc, cur) => {
      const match = cur?.match(new RegExp(`^${prefix}(\\d+)?$`));
      if (!match) return acc;
      return match[1] ? Math.max(acc, Number(match[1]) + 1) : Math.max(acc, 1);
    }, indexOffset);
  return `${prefix}${index || ""}`;
}

function createStatementFromType({
  type,
  ...config
}: OperationType["parameters"][number]) {
  const value = createDefaultValue(type);
  const data = createData({ type, value });
  return createStatement({ data, ...config });
}

export function createDefaultValue<T extends DataType>(
  type: T,
  options?: { includeOptionalProperties?: boolean }
): DataValue<T> {
  switch (type.kind) {
    case "never":
      return undefined as DataValue<T>;
    case "string":
      return "" as DataValue<T>;
    case "number":
      return 0 as DataValue<T>;
    case "boolean":
      return false as DataValue<T>;
    case "undefined":
      return undefined as DataValue<T>;
    case "unknown":
      return undefined as DataValue<T>;

    case "array": {
      if (
        type.elementType.kind === "unknown" ||
        type.elementType.kind === "never"
      )
        return [] as DataValue<T>;
      return [
        createStatementFromType({ type: type.elementType }),
      ] as DataValue<T>;
    }

    case "tuple": {
      return type.elements.map((element) =>
        createStatementFromType({ type: element })
      ) as DataValue<T>;
    }

    case "object": {
      const entries: Array<{ key: string; value: IStatement }> = [];
      for (const { key, value } of type.properties) {
        if (
          type.required?.includes(key) ||
          options?.includeOptionalProperties
        ) {
          entries.push({
            key,
            value: createStatementFromType({ type: value }),
          });
        }
      }
      return { entries } as DataValue<T>;
    }

    case "dictionary": {
      if (
        type.elementType.kind === "unknown" ||
        type.elementType.kind === "never"
      ) {
        return { entries: [] } as DataValue<T>;
      }
      return {
        entries: [
          {
            key: "key",
            value: createStatementFromType({ type: type.elementType }),
          },
        ],
      } as DataValue<T>;
    }

    case "union": {
      // Find first non-undefined type, or fall back to first type
      const defaultIndex =
        type.activeIndex ?? type.types.findIndex((t) => t.kind !== "undefined");
      const index = defaultIndex >= 0 ? defaultIndex : 0;
      return createDefaultValue(type.types[index], options) as DataValue<T>;
    }

    case "operation": {
      return {
        parameters: type.parameters.map(createStatementFromType),
        statements: [],
      } as DataValue<T>;
    }

    case "condition": {
      const createStatement = (): IStatement => ({
        id: nanoid(),
        operations: [],
        data: createData(),
      });

      return {
        condition: createStatement(),
        true: createStatement(),
        false: createStatement(),
        result: createStatement().data,
      } as DataValue<T>;
    }
    case "error": {
      return {
        reason: ErrorTypesData[type.errorType]?.name ?? "Unknown Error",
      } as DataValue<T>;
    }
    case "instance": {
      return {
        className: type.className as keyof typeof InstanceTypes,
        instanceId: nanoid(),
        constructorArgs: type.constructorArgs
          .filter((param) => !param.isOptional)
          .map((argType) =>
            createStatement({
              data: createParamData({ ...argType, type: argType.type }),
              isOptional: argType.isOptional,
            })
          ),
      } as DataValue<T>;
    }

    default:
      return undefined as DataValue<T>;
  }
}

export function createProjectFile(
  props: Partial<ProjectFile>,
  prev: (string | ProjectFile)[] = []
): ProjectFile {
  const type = props.type || "operation";
  const isTrigger = "trigger" in props && props.trigger;
  const prefix = isTrigger ? "trigger" : "operation";
  return {
    id: nanoid(),
    name: props.name ?? createVariableName({ prefix, prev, indexOffset: 1 }),
    createdAt: Date.now(),
    tags: props.tags,
    type: type,
    ...(type === "operation"
      ? (() => {
          const opType = DataTypes["operation"].type;
          const defaultContent = {
            type: opType,
            value: createDefaultValue(opType),
          };
          let content =
            (props.content as typeof defaultContent) ?? defaultContent;
          if (isTrigger && !props.content) {
            const requestParamType: DataType = {
              kind: "instance",
              className: "Request",
              constructorArgs: resolveConstructorArgs(
                InstanceTypes.Request.constructorArgs
              ),
            };
            const requestParam = { name: "request", type: requestParamType };
            const requestStatement = createStatement({
              name: requestParam.name,
              data: createData({ type: requestParamType }),
            });
            content = {
              type: { ...opType, parameters: [requestParam] },
              value: { ...content.value, parameters: [requestStatement] },
            };
          }
          return {
            content,
            ...("trigger" in props ? { trigger: props.trigger } : {}),
          };
        })()
      : type === "globals"
        ? { content: props ?? {} }
        : type === "documentation"
          ? { content: props.content ?? "" }
          : type === "json"
            ? { content: props.content ?? {} }
            : {}),
  } as ProjectFile;
}

export function createOperationFromFile(file?: ProjectFile) {
  if (!file || file.type !== "operation") return undefined;
  return {
    id: file.id,
    type: file.content.type,
    value: { ...file.content.value, name: file.name },
  } as IData<OperationType>;
}

export function createFileFromOperation(operation: IData<OperationType>) {
  return {
    id: operation.id,
    name: operation.value.name,
    type: "operation",
    content: { type: operation.type, value: operation.value },
  } as ProjectFile;
}

export function createContext(
  parentContext: Context,
  overrides?: Partial<Context>
): Context {
  return {
    ...parentContext,
    ...overrides,
    scopeId: overrides?.scopeId ?? nanoid(),
    variables: overrides?.variables ?? new Map(parentContext.variables),
    narrowedTypes:
      overrides?.narrowedTypes ?? new Map(parentContext.narrowedTypes),
    expectedType: overrides?.expectedType ?? undefined,
    enforceExpectedType: overrides?.enforceExpectedType ?? undefined,
  };
}

export function getContextExpectedTypes({
  context,
  expectedType,
  enforceExpectedType,
}: {
  context: Context;
  expectedType: DataType | undefined;
  enforceExpectedType?: boolean;
}) {
  const _enforceExpectedType =
    enforceExpectedType ?? context.enforceExpectedType;

  return {
    ...(expectedType === undefined || expectedType.kind === "unknown"
      ? { expectedType: undefined, enforceExpectedType: undefined }
      : {
          expectedType,
          enforceExpectedType: _enforceExpectedType,
        }),
  };
}

export function createContextVariable(
  statement: IStatement,
  context: Context,
  result: IData,
  parameters?: OperationType["parameters"]
): MapValue<Context["variables"]> | undefined {
  if (!statement.name || isDataOfType(result, "error")) return undefined;
  const paramInfo = parameters?.find((param) => param.name === statement.name);
  let resultType = result.type;
  if (paramInfo?.isOptional) {
    const union = {
      ...resolveUnionType([result.type, { kind: "undefined" }], true),
      activeIndex: undefined,
    };
    resultType = {
      ...union,
      activeIndex: getUnionActiveIndex(union, { value: result.value, context }),
    };
  }
  return {
    data: { ...result, id: statement.id, type: resultType },
    reference: isDataOfType(statement.data, "reference")
      ? statement.data.value
      : undefined,
  };
}

export function createFileVariables(
  files: ProjectFile[] = [],
  currentOperationId?: string,
  base?: Context["variables"]
): Context["variables"] {
  return files.reduce((acc, operationFile) => {
    const operation = createOperationFromFile(operationFile);
    if (!operation || operationFile.id === currentOperationId) {
      return acc;
    }
    acc.set(operationFile.name, {
      data: { ...operation, id: operationFile.id },
    });
    return acc;
  }, new Map(base));
}

export function createParamData(
  item: OperationType["parameters"][number]
): IStatement["data"] {
  if (item.type.kind !== "operation") {
    return createData({
      type: item.type.kind === "unknown" ? { kind: "undefined" } : item.type,
    });
  }

  const parameters = item.type.parameters
    .filter((param) => !param.isOptional)
    .reduce((prev, paramSpec) => {
      prev.push(
        createStatement({
          name: paramSpec.name ?? createVariableName({ prefix: "param", prev }),
          data: createParamData({ type: paramSpec.type }),
          isOptional: paramSpec.isOptional,
          isRest: paramSpec.isRest,
        })
      );
      return prev;
    }, [] as IStatement[]);

  return createData({
    type: {
      kind: "operation",
      parameters: item.type.parameters,
      result: item.type.result,
    },
    value: { parameters: parameters, statements: [] },
  });
}

export function createInstance<
  T extends keyof typeof InstanceTypes,
  K extends (typeof InstanceTypes)[T]["Constructor"],
>(className: T, constructorArgs: IData[], context: Context): InstanceType<K> {
  const config = InstanceTypes[className];
  let rawArgs = constructorArgs.map((arg) =>
    getRawValueFromData(arg, context)
  ) as ConstructorParameters<K>;
  if (config.prepareArgs) {
    rawArgs = config.prepareArgs(rawArgs) as ConstructorParameters<K>;
  }

  const Constructor = config.Constructor as new (
    ...args: ConstructorParameters<K>
  ) => InstanceType<K>;
  return new Constructor(...rawArgs);
}

export function operationToListItem(
  operation: IData<OperationType>,
  name?: string
): OperationListItem {
  return {
    id: operation.id,
    name: name ?? operation.value.name ?? "anonymous",
    parameters: operation.type.parameters,
    statements: operation.value.statements,
  };
}

export function createDataFromRawValue(
  value: unknown,
  context: Context
): IData {
  if (value === undefined || value === null) {
    return createData({ type: { kind: "undefined" } });
  }
  if (typeof value === "string") {
    return createData({ type: { kind: "string" }, value });
  }
  if (typeof value === "number") {
    return createData({ type: { kind: "number" }, value });
  }
  if (typeof value === "boolean") {
    return createData({ type: { kind: "boolean" }, value });
  }
  if (value instanceof Error) {
    const errorType = Object.entries(ErrorTypesData).find(([_, val]) =>
      value.message.startsWith(`${val.name}: `)
    ) as [keyof typeof ErrorTypesData, unknown];
    return createData({
      type: { kind: "error", errorType: errorType?.[0] ?? "custom_error" },
      value: { reason: value.message },
    });
  }

  if (Array.isArray(value)) {
    const _value = value.map((val, i) =>
      createStatement({
        data: createDataFromRawValue(val, {
          ...context,
          expectedType:
            context.expectedType?.kind === "tuple"
              ? context.expectedType.elements[i]
              : context.expectedType?.kind === "array"
                ? context.expectedType.elementType
                : undefined,
        }),
      })
    );
    return createData({
      type:
        context.expectedType?.kind === "tuple"
          ? { kind: "tuple", elements: _value.map((v) => v.data.type) }
          : {
              kind: "array",
              elementType: resolveUnionType(_value.map((v) => v.data.type)),
            },
      value: _value,
    });
  }

  if (isObject(value)) {
    const instanceClass = Object.entries(InstanceTypes).find(
      ([, config]) => value instanceof config.Constructor
    );
    if (instanceClass) {
      const [className, config] = instanceClass;
      const instanceType: InstanceDataType = {
        kind: "instance",
        className,
        constructorArgs: resolveConstructorArgs(
          config.constructorArgs,
          context.expectedType
        ),
      };
      if (
        context.expectedType?.kind === "instance" &&
        context.expectedType.result
      ) {
        instanceType.result = context.expectedType.result;
      }
      const data = createData({ type: instanceType });
      context.setInstance(data.value.instanceId, {
        instance: value,
        type: data.type,
      });
      return data;
    } else {
      const entries = Object.entries(value).map(([key, val], i) => ({
        key,
        value: createStatement({
          data: createDataFromRawValue(val, {
            ...context,
            expectedType:
              context.expectedType?.kind === "object"
                ? context.expectedType.properties[i].value
                : context.expectedType?.kind === "dictionary"
                  ? context.expectedType.elementType
                  : undefined,
          }),
        }),
      }));
      return createData({
        type:
          context.expectedType?.kind === "object"
            ? {
                kind: "object",
                properties: entries.map(({ key, value }) => ({
                  key,
                  value: value.data.type,
                })),
              }
            : {
                kind: "dictionary",
                elementType: resolveUnionType(
                  entries.map(({ value }) => value.data.type)
                ),
              },
        value: { entries },
      });
    }
  }

  if (typeof value === "function") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existingInstanceId = (value as any)._operationInstanceId;
    const fallbackType: OperationType =
      context.expectedType?.kind === "operation"
        ? context.expectedType
        : {
            kind: "operation",
            parameters: Array.from({ length: value.length }, () => ({
              type: { kind: "unknown" },
            })),
            result: { kind: "unknown" },
          };

    if (existingInstanceId) {
      // This function was converted from an operation - retrieve stored type
      const storedType = context.getInstance(existingInstanceId)?.type;
      const type = storedType?.kind === "operation" ? storedType : fallbackType;

      const data = createData({ type });
      return {
        ...data,
        value: { ...data.value, instanceId: existingInstanceId },
      };
    }
    // New function - not from operation conversion
    return createData({ type: fallbackType });
  }
  return createData({
    type: context.expectedType ?? { kind: "unknown" },
    value,
  });
}

export function createThenable<T>(data: T): Thenable<T> {
  // Allows nested Thenables to pass through
  if (isObject(data, ["then"])) return data as Thenable<T>;
  return {
    then: ((onfulfilled?) => {
      if (!onfulfilled) return createThenable(data);
      const result = onfulfilled(data);
      return createThenable(result);
    }) as Thenable<T>["then"],
  };
}

export function unwrapThenable<T>(thenable: T | Thenable<T>): T {
  let result = thenable;
  if (isObject(thenable, ["then"])) {
    let unwrapped: T;
    thenable.then((r) => {
      unwrapped = r;
    });
    result = unwrapped!;
  }
  return result as T;
}

/* Types */

export function isTypeCompatible(
  first: DataType,
  second: DataType,
  context: Context
): boolean {
  if (second.kind === "unknown") return true;

  if (first.kind === "operation" && second.kind === "operation") {
    if (!isTypeCompatible(first.result, second.result, context)) return false;
    const firstRest = first.parameters.find((p) => p.isRest);
    const secondRest = second.parameters.find((p) => p.isRest);

    const diff = Math.abs(
      second.parameters.length - first.parameters.length + 1
    );
    if (firstRest && firstRest.type.kind === "array" && !secondRest) {
      const newParams = first.parameters
        .slice(0, -1)
        .concat(Array(diff).fill({ type: firstRest.type.elementType }));
      return isTypeCompatible(
        second,
        {
          ...first,
          parameters: newParams.map((p) => ({ ...p, isRest: undefined })),
        },
        context
      );
    }
    if (secondRest && secondRest.type.kind === "array" && !firstRest) {
      const newParams = second.parameters
        .slice(0, -1)
        .concat(Array(diff).fill({ type: secondRest.type.elementType }));
      return isTypeCompatible(
        first,
        {
          ...second,
          parameters: newParams.map((p) => ({ ...p, isRest: undefined })),
        },
        context
      );
    }
    // TODO: Might change this to contravariant check
    return first.parameters.every((firstParam, index) => {
      if (firstParam.isOptional && !second.parameters[index]) return true;
      if (!second.parameters[index]) return false;
      return isTypeCompatible(
        firstParam.type,
        second.parameters[index].type,
        context
      );
    });
  }

  if (first.kind === "array" && second.kind === "array") {
    return isTypeCompatible(first.elementType, second.elementType, context);
  }

  if (first.kind === "tuple" && second.kind === "tuple") {
    if (second.elements.length === 0) return true;
    if (first.elements.length !== second.elements.length) return false;
    return first.elements.every((firstElement, index) =>
      isTypeCompatible(firstElement, second.elements[index], context)
    );
  }

  if (first.kind === "object" && second.kind === "object") {
    if (second.properties.length === 0) return true;

    const secondRequired =
      second.required ?? second.properties.map((p) => p.key);
    const firstProps = new Map(first.properties.map((p) => [p.key, p.value]));
    const secondProps = new Map(second.properties.map((p) => [p.key, p.value]));
    for (const key of second.properties.map((p) => p.key)) {
      const firstProp = firstProps.get(key);
      if (!firstProp && secondRequired.includes(key)) return false;
      if (
        firstProp &&
        !isTypeCompatible(firstProp, secondProps.get(key)!, context)
      ) {
        return false;
      }
    }
    return true;
  }

  if (first.kind === "object" && second.kind === "dictionary") {
    return first.properties.every(({ value }) =>
      isTypeCompatible(value, second.elementType, context)
    );
  }

  if (first.kind === "dictionary" && second.kind === "object") {
    const secondRequired =
      second.required ?? second.properties.map((p) => p.key);
    if (secondRequired.length > 0) return false;
    return second.properties.every(({ value }) =>
      isTypeCompatible(first.elementType, value, context)
    );
  }

  if (first.kind === "dictionary" && second.kind === "dictionary") {
    return isTypeCompatible(first.elementType, second.elementType, context);
  }

  if (first.kind === "instance" && second.kind === "instance") {
    if (first.className !== second.className) return false;
    if (first.result && second.result) {
      return isTypeCompatible(first.result, second.result, context);
    }
    return true; // Covariant case
  }

  if (first.kind === "union" && second.kind === "union") {
    if (first.types.length !== second.types.length) return false;
    // Bi-directional check to maintain order-independence and avoid duplicate types
    return (
      first.types.every((firstType) =>
        second.types.some((secondType) =>
          isTypeCompatible(firstType, secondType, context)
        )
      ) &&
      second.types.every((secondType) =>
        first.types.some((firstType) =>
          isTypeCompatible(firstType, secondType, context)
        )
      )
    );
  } else if (second.kind === "union") {
    return second.types.some((t) => isTypeCompatible(first, t, context));
  }

  if (first.kind === "reference" && second.kind === "reference") {
    return isTypeCompatible(
      resolveReferenceType(first, context),
      resolveReferenceType(second, context),
      context
    );
  } else if (first.kind === "reference") {
    return isTypeCompatible(
      resolveReferenceType(first, context),
      second,
      context
    );
  } else if (second.kind === "reference") {
    return isTypeCompatible(
      first,
      resolveReferenceType(second, context),
      context
    );
  }

  return first.kind === second.kind;
}

export function isDataOfType<K extends DataType["kind"]>(
  data: IData<DataType> | undefined,
  kind: K
): data is IData<Extract<DataType, { kind: K }>> {
  return data?.type.kind === kind;
}

export function isFatalError(
  data: IData | undefined
): data is IData<Extract<DataType, { kind: "error" }>> {
  return isDataOfType(data, "error") && data.type.errorType !== "custom_error";
}

export function isObject<const K extends readonly string[]>(
  data: unknown,
  keys?: K
): data is { [P in K[number]]: unknown } {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return false;
  }
  if (keys) return keys.every((key) => key in data);
  return true;
}

export function getInverseTypes(
  originalTypes: Context["variables"],
  narrowedTypes: Context["variables"],
  context: Context
): Context["variables"] {
  return narrowedTypes.entries().reduce((acc, [key, value]) => {
    const variable = originalTypes.get(key);
    if (!variable) return acc;
    let excludedType: DataType = variable.data.type;

    if (isDataOfType(variable.data, "union")) {
      const remainingTypes = variable.data.type.types.filter(
        (t) => !isTypeCompatible(t, value.data.type, context)
      );
      if (remainingTypes.length === 0) excludedType = { kind: "never" };
      else excludedType = resolveUnionType(remainingTypes);
    } else if (isTypeCompatible(variable.data.type, value.data.type, context)) {
      excludedType = { kind: "never" }; // If not a union and types are compatible
    }

    if (excludedType.kind !== "never") {
      acc.set(key, {
        ...variable,
        data: { ...variable.data, type: excludedType },
      });
    }
    return acc;
  }, new Map(originalTypes));
}

function mergeNarrowedTypes(
  originalTypes: Context["variables"],
  narrowedTypes: Context["variables"],
  operationName?: string
): Context["variables"] {
  return operationName === "or"
    ? originalTypes
    : narrowedTypes.entries().reduce((acc, [key, value]) => {
        if (isDataOfType(value.data, "never")) acc.delete(key);
        else acc.set(key, value);
        return acc;
      }, new Map(originalTypes));
}

export function updateContextWithNarrowedTypes(
  context: Context,
  data: IData,
  operationName?: string,
  paramIndex?: number
) {
  const narrowedTypes = context.narrowedTypes ?? new Map();
  const variables =
    operationName === "thenElse" && paramIndex === 1
      ? getInverseTypes(context.variables, narrowedTypes, context)
      : mergeNarrowedTypes(context.variables, narrowedTypes, operationName);

  return {
    ...context,
    variables,
    narrowedTypes: undefined,
    skipExecution: getSkipExecution({
      context,
      data,
      operationName,
      paramIndex: paramIndex,
    }),
  };
}

export function resolveUnionType(
  types: DataType[],
  union: true,
  activeIndex?: number
): UnionType;
export function resolveUnionType(types: DataType[], union?: false): DataType;
export function resolveUnionType(
  types: DataType[],
  forceUnion = false,
  activeIndex?: number
): DataType | UnionType {
  const flattenedTypes = types.flatMap((type) => {
    if (!type) return [];
    return type.kind === "union" ? type.types : [type];
  });

  const uniqueTypes = flattenedTypes.reduce<DataType[]>((acc, type) => {
    if (!acc.some((t) => isDeepEqual(t, type))) {
      acc.push(type);
    }
    return acc;
  }, []);

  if (uniqueTypes.length === 0) return { kind: "never" };
  if (uniqueTypes.length === 1 && !forceUnion) return uniqueTypes[0];
  return { kind: "union", types: uniqueTypes, activeIndex: activeIndex ?? 0 };
}

function getArrayElementType(
  elements: IStatement[],
  context: Context
): DataType {
  if (elements.length === 0) {
    if (context.expectedType?.kind === "array") {
      return context.expectedType.elementType;
    }
    return { kind: "unknown" };
  }

  const firstType = getStatementResult(elements[0], context).type;
  const allSameType = elements.every((element) => {
    return isTypeCompatible(
      getStatementResult(element, context).type,
      firstType,
      context
    );
  });
  if (allSameType) return firstType;

  const unionTypes = elements.reduce((acc, element) => {
    const elementType = getStatementResult(element, context).type;
    const exists = acc.some((t) => isTypeCompatible(elementType, t, context));
    if (!exists) acc.push(elementType);
    return acc;
  }, [] as DataType[]);
  return resolveUnionType(unionTypes);
}

export function getOperationResultType(
  value: DataValue<OperationType>,
  context: Context
): DataType {
  let resultType: DataType = { kind: "undefined" };
  if (value.statements.length > 0) {
    const lastStatement = value.statements[value.statements.length - 1];
    resultType = getStatementResult(lastStatement, context).type;
  }
  if (value.isAsync) {
    return {
      kind: "instance",
      className: "Promise",
      constructorArgs: [],
      result: resultType,
    };
  }

  return resultType;
}

export function resolveReference(data: IData, context: Context): IData {
  if (isDataOfType(data, "reference")) {
    const variable = context.variables.get(data.value.name);
    if (!variable) {
      // If context hasn't been set yet return the reference as-is
      if (context.scopeId === "_root_") return data;
      return createData({
        id: data.id,
        type: { kind: "error", errorType: "reference_error" },
        value: { reason: `'${data.value.name}' not found` },
      });
    }
    return resolveReference(variable.data, context);
  }
  if (isDataOfType(data, "array") || isDataOfType(data, "tuple")) {
    return createData({
      ...data,
      value: data.value.map((statement) => ({
        ...statement,
        data: resolveReference(statement.data, context),
      })),
    } as IData<ArrayType | TupleType>);
  }
  if (isDataOfType(data, "object") || isDataOfType(data, "dictionary")) {
    const newEntries = data.value.entries.map(({ key, value }) => ({
      key,
      value: { ...value, data: resolveReference(value.data, context) },
    }));
    return createData({ ...data, value: { entries: newEntries } } as IData<
      ObjectType | DictionaryType
    >);
  }
  return data;
}

function resolveReferenceType(type: DataType, context: Context): DataType {
  if (type.kind !== "reference") return type;
  const variable = context.variables.get(type.name);
  return variable?.data.type ?? { kind: "unknown" };
}

export function isPendingContext(context: Context): boolean {
  return context.scopeId === "_root_";
}

export function getIsAsync(statements: IStatement[]) {
  const isAsync = statements.some((s) =>
    s.operations.some((op) => op.value.name === "await")
  );
  return isAsync ?? undefined;
}

export function inferTypeFromValue<T extends DataType>(
  value: DataValue<T> | undefined,
  context: Context
): T {
  if (value === undefined) return { kind: "undefined" } as T;
  if (typeof value === "string") return { kind: "string" } as T;
  if (typeof value === "number") return { kind: "number" } as T;
  if (typeof value === "boolean") return { kind: "boolean" } as T;

  if (Array.isArray(value)) {
    return context.expectedType?.kind === "tuple"
      ? ({
          kind: "tuple",
          elements: value.map(
            (element) => getStatementResult(element, context).type
          ),
        } as T)
      : ({
          kind: "array",
          elementType: getArrayElementType(value, context),
        } as T);
  }
  if (isObject(value, ["entries"]) && Array.isArray(value.entries)) {
    return context.expectedType?.kind === "object"
      ? ({
          kind: "object",
          properties: value.entries.map(({ key, value }) => ({
            key,
            value: getStatementResult(value, context).type,
          })),
          required: context.expectedType?.required ?? [],
        } as T)
      : ({
          kind: "dictionary",
          elementType: getArrayElementType(
            value.entries.map(({ value }) => value),
            context
          ),
        } as T);
  }
  if (
    isObject(value, ["parameters", "statements"]) &&
    Array.isArray(value.parameters) &&
    Array.isArray(value.statements)
  ) {
    return {
      kind: "operation",
      parameters: value.parameters.map((param) => ({
        name: param.name,
        type: param.data.type,
        isOptional: param.isOptional,
        isRest: param.isRest,
      })),
      result: getOperationResultType(
        value as DataValue<OperationType>,
        context
      ),
    } as T;
  }
  if (isObject(value, ["condition", "true", "false"])) {
    const trueType = getStatementResult(value.true as IStatement, context).type;
    const falseType = getStatementResult(
      value.false as IStatement,
      context
    ).type;
    const unionType = resolveUnionType(
      isTypeCompatible(trueType, falseType, context)
        ? [trueType]
        : [trueType, falseType]
    );
    return { kind: "condition", result: unionType } as T;
  }
  if (isObject(value, ["name"]) && typeof value.name === "string") {
    const variable = context.variables.get(value.name);
    return { kind: "reference", name: value.name, isEnv: variable?.isEnv } as T;
  }

  if (isObject(value, ["reason"]) && typeof value.reason === "string") {
    return { kind: "error", errorType: "custom_error" } as T;
  }
  if (
    isObject(value, ["className", "constructorArgs"]) &&
    Array.isArray(value.constructorArgs)
  ) {
    const valueConstructorArgs = value.constructorArgs.map((arg) => ({
      name: arg.name,
      type: arg.data.type,
      isOptional: arg.isOptional,
    }));
    if (
      context.expectedType?.kind === "instance" &&
      context.expectedType.className === value.className
    ) {
      return {
        kind: "instance",
        className: value.className,
        constructorArgs: context.expectedType.constructorArgs.map(
          (expectedArg, i) => valueConstructorArgs[i] ?? expectedArg
        ),
        result: context.expectedType.result,
      } as T;
    }
    return {
      kind: "instance",
      className: value.className,
      constructorArgs: valueConstructorArgs,
    } as T;
  }
  return { kind: "unknown" } as T;
}

export function getUnionActiveIndex(
  unionType: UnionType,
  infer?: { value: unknown; context: Context }
): number {
  if (unionType.activeIndex !== undefined && !infer)
    return unionType.activeIndex;
  if (infer) {
    // If activeIndex is set, prefer keeping it if the value is still compatible
    if (unionType.activeIndex !== undefined) {
      const currentType = unionType.types[unionType.activeIndex];
      const inferredType = inferTypeFromValue(infer.value, {
        ...infer.context,
        expectedType: currentType,
      });
      if (isTypeCompatible(inferredType, currentType, infer.context)) {
        return unionType.activeIndex;
      }
    }
    // Fall back to finding the first matching type
    for (const [index, candidateType] of unionType.types.entries()) {
      const inferredType = inferTypeFromValue(infer.value, {
        ...infer.context,
        expectedType: candidateType,
      });
      if (isTypeCompatible(inferredType, candidateType, infer.context)) {
        return index;
      }
    }
    return 0;
  }
  return 0;
}

export function getUnionActiveType(
  unionType: UnionType,
  infer?: { value: unknown; context: Context }
): DataType {
  const index = getUnionActiveIndex(unionType, infer);
  return unionType.types[index] ?? unionType.types[0];
}

export function getTypeSignature(type: DataType, maxDepth: number = 5): string {
  if (maxDepth <= 0) return "...";

  switch (type.kind) {
    case "never":
    case "undefined":
    case "string":
    case "number":
    case "boolean":
    case "unknown":
      return type.kind;

    case "error":
      return ErrorTypesData[type.errorType]?.name ?? "Unknown Error";

    case "array":
      return `array<${getTypeSignature(type.elementType, maxDepth - 1)}>`;

    case "tuple":
      return `[${type.elements
        .map((element) => getTypeSignature(element, maxDepth - 1))
        .join(", ")}]`;

    case "object": {
      const maxEntries = 3;
      const entries = type.properties.slice(0, maxEntries);
      const props = entries
        .map(
          ({ key, value }) =>
            `${key}${
              type.required?.includes(key) ? "" : "?"
            }: ${getTypeSignature(value, maxDepth - 1)}`
        )
        .join(", ");
      return `{ ${props}${
        type.properties.length > maxEntries ? ", ..." : ""
      } }`;
    }
    case "dictionary":
      return `dictionary<${getTypeSignature(type.elementType, maxDepth - 1)}>`;

    case "union":
      return resolveUnionType(type.types, true)
        .types.map((t) => getTypeSignature(t, maxDepth - 1))
        .join(" | ");

    case "operation": {
      const params = type.parameters
        .map((p) => {
          const typeSignature = getTypeSignature(p.type, maxDepth - 1);
          return [
            p.isRest ? "..." : "",
            p.name || "_",
            p.isOptional ? "?" : "",
            ": " + (p.isRest ? `array<${typeSignature}>` : typeSignature),
          ].join("");
        })
        .join(", ");
      return `(${params}) => ${getTypeSignature(type.result, maxDepth - 1)}`;
    }

    case "condition":
      return getTypeSignature(type.result, maxDepth - 1);

    case "reference":
      return type.name;
    case "instance": {
      return `${type.className}${type.result ? `<${getTypeSignature(type.result)}>` : ``}`;
    }
    default:
      return "unknown";
  }
}

function processDataType(type: DataType): DataType {
  switch (type.kind) {
    case "operation":
      return {
        ...type,
        parameters: type.parameters.map((param) => {
          const processedType = processDataType(param.type);
          return {
            ...param,
            type: param.isOptional
              ? resolveUnionType([processedType, { kind: "undefined" }])
              : processedType,
          };
        }),
        result: processDataType(type.result),
      };
    case "array":
      return { ...type, elementType: processDataType(type.elementType) };
    case "tuple":
      return { ...type, elements: type.elements.map(processDataType) };
    case "object":
      return {
        ...type,
        properties: type.properties.map((prop) => ({
          ...prop,
          value: processDataType(prop.value),
        })),
      };
    case "dictionary":
      return { ...type, elementType: processDataType(type.elementType) };
    case "union":
      return { ...type, types: type.types.map(processDataType) };
    case "condition":
      return { ...type, result: processDataType(type.result) };
    case "instance":
      return {
        ...type,
        constructorArgs: type.constructorArgs.map((arg) => {
          const processedType = processDataType(arg.type);
          return {
            ...arg,
            type: arg.isOptional
              ? resolveUnionType([processedType, { kind: "undefined" }])
              : processedType,
          };
        }),
      };
    default:
      return type;
  }
}

export function resolveParameters(
  operationListItem: OperationListItem,
  _data: IData,
  context: Context
): OperationType["parameters"] {
  const data = resolveReference(_data, context);
  const params =
    typeof operationListItem.parameters === "function"
      ? operationListItem.parameters(data)
      : operationListItem.parameters;

  return params.map((param) => {
    const resolvedType =
      param.type.kind === "reference"
        ? resolveReferenceType(param.type, context)
        : param.type;
    const processedType = processDataType(resolvedType);
    if (param.isOptional) {
      return {
        ...param,
        type: resolveUnionType([processedType, { kind: "undefined" }]),
      };
    }
    return { ...param, type: processedType };
  });
}

export function resolveConstructorArgs(
  args: InstanceTypeConfig["constructorArgs"],
  expectedType?: DataType
): OperationType["parameters"] {
  return typeof args === "function"
    ? args(expectedType ? [{ type: expectedType, name: "value" }] : undefined)
    : args;
}

/* Execution */

export function getCacheKey(context: Context, operationId: string): string {
  if (!context.isIsolated) return operationId;
  return `${context.scopeId}:${operationId}`;
}

export function getStatementResult(
  statement: IStatement,
  context: Context,
  options?: {
    index?: number;
    prevEntity?: boolean;
    skipResolveReference?: boolean;
  }
  // TODO: Make use of the data type to create a more accurate type for result e.g. a union type
): IData {
  let result = statement.data;
  if (isFatalError(result)) return result;
  const operation = options?.index
    ? statement.operations[options.index - 1]
    : statement.operations[statement.operations.length - 1];

  if (options?.index || (!options?.prevEntity && operation)) {
    const cacheKey = operation?.id
      ? getCacheKey(context, operation.id)
      : undefined;
    const cached = cacheKey ? context.getResult(cacheKey)?.data : undefined;
    if (cached) result = cached;
    else if (operation?.type?.result) {
      result = createData({ id: operation.id, type: operation.type.result });
    } else {
      result = createData();
    }
  } else if (isDataOfType(result, "condition")) {
    result =
      context.getResult(getCacheKey(context, result.id))?.data ??
      getConditionResult(result.value, context);
  }
  return options?.skipResolveReference
    ? result
    : resolveReference(result, context);
}

export function getConditionResult(
  condition: DataValue<ConditionType>,
  context: Context
): IData {
  const conditionResult = getStatementResult(condition.condition, context);
  return getStatementResult(
    conditionResult.value ? condition.true : condition.false,
    context
  );
}

export function getSkipExecution({
  context,
  data: _data,
  operationName,
  paramIndex,
}: {
  context: Context;
  data: IData;
  operationName?: string;
  paramIndex?: number;
}): Context["skipExecution"] {
  if (context.skipExecution) return context.skipExecution;
  const data = resolveReference(_data, context);
  if (isFatalError(data)) return { reason: data.value.reason, kind: "error" };
  if (!operationName) return undefined;

  if (paramIndex !== undefined && isDataOfType(data, "boolean")) {
    if (
      operationName === "thenElse" &&
      data.value === (paramIndex === 0 ? false : true)
    ) {
      return { reason: "Unreachable branch", kind: "unreachable" };
    } else if (
      (operationName === "or" || operationName === "and") &&
      data.value === (operationName === "or" ? true : false)
    ) {
      return {
        reason: `${operationName} operation is unreachable`,
        kind: "unreachable",
      };
    }
  }

  return undefined;
}

export function getRawValueFromData(data: IData, context: Context): unknown {
  /* if-else used instead of switch for type narrowing */
  if (
    isDataOfType(data, "never") ||
    isDataOfType(data, "undefined") ||
    isDataOfType(data, "string") ||
    isDataOfType(data, "number") ||
    isDataOfType(data, "boolean") ||
    isDataOfType(data, "unknown")
  ) {
    return data.value;
  } else if (isDataOfType(data, "error")) {
    return new Error(
      `${ErrorTypesData[data.type.errorType].name}: ${data.value.reason}`
    );
  } else if (isDataOfType(data, "instance")) {
    return context.getInstance(data.value.instanceId)?.instance;
  } else if (isDataOfType(data, "operation")) {
    if (data.value.instanceId) {
      const stored = context.getInstance(data.value.instanceId);
      if (typeof stored?.instance === "function") {
        stored.instance._operationInstanceId = data.value.instanceId;
        return stored.instance;
      }
    }

    const func = (..._args: unknown[]) => {
      const [dataArg, ...args] = _args;
      const execute = context.isSync
        ? context.executeOperationSync
        : context.executeOperation;

      const result = execute(
        operationToListItem(data),
        createDataFromRawValue(dataArg, context),
        args.map((arg) =>
          createStatement({ data: createDataFromRawValue(arg, context) })
        ),
        context
      );
      return result instanceof Promise
        ? result.then((r) => getRawValueFromData(r, context))
        : getRawValueFromData(result, context);
    };

    const instanceId = nanoid();
    func._operationInstanceId = instanceId;
    context.setInstance(instanceId, { instance: func, type: data.type });
    return func;
  } else if (isDataOfType(data, "condition")) {
    return getRawValueFromData(
      getConditionResult(data.value, context),
      context
    );
  } else if (isDataOfType(data, "reference")) {
    return getRawValueFromData(
      createData(resolveReference(data, context)),
      context
    );
  } else if (isDataOfType(data, "array") || isDataOfType(data, "tuple")) {
    return data.value.map((element) =>
      getRawValueFromData(getStatementResult(element, context), context)
    );
  } else if (isDataOfType(data, "object") || isDataOfType(data, "dictionary")) {
    return data.value.entries.reduce(
      (acc, { key, value }) => {
        acc[key] = getRawValueFromData(
          getStatementResult(value, context),
          context
        );
        return acc;
      },
      {} as Record<string, unknown>
    );
  } else if (isDataOfType(data, "union")) {
    return getRawValueFromData(
      createData({
        type: getUnionActiveType(data.type, {
          value: data.value,
          context: context,
        }),
        value: data.value,
      }),
      context
    );
  }
  return "unknown";
}

/* Others */

export function getDataDropdownList({
  data,
  onSelect,
  context,
}: {
  data: IStatement["data"];
  onSelect: (operation: IStatement["data"], remove?: boolean) => void;
  context: Context;
}) {
  const allowedOptions: IDropdownItem[] = [];
  const dataTypeOptions: IDropdownItem[] = [];
  const variableOptions: IDropdownItem[] = [];
  const dataTypeSignature = getTypeSignature(data.type);
  if (
    context.expectedType &&
    !DataTypes[context.expectedType.kind].hideFromDropdown
  ) {
    const expectedTypeSignature = getTypeSignature(context.expectedType);
    const option: IDropdownItem = {
      entityType: "data",
      label: context.expectedType.kind,
      value: expectedTypeSignature,
      type: context.expectedType,
      onClick: () => {
        onSelect(createData({ id: data.id, type: context.expectedType }));
      },
    };
    if (dataTypeSignature !== expectedTypeSignature) {
      allowedOptions.push(option);
    } else if (!context.enforceExpectedType) {
      dataTypeOptions.push(option);
    }
  }

  (Object.keys(DataTypes) as DataType["kind"][]).forEach((kind) => {
    const kindSignature = getTypeSignature(DataTypes[kind].type);
    if (
      DataTypes[kind].hideFromDropdown ||
      (!isDataOfType(data, "reference") &&
        kindSignature === dataTypeSignature &&
        kind === data.type.kind) ||
      allowedOptions
        .concat(dataTypeOptions)
        .some(
          (option) =>
            option.value === kindSignature && option.type?.kind === kind
        )
    ) {
      return;
    }
    const option: IDropdownItem = {
      entityType: "data",
      value: kind,
      type: DataTypes[kind].type,
      onClick: () => {
        onSelect(createData({ id: data.id, type: DataTypes[kind].type }));
      },
    };
    if (
      !context.expectedType ||
      (kindSignature === getTypeSignature(context.expectedType) &&
        kind === context.expectedType.kind)
    ) {
      allowedOptions.push(option);
    } else if (!context.enforceExpectedType) {
      dataTypeOptions.push(option);
    }
  });

  (Object.keys(InstanceTypes) as (keyof typeof InstanceTypes)[]).forEach(
    (name) => {
      if (InstanceTypes[name].hideFromDropdown) return;
      const instanceConfig = InstanceTypes[name];
      const instanceType: DataType = {
        kind: "instance",
        className: instanceConfig.name,
        constructorArgs: resolveConstructorArgs(instanceConfig.constructorArgs),
      };

      const option: IDropdownItem = {
        entityType: "data",
        label: name,
        value: `instance:${name}`,
        type: instanceType,
        onClick: () => {
          onSelect(createData({ id: data.id, type: instanceType }));
        },
      };
      if (
        !context.expectedType ||
        isTypeCompatible(instanceType, context.expectedType, context)
      ) {
        allowedOptions.push(option);
      } else if (!context.enforceExpectedType) {
        dataTypeOptions.push(option);
      }
    }
  );

  context.variables.forEach((variable, name) => {
    const option: IDropdownItem = {
      value: name,
      secondaryLabel: variable.isEnv ? "env" : variable.data.type.kind,
      type: variable.data.type,
      entityType: "data",
      onClick: () =>
        onSelect({
          ...variable.data,
          id: data.id,
          type: { kind: "reference", name, isEnv: variable.isEnv },
          value: { name, id: variable.data.id },
        }),
    };
    if (
      !context.expectedType ||
      isTypeCompatible(variable.data.type, context.expectedType, context)
    ) {
      allowedOptions.unshift(option);
    } else if (!context.enforceExpectedType) {
      variableOptions.unshift(option);
    }
  });

  return [
    ["Allowed", allowedOptions],
    ["Variables", variableOptions],
    ["Data Types", dataTypeOptions],
  ] as [string, IDropdownItem[]][];
}

export function isTextInput(element: Element | null) {
  if (element instanceof HTMLInputElement && element.type === "text") {
    return element;
  }
}

export function handleSearchParams(
  params: Record<string, string | number | null | undefined>,
  replace?: boolean
) {
  const searchParams = new URLSearchParams(location.search);
  Object.entries(params).map(([key, value]) => {
    if (!value) searchParams.delete(key);
    else searchParams.set(key, value.toString());
  });
  return [searchParams, { replace }] as const;
}

export function fuzzySearch<T extends object>(
  data: T[],
  search?: Partial<{ [key in keyof T]: string }>[]
): T[] {
  if (!search || search.length === 0) return data;
  return data.reduce<T[]>((acc, item) => {
    for (const searchObj of search) {
      for (const [key, searchValue] of Object.entries(searchObj)) {
        if (!isObject(item) || typeof item[key] !== "string") continue;
        const fieldValue = item[key].toLowerCase().trim();
        const letters = String(searchValue).toLowerCase().trim().split("");
        const foundIndices: number[] = [];

        let lastIndex = -1;
        const match = letters.every((letter) => {
          const index = fieldValue.indexOf(letter, lastIndex + 1);
          if (index === -1) return false;
          foundIndices.push(index);
          lastIndex = index;
          return true;
        });

        if (match) {
          acc.push(item);
          return acc;
        }
      }
    }
    return acc;
  }, []);
}
