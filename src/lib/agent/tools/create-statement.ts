import type { ToolResult, Tool } from "./types";
import { CreateStatementSchema } from "./schemas";
import type { EntityContext } from "../entity-context";
import { generateId } from "../entity-context";
import type { IStatement, IData, OperationType } from "../../types";

interface CreateStatementInput {
  name: string | null;
  isParameter: boolean;
  isOptional: boolean | null;
  data: IData;
  operations: IData<OperationType>[];
  position: "start" | "end";
}

function execute(ctx: EntityContext, args: unknown): ToolResult {
  const parsed = CreateStatementSchema.safeParse(args);
  if (!parsed.success) {
    return { success: false, error: `Invalid arguments: ${parsed.error.message}` };
  }

  const input = parsed.data as CreateStatementInput;
  const { name, isParameter, isOptional, data, operations, position } = input;

  const id = generateId(ctx);
  data.id = generateId(ctx);

  const newStatement: IStatement = {
    id,
    name: name ?? undefined,
    isOptional: isOptional ?? undefined,
    data,
    operations: operations || [],
  };

  if (isParameter) {
    if (position === "start") {
      ctx.operation.value.parameters.unshift(newStatement);
    } else {
      ctx.operation.value.parameters.push(newStatement);
    }
    ctx.operation.type.parameters.push({
      name: name ?? undefined,
      type: data.type,
      isOptional: isOptional ?? undefined,
    });
  } else {
    if (position === "start") {
      ctx.operation.value.statements.unshift(newStatement);
    } else {
      ctx.operation.value.statements.push(newStatement);
    }
  }

  return {
    success: true,
    data: { id, type: isParameter ? "parameter" : "statement" },
    message: `Created ${isParameter ? "parameter" : "statement"} '${name ?? "unnamed"}'`,
  };
}

export const createStatementTool: Tool = {
  name: "create_statement",
  description:
    "Create a new statement or parameter. Set isParameter=true for parameters. The data and operations should follow the IData structure exactly.",
  parameters: CreateStatementSchema,
  execute,
};
