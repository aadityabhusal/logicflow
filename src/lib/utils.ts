import { nanoid } from "nanoid";
import { DataTypes, ErrorTypesData } from "./data";
import {
  IData,
  IStatement,
  DataType,
  IDropdownItem,
  DataValue,
  OperationType,
  ConditionType,
  Context,
  UnionType,
  ProjectFile,
  OperationListItem,
  ArrayType,
  ObjectType,
  ErrorType,
  DictionaryType,
  TupleType,
} from "./types";
import { MouseEvent } from "react";

/* Create */

export function createData<T extends DataType>(
  props?: Partial<IData<T>>
): IData<T> {
  const type = (props?.type ??
    inferTypeFromValue(props?.value, {
      variables: new Map(),
      getResult: () => undefined,
    })) as T;
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
  };
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

function createStatementFromType(
  type: DataType,
  name?: string,
  isOptional?: boolean
) {
  const value = createDefaultValue(type);
  const data = createData({ type, value });
  return createStatement({ data, name, isOptional });
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
      return [createStatementFromType(type.elementType)] as DataValue<T>;
    }

    case "tuple": {
      return type.elements.map((element) =>
        createStatementFromType(element)
      ) as DataValue<T>;
    }

    case "object": {
      const map = new Map<string, IStatement>();
      for (const [key, propType] of Object.entries(type.properties)) {
        if (
          type.required?.includes(key) ||
          options?.includeOptionalProperties
        ) {
          map.set(key, createStatementFromType(propType));
        }
      }
      return map as DataValue<T>;
    }

    case "dictionary": {
      if (
        type.elementType.kind === "unknown" ||
        type.elementType.kind === "never"
      ) {
        return new Map() as DataValue<T>;
      }
      return new Map([
        ["key", createStatementFromType(type.elementType)],
      ]) as DataValue<T>;
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
        parameters: type.parameters.map((param) =>
          createStatementFromType(param.type, param.name, param.isOptional)
        ),
        statements: [],
        result: undefined,
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

    default:
      return undefined as DataValue<T>;
  }
}

export function createProjectFile(
  props: Partial<ProjectFile>,
  prev: (string | ProjectFile)[] = []
): ProjectFile {
  const type = props.type || "operation";
  return {
    id: nanoid(),
    name:
      props.name ??
      createVariableName({ prefix: "operation", prev, indexOffset: 1 }),
    createdAt: Date.now(),
    tags: props.tags,
    type: type,
    ...(type === "operation"
      ? (() => {
          const type = DataTypes["operation"].type;
          return {
            content: props.content ?? { type, value: createDefaultValue(type) },
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
  if (!file || !isFileOfType(file, "operation")) return undefined;
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

export function createContextVariables(
  statements: IStatement[],
  context: Context,
  operation?: IData<OperationType>
): Context["variables"] {
  return statements.reduce((variables, statement) => {
    if (statement.name) {
      const data = resolveReference(statement.data, context);
      const result = getStatementResult(
        { ...statement, data },
        context.getResult
      );

      const isOptional = operation?.type.parameters.find(
        (param) => param.name === statement.name && param.isOptional
      );
      if (isOptional) {
        result.type = resolveUnionType([result.type, { kind: "undefined" }]);
      }

      variables.set(statement.name, {
        data: { ...result, id: statement.id },
        reference: isDataOfType(statement.data, "reference")
          ? statement.data.value
          : undefined,
      });
    }
    return variables;
  }, new Map(context.variables));
}

export function createFileVariables(
  files: ProjectFile[] = [],
  currentOperationId?: string
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
  }, new Map() as Context["variables"]);
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
        })
      );
      return prev;
    }, [] as IStatement[]);

  return createData({
    type: {
      kind: "operation",
      parameters: item.type.parameters,
      result: { kind: "undefined" },
    },
    value: { parameters: parameters, statements: [] },
  });
}

/* Types */

