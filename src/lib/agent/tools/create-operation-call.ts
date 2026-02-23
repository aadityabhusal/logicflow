import type { ToolResult, Tool } from "./types";
import { CreateOperationCallSchema } from "./schemas";
import type { EntityContext } from "../entity-context";
import { findStatementById, generateId } from "../entity-context";
import type { OperationType, IData } from "../../types";

interface CreateOperationCallInput {
  parentId: string;
  data: IData;
  index: number | null;
}

function execute(ctx: EntityContext, args: unknown): ToolResult {
  const parsed = CreateOperationCallSchema.safeParse(args);
  if (!parsed.success) {
    return { success: false, error: `Invalid arguments: ${parsed.error.message}` };
  }

  const input = parsed.data as CreateOperationCallInput;
  const { parentId, data, index } = input;

  const parent = findStatementById(ctx, parentId);
  if (!parent) {
    return { success: false, error: `Statement '${parentId}' not found` };
  }

  if (data.type?.kind !== "operation") {
    return {
      success: false,
      error: "Data must have type 'operation'. Use create_statement for creating statements.",
    };
  }

  if (!parent.operations) {
    parent.operations = [];
  }

  data.id = generateId(ctx);
  parent.operations.splice(index ?? parent.operations.length, 0, data as IData<OperationType>);

  return {
    success: true,
    data: { id: data.id, type: "operation_call" },
    message: `Added operation call to '${parentId}'`,
  };
}

export const createOperationCallTool: Tool = {
  name: "create_operation_call",
  description:
    "Add an operation call (like .map, .filter) to a statement. Provide parentId (statement ID) and data with type 'operation'.",
  parameters: CreateOperationCallSchema,
  execute,
};
