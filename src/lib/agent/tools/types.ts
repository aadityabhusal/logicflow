import { z } from "zod";

export type ToolResult =
  | { success: true; data: unknown; message?: string }
  | { success: false; error: string };

export interface Tool<TInput extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  parameters: TInput;
  execute: (
    ctx: import("../entity-context").EntityContext,
    args: unknown
  ) => ToolResult | Promise<ToolResult>;
}