export function isTypeCompatible(first: DataType, second: DataType): boolean {
  if (first.kind === "unknown" || second.kind === "unknown") return true;

  if (first.kind === "operation" && second.kind === "operation") {
    if (!isTypeCompatible(first.result, second.result)) return false;
    return (
      first.parameters.every((firstParam, index) => {
        if (firstParam.isOptional && !second.parameters[index]) return true;
        if (!second.parameters[index]) return false;
        return isTypeCompatible(firstParam.type, second.parameters[index].type);
      }) &&
      second.parameters.every((secondParam, index) => {
        if (secondParam.isOptional && !first.parameters[index]) return true;
        if (!first.parameters[index]) return false;
        return isTypeCompatible(secondParam.type, first.parameters[index].type);
      })
    );
  }

  if (first.kind === "array" && second.kind === "array") {
    return isTypeCompatible(first.elementType, second.elementType);
  }

  if (first.kind === "tuple" && second.kind === "tuple") {
    return first.elements.every((firstElement) =>
      second.elements.some((secondElement) =>
        isTypeCompatible(firstElement, secondElement)
      )
    );
  }

  if (first.kind === "object" && second.kind === "object") {
    const firstRequired = first.required ?? Object.keys(first.properties);
    const secondRequired = second.required ?? Object.keys(second.properties);
    for (const key of Object.keys(second.properties)) {
      const firstProp = first.properties[key];
      if (!firstProp && secondRequired.includes(key)) return false;
      if (firstProp && !isTypeCompatible(firstProp, second.properties[key])) {
        return false;
      }
    }
    return firstRequired.every((key) => second.properties[key]);
  }

  if (first.kind === "dictionary" && second.kind === "dictionary") {
    return isTypeCompatible(first.elementType, second.elementType);
  }

  if (first.kind === "union" && second.kind === "union") {
    if (first.types.length !== second.types.length) return false;
    // Bi-directional check to maintain order-independence and avoid duplicate types
    return (
      first.types.every((firstType) =>
        second.types.some((secondType) =>
          isTypeCompatible(firstType, secondType)
        )
      ) &&
      second.types.every((secondType) =>
        first.types.some((firstType) => isTypeCompatible(firstType, secondType))
      )
    );
  } else if (second.kind === "union") {
    return second.types.some((t) => isTypeCompatible(first, t));
  }

  if (first.kind === "reference" && second.kind === "reference") {
    return isTypeCompatible(first.dataType, second.dataType);
  } else if (first.kind === "reference") {
    return isTypeCompatible(first.dataType, second);
  } else if (second.kind === "reference") {
    return isTypeCompatible(first, second.dataType);
  }

  return first.kind === second.kind;
}

