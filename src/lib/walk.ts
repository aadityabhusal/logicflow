import {
  ArrayType,
  ConditionType,
  DataType,
  DictionaryType,
  IData,
  InstanceDataType,
  IStatement,
  ObjectType,
  OperationType,
  ReferenceType,
  TupleType,
} from "./types";
import { isDataOfType } from "./utils";

export type Visitors = {
  onStatement?: (stmt: IStatement) => void;
  onData?: (data: IData) => void;
  onDataType?: (type: DataType) => void;
  onReference?: (data: IData<ReferenceType>) => void;
  onArray?: (data: IData<ArrayType | TupleType>) => void;
  onObject?: (data: IData<ObjectType | DictionaryType>) => void;
  onOperation?: (data: IData<OperationType>) => void;
  onInstance?: (data: IData<InstanceDataType>) => void;
  onCondition?: (data: IData<ConditionType>) => void;
};
export type WalkOptions = {
  nestedOperations?: boolean;
  operationCalls?: boolean;
  dataTypes?: boolean;
};

export function walkDataType(
  type: DataType,
  onDataType: (type: DataType) => void
): void {
  onDataType(type);
  if (type.kind === "instance") {
    if (type.result) walkDataType(type.result, onDataType);
    for (const param of type.constructorArgs) {
      walkDataType(param.type, onDataType);
    }
  } else if (type.kind === "array" || type.kind === "dictionary") {
    walkDataType(type.elementType, onDataType);
  } else if (type.kind === "tuple") {
    for (const element of type.elements) walkDataType(element, onDataType);
  } else if (type.kind === "object") {
    for (const prop of type.properties) walkDataType(prop.value, onDataType);
  } else if (type.kind === "union") {
    for (const t of type.types) walkDataType(t, onDataType);
  } else if (type.kind === "operation") {
    for (const param of type.parameters) walkDataType(param.type, onDataType);
    walkDataType(type.result, onDataType);
  }
}

export function walkData(
  data: IData,
  visitors: Visitors,
  options?: WalkOptions
) {
  visitors.onData?.(data);
  if (options?.dataTypes && visitors.onDataType) {
    walkDataType(data.type, visitors.onDataType);
  }

  if (isDataOfType(data, "reference")) {
    visitors.onReference?.(data);
  } else if (isDataOfType(data, "array") || isDataOfType(data, "tuple")) {
    visitors.onArray?.(data);
    for (const item of data.value) walkStatement(item, visitors, options);
  } else if (isDataOfType(data, "object") || isDataOfType(data, "dictionary")) {
    visitors.onObject?.(data);
    for (const entry of data.value.entries)
      walkStatement(entry.value, visitors, options);
  } else if (isDataOfType(data, "operation")) {
    visitors.onOperation?.(data);
    if (options?.nestedOperations) {
      for (const param of data.value.parameters)
        walkStatement(param, visitors, options);
      for (const stmt of data.value.statements)
        walkStatement(stmt, visitors, options);
    }
  } else if (isDataOfType(data, "instance")) {
    visitors.onInstance?.(data);
    for (const arg of data.value.constructorArgs)
      walkStatement(arg, visitors, options);
  } else if (isDataOfType(data, "condition")) {
    visitors.onCondition?.(data);
    walkStatement(data.value.condition, visitors, options);
    for (const stmt of data.value.trueBranch)
      walkStatement(stmt, visitors, options);
    for (const stmt of data.value.falseBranch)
      walkStatement(stmt, visitors, options);
    if (options?.nestedOperations) {
      for (const branch of [data.value.trueBranch, data.value.falseBranch])
        for (const statement of branch)
          for (const op of statement.operations)
            for (const param of op.value.parameters)
              walkStatement(param, visitors, options);
    }
  }
}

export function walkStatement(
  stmt: IStatement,
  visitors: Visitors,
  options?: WalkOptions
) {
  visitors.onStatement?.(stmt);
  walkData(stmt.data, visitors, options);
  for (const op of stmt.operations) {
    if (options?.operationCalls) walkData(op, visitors, options);
    for (const param of op.value.parameters) {
      walkStatement(param, visitors, options);
    }
  }
}
