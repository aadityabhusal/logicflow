import type { ToolResult, Tool } from "./types";
import { UpdateDataSchema } from "./schemas";
import type { EntityContext } from "../entity-context";
import type { OperationType, IData } from "../../types";

interface UpdateDataInput {
  entityId: string;
  data: IData;
}

function execute(ctx: EntityContext, args: unknown): ToolResult {
  const parsed = UpdateDataSchema.safeParse(args);
  if (!parsed.success) {
    return { success: false, error: `Invalid arguments: ${parsed.error.message}` };
  }

  const input = parsed.data as UpdateDataInput;
  const { entityId, data } = input;

  const allStatements = [
    ...ctx.operation.value.parameters,
    ...ctx.operation.value.statements,
  ];

  for (const stmt of allStatements) {
    if (stmt.data.id === entityId) {
      data.id = entityId;
      stmt.data = data;
      return {
        success: true,
        data: { id: entityId, updated: true },
        message: `Updated data for statement '${stmt.id}'`,
      };
    }

    for (let i = 0; i < (stmt.operations?.length || 0); i++) {
      const op = stmt.operations![i];
      if (op.id === entityId) {
        if (data.type?.kind !== "operation") {
          return {
            success: false,
            error: "Operation call data must have type 'operation'",
          };
        }
        data.id = entityId;
        stmt.operations![i] = data as IData<OperationType>;
        return {
          success: true,
          data: { id: entityId, updated: true },
          message: `Updated operation call '${entityId}'`,
        };
      }
    }
  }

  return { success: false, error: `Entity '${entityId}' not found` };
}

export const updateDataTool: Tool = {
  name: "update_data",
  description:
    "Update existing data (statement data or operation call). Provide entityId and the new data structure.",
  parameters: UpdateDataSchema,
  execute,
};