export function isDataOfType<K extends DataType["kind"]>(
  data: IData<DataType> | undefined,
  kind: K
): data is IData<Extract<DataType, { kind: K }>> {
  return data?.type.kind === kind;
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

export function isFileOfType<T extends ProjectFile["type"]>(
  file: ProjectFile | undefined,
  type: T
): file is Extract<ProjectFile, { type: T }> {
  return file?.type === type;
}

export function getInverseTypes(
  originalTypes: Context["variables"],
  narrowedTypes: Context["variables"]
): Context["variables"] {
  return narrowedTypes.entries().reduce((acc, [key, value]) => {
    const variable = originalTypes.get(key);
    if (!variable) return acc;
    let excludedType: DataType = variable.data.type;

    if (variable.data.type.kind === "union") {
      const remainingTypes = variable.data.type.types.filter(
        (t) => !isTypeCompatible(t, value.data.type)
      );
      if (remainingTypes.length === 0) excludedType = { kind: "never" };
      else excludedType = resolveUnionType(remainingTypes);
    } else if (isTypeCompatible(variable.data.type, value.data.type)) {
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

function objectTypeMatch(source: DataType, target: DataType): boolean {
  if (target.kind !== "object") return isTypeCompatible(source, target);
  if (source.kind !== "object") return false;
  return Object.entries(target.properties).every(([key, targetType]) => {
    const sourceType = source.properties[key];
    return sourceType && isTypeCompatible(sourceType, targetType);
  });
}

function narrowType(
  originalType: DataType,
  targetType: DataType
): DataType | undefined {
  if (targetType.kind === "never") return { kind: "never" };
  if (originalType.kind === "unknown") return targetType;
  if (originalType.kind === "union") {
    const narrowedTypes = originalType.types.filter((t) => {
      if (targetType.kind === "object") return objectTypeMatch(t, targetType);
      return isTypeCompatible(t, targetType);
    });

    if (narrowedTypes.length === 0) return undefined;
    return resolveUnionType(narrowedTypes);
  }
  if (originalType.kind === "object" && targetType.kind === "object") {
    return objectTypeMatch(originalType, targetType) ? originalType : undefined;
  }
  return originalType;
}

export function applyTypeNarrowing(
  context: Context,
  narrowedTypes: Context["variables"],
  data: IData,
  operation: IData<OperationType>
): Context["variables"] {
  if (!operation) return narrowedTypes;
  const param = operation.value.parameters[0];
  let narrowedType: DataType | undefined;
  let referenceName: string | undefined;

  if (
    (operation.value.name === "isTypeOf" ||
      operation.value.name === "isEqual") &&
    param &&
    isDataOfType(data, "reference")
  ) {
    referenceName = data.value.name;
    const reference = context.variables.get(referenceName);
    if (reference) {
      const resolvedParamData = resolveReference(param.data, context);
      const targetType = isDataOfType(resolvedParamData, "union")
        ? getUnionActiveType(
            resolvedParamData.type,
            resolvedParamData.value,
            context
          )
        : resolvedParamData.type;
      narrowedType = narrowType(reference.data.type, targetType);
    }
  }

  if (
    (operation.value.name === "or" || operation.value.name === "and") &&
    isDataOfType(param.data, "reference") &&
    param.operations[0]
  ) {
    const resultType = applyTypeNarrowing(
      context,
      new Map(
        operation.value.name === "or" ? context.variables : narrowedTypes
      ),
      param.data,
      param.operations[0]
    );
    referenceName = param.data.value.name;
    const types = [
      narrowedTypes.get(referenceName)?.data.type,
      resultType.get(referenceName)?.data.type,
    ].filter(Boolean) as DataType[];

    if (types.length > 0) narrowedType = resolveUnionType(types);
  }

  if (operation.value.name === "not") {
    narrowedTypes = getInverseTypes(context.variables, narrowedTypes);
  }

  if (referenceName) {
    const variable = context.variables.get(referenceName);
    if (variable) {
      narrowedTypes.set(referenceName, {
        ...variable,
        data: { ...variable.data, type: narrowedType ?? { kind: "never" } },
      });
    }
  }

  return narrowedTypes;
}

export function mergeNarrowedTypes(
  originalTypes: Context["variables"],
  narrowedTypes: Context["variables"],
  operationName?: string
): Context["variables"] {
  return operationName === "or"
    ? originalTypes
    : narrowedTypes.entries().reduce((acc, [key, value]) => {
        if (value.data.type.kind === "never") acc.delete(key);
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
      ? getInverseTypes(context.variables, narrowedTypes)
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
    if (
      !acc.some((t) => isTypeCompatible(t, type) && isTypeCompatible(type, t))
    ) {
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
  if (elements.length === 0) return { kind: "unknown" };
  const firstType = getStatementResult(elements[0], context.getResult).type;
  const allSameType = elements.every((element) => {
    return isTypeCompatible(
      getStatementResult(element, context.getResult).type,
      firstType
    );
  });
  if (allSameType) return firstType;

  const unionTypes = elements.reduce((acc, element) => {
    const elementType = getStatementResult(element, context.getResult).type;
    const exists = acc.some((t) => isTypeCompatible(t, elementType));
    if (!exists) acc.push(elementType);
    return acc;
  }, [] as DataType[]);
  return resolveUnionType(unionTypes);
}

export function getOperationResultType(
  statements: IStatement[],
  getResult: Context["getResult"]
): DataType {
  let resultType: DataType = { kind: "undefined" };
  if (statements.length > 0) {
    const lastStatement = statements[statements.length - 1];
    resultType = getStatementResult(lastStatement, getResult).type;
  }
  return resultType;
}

export function resolveReference(data: IData, context: Context): IData {
  if (isDataOfType(data, "reference")) {
    const variable = context.variables.get(data.value.name);
    if (!variable) {
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
    const newMap = new Map();
    data.value.forEach((statement, key) => {
      newMap.set(key, {
        ...statement,
        data: resolveReference(statement.data, context),
      });
    });
    return createData({ ...data, value: newMap } as IData<
      ObjectType | DictionaryType
    >);
  }
  return data;
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
            (element) => getStatementResult(element, context.getResult).type
          ),
        } as T)
      : ({
          kind: "array",
          elementType: getArrayElementType(value, context),
        } as T);
  }
  if (value instanceof Map) {
    return context.expectedType?.kind === "object"
      ? ({
          kind: "object",
          properties: value.entries().reduce((acc, [key, statement]) => {
            acc[key] = getStatementResult(statement, context.getResult).type;
            return acc;
          }, {} as { [key: string]: DataType }),
          required: context.expectedType?.required ?? [],
        } as T)
      : ({
          kind: "dictionary",
          elementType: getArrayElementType(Array.from(value.values()), context),
        } as T);
  }
  if (
    isObject(value, ["parameters", "statements"]) &&
    Array.isArray(value.parameters) &&
    Array.isArray(value.statements)
  ) {
    return {
      kind: "operation",
      // TODO: Add optional parameters support
      parameters: value.parameters.map((param) => ({
        name: param.name,
        type: param.data.type,
      })),
      result: getOperationResultType(value.statements, context.getResult),
    } as T;
  }
  if (isObject(value, ["condition", "true", "false"])) {
    const trueType = getStatementResult(
      value.true as IStatement,
      context.getResult
    ).type;
    const falseType = getStatementResult(
      value.false as IStatement,
      context.getResult
    ).type;
    const unionType = resolveUnionType(
      isTypeCompatible(trueType, falseType) ? [trueType] : [trueType, falseType]
    );
    return { kind: "condition", result: unionType } as T;
  }
  if (isObject(value, ["name"]) && typeof value.name === "string") {
    const type = context.variables.get(value.name)?.data.type;
    return { kind: "reference", dataType: type ?? { kind: "unknown" } } as T;
  }

  if (isObject(value, ["reason"]) && typeof value.reason === "string") {
    return { kind: "error", errorType: "custom_error" } as T;
  }
  return { kind: "unknown" } as T;
}

export function getUnionActiveType(
  unionType: UnionType,
  value: unknown,
  context: Context
): DataType {
  if (unionType.activeIndex !== undefined) {
    return unionType.types[unionType.activeIndex] ?? unionType.types[0];
  }
  const inferredType = inferTypeFromValue(value, context);
  const index = unionType.types.findIndex((t) =>
    isTypeCompatible(inferredType, t)
  );
  return index === -1 ? unionType.types[0] : unionType.types[index];
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
      const entries = Object.entries(type.properties).slice(0, maxEntries);
      const props = entries
        .map(
          ([k, v]) =>
            `${k}${type.required?.includes(k) ? "" : "?"}: ${getTypeSignature(
              v,
              maxDepth - 1
            )}`
        )
        .join(", ");
      return `{ ${props} ${entries.length > maxEntries ? ", ..." : ""} }`;
    }
    case "dictionary":
      return `dictionary<${getTypeSignature(type.elementType, maxDepth - 1)}>`;

    case "union":
      return resolveUnionType(type.types, true)
        .types.map((t) => getTypeSignature(t, maxDepth - 1))
        .join(" | ");

    case "operation": {
      const params = type.parameters
        .map(
          (p) =>
            `${p.name || "_"}${p.isOptional ? "?" : ""}: ${getTypeSignature(
              p.type,
              maxDepth - 1
            )}`
        )
        .join(", ");
      return `(${params}) => ${getTypeSignature(type.result, maxDepth - 1)}`;
    }

    case "condition":
      return getTypeSignature(type.result, maxDepth - 1);

    case "reference":
      return getTypeSignature(type.dataType, maxDepth - 1);
    default:
      return "unknown";
  }
}

export function resolveParameters(
  operationListItem: OperationListItem,
  _data: IData,
  context: Context
) {
  const data = resolveReference(_data, context);
  const params =
    typeof operationListItem.parameters === "function"
      ? operationListItem.parameters(data)
      : operationListItem.parameters;
  return params.map((param) => {
    if (param.isOptional)
      return {
        ...param,
        type: resolveUnionType([param.type, { kind: "undefined" }]),
      };
    return param;
  });
}

/* Execution */

export function getStatementResult(
  statement: IStatement,
  getResult: Context["getResult"],
  index?: number,
  prevEntity?: boolean
  // TODO: Make use of the data type to create a better type for result e.g. a union type
): IData {
  let result = statement.data;
  if (isDataOfType(result, "error")) return { ...result, id: statement.id };
  const lastOperation = statement.operations[statement.operations.length - 1];
  if (index) {
    result = getResult(statement.operations[index - 1]?.id) ?? createData();
  } else if (!prevEntity && lastOperation) {
    result = getResult(lastOperation.id) ?? createData();
  } else if (isDataOfType(result, "condition")) {
    result =
      getResult(result.id) ?? getConditionResult(result.value, getResult);
  }
  return { ...result, id: statement.id };
}

export function getConditionResult(
  condition: DataValue<ConditionType>,
  getResult: Context["getResult"]
): IData {
  const conditionResult = getStatementResult(condition.condition, getResult);
  return getStatementResult(
    conditionResult.value ? condition.true : condition.false,
    getResult
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
  if (isDataOfType(data, "error"))
    return { reason: data.value.reason, kind: "error" };
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

export function getRawValue(data: IData, context: Context): unknown {
  switch (data.type.kind) {
    case "never":
    case "undefined":
    case "string":
    case "number":
    case "boolean":
    case "unknown":
      return data.value;

    case "error":
      return new Error((data.value as DataValue<ErrorType>).reason);

    case "array":
    case "tuple":
      return (data.value as DataValue<ArrayType>).map((element) =>
        getRawValue(getStatementResult(element, context.getResult), context)
      );

    case "object":
    case "dictionary":
      return Object.fromEntries(
        (data.value as DataValue<ObjectType>)
          .entries()
          .map(([key, value]) => [
            key,
            getRawValue(getStatementResult(value, context.getResult), context),
          ])
      );

    case "union":
      return getRawValue(
        createData({
          type: getUnionActiveType(data.type, data.value, context),
          value: data.value,
        }),
        context
      );

    case "operation":
    case "condition":
      return data.type;

    case "reference":
      return getRawValue(createData(resolveReference(data, context)), context);
    default:
      return "unknown";
  }
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

  context.variables.entries().forEach(([name, variable]) => {
    const option: IDropdownItem = {
      value: name,
      secondaryLabel: variable.data.type.kind,
      type: variable.data.type,
      entityType: "data",
      onClick: () =>
        onSelect({
          ...variable.data,
          id: data.id,
          type: { kind: "reference", dataType: variable.data.type },
          value: { name, id: variable.data.id },
        }),
    };
    if (
      !context.expectedType ||
      isTypeCompatible(variable.data.type, context.expectedType)
    ) {
      allowedOptions.unshift(option);
    } else if (!context.enforceExpectedType) {
      variableOptions.unshift(option);
    }
  });

  return [
    ["Allowed", allowedOptions],
    ["Data Types", dataTypeOptions],
    ["Variables", variableOptions],
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

export function didMouseEnterFromRight(e: MouseEvent) {
  const rect = e.currentTarget.getBoundingClientRect();
  const mouseX = e.clientX;
  const elementRight = rect.right;
  return mouseX >= elementRight - 5;
}
