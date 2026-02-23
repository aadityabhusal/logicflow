import { streamText, tool, stepCountIs } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { AGENT_SYSTEM_PROMPT, buildContextPrompt } from "./prompts";
import {
  createEntityContext,
  serializeForLLM,
  type EntityContext,
} from "./entity-context";
import { allTools, type ToolResult } from "./tools";
import type { IData, OperationType } from "../types";

function getProviderModel(modelId: string, apiKey: string) {
  const [provider, ...modelParts] = modelId.split("/");
  const modelName = modelParts.join("/");
  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey })(modelName);
    case "anthropic":
      return createAnthropic({ apiKey })(modelName);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(modelName);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

export interface AgentResult {
  operation: IData<OperationType>;
  finalMessage: string;
}

export interface OnToolCallCallback {
  (toolCall: {
    id: string;
    toolName: string;
    args: Record<string, unknown>;
    status: "pending" | "running" | "complete" | "error";
    result?: unknown;
  }): void;
}

export async function runAgent({
  apiKey,
  model,
  operation,
  userPrompt,
  onToolCall,
  maxIterations = 25,
}: {
  operation: IData<OperationType>;
  userPrompt: string;
  model: string;
  apiKey: string;
  onToolCall?: OnToolCallCallback;
  maxIterations?: number;
}): Promise<AgentResult> {
  const ctx = createEntityContext(operation);
  const providerModel = getProviderModel(model, apiKey);
  const tools = allTools;
  const operationJson = serializeForLLM(ctx);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toolsForSDK: Record<string, any> = {};
  for (const t of tools) {
    toolsForSDK[t.name] = tool({
      description: t.description,
      inputSchema: t.parameters,
      execute: async (
        args: unknown,
        { toolCallId }: { toolCallId: string }
      ) => {
        onToolCall?.({
          id: toolCallId,
          toolName: t.name,
          args: args as Record<string, unknown>,
          status: "running",
        });

        try {
          const result = await t.execute(ctx, args);
          onToolCall?.({
            id: toolCallId,
            toolName: t.name,
            args: args as Record<string, unknown>,
            status: result.success ? "complete" : "error",
            result,
          });
          return result;
        } catch (error) {
          const errorResult: ToolResult = {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          };
          onToolCall?.({
            id: toolCallId,
            toolName: t.name,
            args: args as Record<string, unknown>,
            status: "error",
            result: errorResult,
          });
          return errorResult;
        }
      },
    });
  }

  const result = streamText({
    model: providerModel,
    system: AGENT_SYSTEM_PROMPT,
    prompt: buildContextPrompt(operationJson, userPrompt),
    stopWhen: stepCountIs(maxIterations),
    tools: toolsForSDK,
  });

  const text = await result.text;

  return {
    operation: ctx.operation,
    finalMessage: text || "Task completed.",
  };
}

export { createEntityContext };
export type { EntityContext };
