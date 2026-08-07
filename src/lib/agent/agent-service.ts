import { Output, stepCountIs, streamText, tool, zodSchema } from "ai";
import { z } from "zod";
import { DataTypeSchema } from "../schemas";
import type { IData, OperationType, Project } from "../types";
import { AgentDiscoveryError, createAgentDiscovery } from "./discovery";
import {
  createAgentPackageProposal,
  createAgentProposal,
  deleteAgentOperationProposal,
  getAgentHistoryState,
  isAgentProposalStale,
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

const UpdateProposalSchema = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("create"), draft: OperationDraftSchema })
    .strict(),
  z
    .object({
      action: z.literal("replace"),
      operationHandle: z.string().min(1),
      draft: OperationDraftSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("delete"),
      operationHandle: z.string().min(1),
    })
    .strict(),
]);

const SetPackageEnabledSchema = z
  .object({ name: z.string().min(1), enabled: z.boolean() })
  .strict();

export async function generateOperationProposal({
  apiKey,
  model,
  operation,
  project,
  userPrompt,
  initialProposal,
  abortSignal,
  onPartialExplanation,
}: {
  operation: IData<OperationType>;
  project: Project;
  userPrompt: string;
  model: string;
  apiKey: string;
  initialProposal?: AgentProposal;
  abortSignal?: AbortSignal;
  onPartialExplanation?: (explanation: string) => void;
}) {
  if (initialProposal) {
    if (
      initialProposal.projectId !== project.id ||
      initialProposal.fileId !== operation.id
    ) {
      throw new Error(
        "Cannot revise proposal: it does not belong to this project and operation"
      );
    }
    if (isAgentProposalStale(initialProposal, project)) {
      throw new Error("Cannot revise proposal: proposal is stale");
    }
  }
  const initialHasErrors = initialProposal?.diagnostics.some(
    (diagnostic) => diagnostic.severity === "error"
  );
  const initialState = initialHasErrors
    ? initialProposal?.revisionState
    : (initialProposal?.proposedState ?? initialProposal?.revisionState);
  if (initialProposal && !initialState) {
    throw new Error("Cannot revise proposal: revision state is missing");
  }
  const discovery = await createAgentDiscovery(project, operation.id);
  let proposal = initialProposal;
  let proposedState = initialState ?? getAgentHistoryState(project);
  if (initialState) {
    await discovery.updateProposedState(initialState);
  }
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
      if (
        error instanceof Error &&
        error.message.startsWith("Unsupported package:")
      ) {
        return {
          error: { code: "unsupported_package", message: error.message },
        };
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
        "Create, replace, rename, or delete an operation in the progressive cross-file proposal",
      inputSchema: UpdateProposalSchema,
      execute: (input) =>
        executeTool(async () => {
          if (input.action === "create") {
            proposal = await createAgentProposal({
              project,
              anchorFileId: operation.id,
              previousState: proposedState,
              create: true,
              draft: input.draft,
              sourcePrompt: userPrompt,
              resolveOperation: (handle, inputType) =>
                discovery.resolveOperationHandle(handle, inputType),
            });
          } else {
            const target = discovery.resolveOperationHandle(
              input.operationHandle
            );
            if (target.source !== "project" || !target.fileId) {
              throw new AgentDiscoveryError(
                "unknown_handle",
                "Proposal targets must be project-operation handles"
              );
            }
            proposal =
              input.action === "delete"
                ? deleteAgentOperationProposal({
                    project,
                    anchorFileId: operation.id,
                    fileId: target.fileId,
                    previousState: proposedState,
                    sourcePrompt: userPrompt,
                  })
                : await createAgentProposal({
                    project,
                    anchorFileId: operation.id,
                    fileId: target.fileId,
                    previousState: proposedState,
                    draft: input.draft,
                    sourcePrompt: userPrompt,
                    resolveOperation: (handle, inputType) =>
                      discovery.resolveOperationHandle(handle, inputType),
                  });
          }
          const valid = !proposal.diagnostics.some(
            (diagnostic) => diagnostic.severity === "error"
          );
          proposal.revisionState =
            valid && proposal.proposedState
              ? proposal.proposedState
              : proposedState;
          if (valid && proposal.proposedState) {
            proposedState = proposal.proposedState;
            await discovery.updateProposedState(proposedState);
          }
          return {
            proposalId: proposal.id,
            valid,
            diagnostics: proposal.diagnostics,
            review: proposal.review,
          };
        }),
    }),
    set_package_enabled: tool({
      description:
        "Idempotently enable or disable one supported package in the proposal",
      inputSchema: SetPackageEnabledSchema,
      execute: ({ name, enabled }) =>
        executeTool(async () => {
          const candidate = createAgentPackageProposal({
            project,
            anchorFileId: operation.id,
            previousState: proposedState,
            sourcePrompt: userPrompt,
            name,
            enabled,
          });
          const valid = !candidate.diagnostics.some(
            (diagnostic) => diagnostic.severity === "error"
          );
          candidate.revisionState =
            valid && candidate.proposedState
              ? candidate.proposedState
              : proposedState;
          if (valid && candidate.proposedState) {
            await discovery.updateProposedState(candidate.proposedState);
            proposedState = candidate.proposedState;
          }
          proposal = candidate;
          return {
            proposalId: candidate.id,
            valid,
            diagnostics: candidate.diagnostics,
            review: candidate.review,
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
