import { Output, stepCountIs, streamText, tool, zodSchema } from "ai";
import { z } from "zod";
import { DataTypeSchema } from "../schemas";
import type { IData, OperationType, Project } from "../types";
import { AgentDiscoveryError, createAgentDiscovery } from "./discovery";
import {
  createAgentProposal,
  OperationDraftSchema,
  type AgentProposal,
} from "./proposal";
import { LOGICFLOW_SYSTEM_PROMPT, buildContextPrompt } from "./prompts";
import { createProviderModel, toAgentTransportError } from "./transport";
import type { AgentProvider } from "./types";

const AGENT_REQUEST_TIMEOUT = 60_000;
const MAX_TOOL_CALLS = 24;

const AgentResponseSchema = z.object({
  explanation: z.string().nullable(),
});

export async function generateOperationProposal({
  apiKey,
  model,
  operation,
  project,
  userPrompt,
  abortSignal,
  onPartialExplanation,
}: {
  operation: IData<OperationType>;
  project: Project;
  userPrompt: string;
  model: string;
  apiKey: string;
  abortSignal?: AbortSignal;
  onPartialExplanation?: (explanation: string) => void;
}) {
  const discovery = await createAgentDiscovery(project, operation.id);
  let proposal: AgentProposal | undefined;
  let toolCalls = 0;
  const executeTool = async (action: () => unknown) => {
    toolCalls++;
    if (toolCalls > MAX_TOOL_CALLS) {
      return {
        error: {
          code: "tool_limit_reached",
          message: "Agent tool-call limit reached",
        },
      };
    }
    try {
      return await action();
    } catch (error) {
      if (error instanceof AgentDiscoveryError) {
        return { error: { code: error.code, message: error.message } };
      }
      throw error;
    }
  };
  const tools = {
    get_project_outline: tool({
      description: "Return compact current project and operation context",
      inputSchema: z.object({}),
      execute: () => executeTool(() => discovery.getProjectOutline()),
    }),
    inspect_operation: tool({
      description: "Inspect an operation using its scoped handle",
      inputSchema: z.object({ handle: z.string() }),
      execute: ({ handle }) =>
        executeTool(() => discovery.inspectOperation(handle)),
    }),
    search_operations: tool({
      description:
        "Search current core, enabled-package, and project operations",
      inputSchema: z.object({
        query: z.string().optional(),
        inputType: DataTypeSchema.optional(),
        resultType: DataTypeSchema.optional(),
        source: z.enum(["core", "package", "project"]).optional(),
        limit: z.number().int().positive().max(20).optional(),
      }),
      execute: ({ query, inputType, resultType, source, limit }) =>
        executeTool(() =>
          discovery.searchOperations({
            query,
            inputType,
            resultType,
            source,
            limit,
          })
        ),
    }),
    describe_operations: tool({
      description: "Return exact details for operation handles",
      inputSchema: z.object({
        handles: z.array(z.string()).min(1).max(20),
        inputType: DataTypeSchema.optional(),
      }),
      execute: ({ handles, inputType }) =>
        executeTool(() => discovery.describeOperations(handles, inputType)),
    }),
    search_packages: tool({
      description: "Search packages supported by the host catalog",
      inputSchema: z.object({
        query: z.string().optional(),
        limit: z.number().int().positive().max(20).optional(),
      }),
      execute: ({ query, limit }) =>
        executeTool(() => discovery.searchPackages(query, limit)),
    }),
    update_proposal: tool({
      description:
        "Replace the selected operation in the current reviewable proposal",
      inputSchema: OperationDraftSchema,
      execute: (draft) =>
        executeTool(async () => {
          proposal = await createAgentProposal({
            project,
            fileId: operation.id,
            draft,
            sourcePrompt: userPrompt,
            resolveOperation: (handle, inputType) =>
              discovery.resolveOperationHandle(handle, inputType),
          });
          return {
            proposalId: proposal.id,
            valid: !proposal.diagnostics.some(
              (diagnostic) => diagnostic.severity === "error"
            ),
            diagnostics: proposal.diagnostics,
            review: proposal.review,
          };
        }),
    }),
  };
  const [provider, ...modelParts] = model.split("/");
  if (!("openai anthropic google".split(" ") as string[]).includes(provider)) {
    throw new Error(`Unknown provider: ${provider}`);
  }
  try {
    const result = streamText({
      model: createProviderModel(
        provider as AgentProvider,
        modelParts.join("/"),
        apiKey
      ),
      output: Output.object({
        schema: zodSchema(AgentResponseSchema, { useReferences: true }),
      }),
      tools,
      stopWhen: stepCountIs(12),
      system: LOGICFLOW_SYSTEM_PROMPT,
      prompt: buildContextPrompt(userPrompt),
      abortSignal,
      timeout: AGENT_REQUEST_TIMEOUT,
      maxRetries: 0,
      onError: () => undefined,
    });
    for await (const partial of result.partialOutputStream) {
      if (partial.explanation) onPartialExplanation?.(partial.explanation);
    }
    return { response: await result.output, proposal };
  } catch (error) {
    throw toAgentTransportError(error);
  }
}
