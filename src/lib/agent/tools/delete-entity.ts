import type { ToolResult, Tool } from "./types";
import { DeleteEntitySchema } from "./schemas";
import type { EntityContext } from "../entity-context";

function execute(ctx: EntityContext, args: unknown): ToolResult {
  const parsed = DeleteEntitySchema.safeParse(args);
  if (!parsed.success) {
    return { success: false, error: `Invalid arguments: ${parsed.error.message}` };
  }

  const { id, type } = parsed.data;

  if (type === "parameter") {
    const index = ctx.operation.value.parameters.findIndex((p) => p.id === id);
    if (index === -1) {
      return { success: false, error: `Parameter '${id}' not found` };
    }
    const deleted = ctx.operation.value.parameters.splice(index, 1)[0];
    ctx.operation.type.parameters = ctx.operation.type.parameters.filter(
      (p) => p.name !== deleted.name
    );
    return {
      success: true,
      data: { id, deleted: true },
      message: `Deleted parameter '${id}'`,
    };
  }

  if (type === "statement") {
    const index = ctx.operation.value.statements.findIndex((s) => s.id === id);
    if (index === -1) {
      return { success: false, error: `Statement '${id}' not found` };
    }
    ctx.operation.value.statements.splice(index, 1);
    return {
      success: true,
      data: { id, deleted: true },
      message: `Deleted statement '${id}'`,
    };
  }

  if (type === "operation_call") {
    const allStatements = [
      ...ctx.operation.value.parameters,
      ...ctx.operation.value.statements,
    ];
    for (const stmt of allStatements) {
      const opIndex = stmt.operations?.findIndex((op) => op.id === id) ?? -1;
      if (opIndex !== -1) {
        stmt.operations!.splice(opIndex, 1);
        return {
          success: true,
          data: { id, deleted: true },
          message: `Deleted operation call '${id}'`,
        };
      }
    }
    return { success: false, error: `Operation call '${id}' not found` };
  }

  return { success: false, error: `Unknown entity type: ${type}` };
}

export const deleteEntityTool: Tool = {
  name: "delete_entity",
  description:
    "Delete a statement, parameter, or operation call by ID.",
  parameters: DeleteEntitySchema,
  execute,
};
