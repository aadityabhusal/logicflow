export type { ToolResult, Tool } from "./types";

export { getEntitiesTool } from "./get-entities";
export { getOperationsTool } from "./get-operations";
export { createStatementTool } from "./create-statement";
export { createOperationCallTool } from "./create-operation-call";
export { updateDataTool } from "./update-data";
export { deleteEntityTool } from "./delete-entity";

import { getEntitiesTool } from "./get-entities";
import { getOperationsTool } from "./get-operations";
import { createStatementTool } from "./create-statement";
import { createOperationCallTool } from "./create-operation-call";
import { updateDataTool } from "./update-data";
import { deleteEntityTool } from "./delete-entity";
import type { Tool } from "./types";

export const allTools: Tool[] = [
  getEntitiesTool,
  getOperationsTool,
  createStatementTool,
  createOperationCallTool,
  updateDataTool,
  deleteEntityTool,
];
