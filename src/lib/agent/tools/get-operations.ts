import type { ToolResult, Tool } from "./types";
import { GetOperationsSchema } from "./schemas";
import type { EntityContext } from "../entity-context";
import { findStatementById } from "../entity-context";
import { builtInOperations } from "../../built-in-operations";
import type { DataType, IData } from "../../types";
import { createData } from "../../utils";

function execute(ctx: EntityContext, args: unknown): ToolResult {
  const parsed = GetOperationsSchema.safeParse(args);
  if (!parsed.success) {
    return {
      success: false,
      error: `Invalid arguments: ${parsed.error.message}`,
    };
  }

  const { dataTypeKind, entityId } = parsed.data;

  let targetDataType: DataType;

  if (entityId) {
    const stmt = findStatementById(ctx, entityId);
    if (!stmt) {
      return { success: false, error: `Statement '${entityId}' not found` };
    }
    targetDataType = stmt.data.type;
  } else if (dataTypeKind) {
    targetDataType = { kind: dataTypeKind as DataType["kind"] } as DataType;
  } else {
    return { success: false, error: "Provide dataTypeKind or entityId" };
  }

  const mockData = createData({ type: targetDataType });
  const operations = builtInOperations
    .filter((op) => supportsType(op, mockData))
    .map((op) => ({ name: op.name, parameters: getParamInfo(op, mockData) }));

  return {
    success: true,
    data: {
      dataType: targetDataType.kind,
      operations,
      count: operations.length,
    },
    message: `Found ${operations.length} operations for type '${targetDataType.kind}'`,
  };
}

function supportsType(
  op: (typeof builtInOperations)[number],
  data: IData
): boolean {
  const params =
    typeof op.parameters === "function" ? op.parameters(data) : op.parameters;
  const firstParamType = params?.[0]?.type;
  if (!firstParamType) return false;
  return (
    firstParamType.kind === "unknown" || firstParamType.kind === data.type.kind
  );
}

function getParamInfo(
  op: (typeof builtInOperations)[number],
  data: IData
): Array<{ name: string; type: DataType; isOptional: boolean }> {
  const params =
    typeof op.parameters === "function" ? op.parameters(data) : op.parameters;
  return (params?.slice(1) ?? []).map((p, i) => ({
    name: p.name || `param${i}`,
    type: p.type,
    isOptional: p.isOptional ?? false,
  }));
}

export const getOperationsTool: Tool = {
  name: "get_operations",
  description:
    "Get available operations for a data type. Use before adding operation calls like .map, .filter.",
  parameters: GetOperationsSchema,
  execute,
};
