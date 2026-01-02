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
  Parameter,
  ProjectFile,
} from "./types";

/* Create */

export function createData<T extends DataType>(
  props?: Partial<IData<T>>
): IData<T> {
  const type = (props?.type || { kind: "undefined" }) as T;
  return {
    id: props?.id ?? nanoid(),
    entityType: "data",
    type,
    value: props?.value ?? createDefaultValue(type),
  };
}

export function createStatement(props?: Partial<IStatement>): IStatement {
  const newData = props?.data || createData();
  const newId = props?.id || nanoid();
  return {
    id: newId,
    name: props?.name,
    entityType: "statement",
    data: newData,
    operations: props?.operations || [],
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

function createStatementFromType(type: DataType, name?: string) {
  const value = createDefaultValue(type);
  const data = createData({ type, value });
  return createStatement({ data, name });
}

export function createDefaultValue<T extends DataType>(type: T): DataValue<T> {
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

    case "object": {
      const map = new Map<string, IStatement>();
      for (const [key, propType] of Object.entries(type.properties)) {
        map.set(key, createStatementFromType(propType));
      }
      return map as DataValue<T>;
    }

    case "union": {
      // Use first type's default (could be enhanced to pick "most specific")
      return createDefaultValue(type.types[0]) as DataValue<T>;
    }

    case "operation": {
      return {
        parameters: type.parameters.map((param) =>
          createStatementFromType(param.type, param.name)
        ),
        statements: [],
        result: undefined,
      } as DataValue<T>;
    }

    case "condition": {
      const createStatement = (): IStatement => ({
        id: nanoid(),
        entityType: "statement",
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

export function createParamData(
  item: Parameter,
  data: IData
): IStatement["data"] {
  if (item.type.kind !== "operation") {
    return createData({ type: item.type || data.type });
  }

  const parameters = item.type.parameters.reduce((prev, paramSpec) => {
    prev.push(
      createStatement({
        name: paramSpec.name ?? createVariableName({ prefix: "param", prev }),
        data: createParamData({ type: paramSpec.type }, data),
      })
    );
    return prev;
  }, [] as IStatement[]);

  return createData({
    type: {
      kind: "operation",
      parameters: parameters.map((p) => ({ name: p.name, type: p.data.type })),
      result: { kind: "undefined" },
    },
    value: { parameters: parameters, statements: [] },
  });
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
    entityType: "data",
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
  variables: Context["variables"]
): Context["variables"] {
  return statements.reduce((variables, statement) => {
    if (statement.name) {
      const data = resolveReference(statement.data, { variables });
      const result = getStatementResult({ ...statement, data });

      variables.set(statement.name, {
        data: { ...result, id: statement.id },
        reference: isDataOfType(statement.data, "reference")
          ? statement.data.value
          : undefined,
      });
    }
    return variables;
  }, new Map(variables));
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

/* Types */

export function isTypeCompatible(first: DataType, second: DataType): boolean {
  if (first.kind === "unknown" || second.kind === "unknown") return true;

  if (first.kind === "operation" && second.kind === "operation") {
    if (first.parameters.length !== second.parameters.length) return false;
    if (!isTypeCompatible(first.result, second.result)) return false;
    return first.parameters.every((firstParam, index) =>
      isTypeCompatible(firstParam.type, second.parameters[index].type)
    );
  }

  if (first.kind === "array" && second.kind === "array") {
    return isTypeCompatible(first.elementType, second.elementType);
  }

  if (first.kind === "object" && second.kind === "object") {
    const firstKeys = Object.keys(first.properties);
    const secondKeys = Object.keys(second.properties);
    if (firstKeys.length !== secondKeys.length) return false;
    return secondKeys.every(
      (key) =>
        first.properties[key] &&
        isTypeCompatible(first.properties[key], second.properties[key])
    );
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
  } else if (first.kind === "union") {
    return first.types.some((t) => isTypeCompatible(t, second));
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
      narrowedType = narrowType(
        reference.data.type,
        inferTypeFromValue(param.data.value)
      );
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
    ? originalTypes // TODO: inverse narrowed types for 'or' operation
    : narrowedTypes.entries().reduce((acc, [key, value]) => {
        if (value.data.type.kind === "never") acc.delete(key);
        else acc.set(key, value);
        return acc;
      }, new Map(originalTypes));
}

export function resolveUnionType(types: DataType[], union: true): UnionType;
export function resolveUnionType(types: DataType[], union?: false): DataType;
export function resolveUnionType(
  types: DataType[],
  forceUnion = false
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
  const sortedTypes = uniqueTypes.sort((a, b) => a.kind.localeCompare(b.kind));
  return { kind: "union", types: sortedTypes };
}

function getArrayElementType(elements: IStatement[]): DataType {
  if (elements.length === 0) return { kind: "unknown" };
  const firstType = elements[0].data.type;
  const allSameType = elements.every((element) => {
    return isTypeCompatible(element.data.type, firstType);
  });
  if (allSameType) return firstType;

  const unionTypes = elements.reduce((acc, element) => {
    const elementType = element.data.type;
    const exists = acc.some((t) => isTypeCompatible(t, elementType));
    if (!exists) acc.push(elementType);
    return acc;
  }, [] as DataType[]);
  return resolveUnionType(unionTypes);
}

function getOperationType(
  parameters: IStatement[],
  statements: IStatement[]
): OperationType {
  const parameterTypes = parameters.map((param) => ({
    name: param.name,
    type: param.data.type,
  }));

  let resultType: DataType = { kind: "undefined" };
  if (statements.length > 0) {
    const lastStatement = statements[statements.length - 1];
    resultType = getStatementResult(lastStatement).type;
  }

  return { kind: "operation", parameters: parameterTypes, result: resultType };
}

export function resolveReference(data: IData, context: Context): IData {
  if (!isDataOfType(data, "reference")) return data;
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

export function inferTypeFromValue<T extends DataType>(
  value: DataValue<T>,
  context?: Context
): T {
  if (value === undefined) return { kind: "undefined" } as T;
  if (typeof value === "string") return { kind: "string" } as T;
  if (typeof value === "number") return { kind: "number" } as T;
  if (typeof value === "boolean") return { kind: "boolean" } as T;

  if (Array.isArray(value)) {
    return {
      kind: "array",
      elementType: getArrayElementType(value),
    } as T;
  }
  if (value instanceof Map) {
    return {
      kind: "object",
      properties: value.entries().reduce((acc, [key, statement]) => {
        acc[key] = statement.data.type;
        return acc;
      }, {} as { [key: string]: DataType }),
    } as T;
  }
  if (
    isObject(value, ["parameters", "statements"]) &&
    Array.isArray(value.parameters) &&
    Array.isArray(value.statements)
  ) {
    return getOperationType(value.parameters, value.statements) as T;
  }
  if (isObject(value, ["condition", "true", "false"])) {
    const trueType = getStatementResult(value.true as IStatement).type;
    const falseType = getStatementResult(value.false as IStatement).type;
    const unionType = resolveUnionType(
      isTypeCompatible(trueType, falseType) ? [trueType] : [trueType, falseType]
    );
    return { kind: "condition", resultType: unionType } as T;
  }
  if (isObject(value, ["name"]) && typeof value.name === "string" && context) {
    const type = context.variables.get(value.name)?.data.type;
    return { kind: "reference", dataType: type ?? { kind: "unknown" } } as T;
  }

  if (isObject(value, ["reason"]) && typeof value.reason === "string") {
    return { kind: "error", errorType: "custom_error" } as T;
  }
  return { kind: "unknown" } as T;
}

export function getTypeSignature(type: DataType, maxDepth: number = 4): string {
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
      return `${getTypeSignature(type.elementType, maxDepth - 1)}[]`;

    case "object": {
      const maxEntries = 3;
      const entries = Object.entries(type.properties).slice(0, maxEntries);
      const props = entries
        .map(([k, v]) => `${k}: ${getTypeSignature(v, maxDepth - 1)}`)
        .join(", ");
      return `{ ${props} ${entries.length > maxEntries ? ", ..." : ""} }`;
    }

    case "union":
      return type.types
        .map((t) => getTypeSignature(t, maxDepth - 1))
        .join(" | ");

    case "operation": {
      const params = type.parameters
        .map(
          (p) => `${p.name || "_"}: ${getTypeSignature(p.type, maxDepth - 1)}`
        )
        .join(", ");
      return `(${params}) => ${getTypeSignature(type.result, maxDepth - 1)}`;
    }

    case "condition":
      return getTypeSignature(type.resultType, maxDepth - 1);

    case "reference":
      return getTypeSignature(type.dataType, maxDepth - 1);
    default:
      return "unknown";
  }
}

/* Result */

export function getStatementResult(
  statement: IStatement,
  index?: number,
  prevEntity?: boolean
  // TODO: Make use of the data type to create a better type for result e.g. a union type
): IData {
  let result = statement.data;
  if (isDataOfType(result, "error")) return { ...result, id: statement.id };
  const lastOperation = statement.operations[statement.operations.length - 1];
  if (index) {
    const statementResult = statement.operations[index - 1]?.value.result;
    result = statementResult ?? createData();
  } else if (!prevEntity && lastOperation) {
    result = lastOperation.value.result ?? createData();
  } else if (isDataOfType(result, "condition")) {
    result = result.value.result ?? getConditionResult(result.value);
  }
  return { ...result, id: statement.id };
}

export function getConditionResult(condition: DataValue<ConditionType>): IData {
  const conditionResult = getStatementResult(condition.condition);
  return getStatementResult(
    conditionResult.value ? condition.true : condition.false
  );
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

  (Object.keys(DataTypes) as DataType["kind"][]).forEach((kind) => {
    if (
      DataTypes[kind].hideFromDropdown ||
      (!isDataOfType(data, "reference") && kind === data.type.kind)
    ) {
      return;
    }
    const option: IDropdownItem = {
      entityType: "data",
      value: kind,
      onClick: () => {
        onSelect(createData({ id: data.id, type: DataTypes[kind].type }));
      },
    };
    if (!context.expectedType || kind === context.expectedType.kind) {
      allowedOptions.push(option);
    } else if (!context.forceExpectedType) {
      dataTypeOptions.push(option);
    }
  });

  context.variables.entries().forEach(([name, variable]) => {
    const option: IDropdownItem = {
      value: name,
      secondaryLabel: variable.data.type.kind,
      variableType: variable.data.type,
      entityType: "data",
      onClick: () =>
        onSelect({
          ...variable.data,
          id: nanoid(),
          type: { kind: "reference", dataType: variable.data.type },
          value: { name, id: variable.data.id },
        }),
    };
    if (
      !context.expectedType ||
      isTypeCompatible(variable.data.type, context.expectedType)
    ) {
      allowedOptions.unshift(option);
    } else if (!context.forceExpectedType) {
      variableOptions.unshift(option);
    }
  });

  return [
    ["Allowed", allowedOptions],
    ["Data Types", dataTypeOptions],
    ["Variables", variableOptions],
  ] as [string, IDropdownItem[]][];
}

export function jsonParseReviver(_: string, value: unknown) {
  if (isObject(value, ["_map_"]) && Array.isArray(value._map_)) {
    return new Map(value._map_);
  }
  return value;
}

export function jsonStringifyReplacer(_: string, value: IData["value"]) {
  return value instanceof Map ? { _map_: Array.from(value.entries()) } : value;
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
