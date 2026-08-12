import { Output, stepCountIs, streamText, tool, zodSchema } from "ai";
import type { IData, OperationType, Project } from "../types";
import {
  AgentDiscoveryError,
  AgentOperationLookupSchema,
  createAgentDiscovery,
} from "./discovery";
import {
  AgentOperationUpdateSchema,
  createAgentProposal,
  isAgentProposalStale,
  type AgentProposal,
} from "./proposal";
import { LOGICFLOW_SYSTEM_PROMPT, buildContextPrompt } from "./prompts";
import { createProviderModel, toAgentTransportError } from "./transport";
import type { AgentProvider, AgentThinkingLevel } from "./types";

const AGENT_STEP_TIMEOUT = 60_000;
const MAX_GENERATION_STEPS = 2;

function isInvalidStructuredOutput(error: unknown) {
  if (
    !error ||
    typeof error !== "object" ||
    !("name" in error) ||
    error.name !== "AI_NoObjectGeneratedError" ||
    !("cause" in error)
  )
    return false;
  const cause = error.cause;
  return (
    !!cause &&
    typeof cause === "object" &&
    "name" in cause &&
    ["AI_TypeValidationError", "AI_JSONParseError"].includes(String(cause.name))
  );
}

function getStructuredOutputFeedback(error: unknown) {
  const seen = new Set<object>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const value = current as {
      name?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    if (value.name === "ZodError" && typeof value.message === "string") {
      try {
        const issues = JSON.parse(value.message);
        if (Array.isArray(issues) && issues.length > 0)
          return issues
            .slice(0, 5)
            .map((issue) => {
              const path =
                issue && typeof issue === "object" && "path" in issue
                  ? Array.isArray(issue.path)
                    ? issue.path.join(".")
                    : "response"
                  : "response";
              const message =
                issue && typeof issue === "object" && "message" in issue
                  ? String(issue.message)
                  : "Invalid value";
              return `- ${path || "response"}: ${message}`;
            })
            .join("\n");
      } catch {
        return value.message;
      }
    }
    current = value.cause;
  }
  return "- The previous response did not match the required schema.";
}

function needsTargetRepair(proposal: AgentProposal) {
  return proposal.diagnostics.some(({ code }) =>
    ["invalid_statement_target", "invalid_anchor"].includes(code),
  );
}

function getTargetRepairFeedback(proposal: AgentProposal) {
  const diagnostics = proposal.diagnostics
    .filter(({ code }) =>
      ["invalid_statement_target", "invalid_anchor"].includes(code),
    )
    .map(({ message }) => `- ${message}`)
    .join("\n");
  return `The previous update matched the schema but used an invalid statement target or anchor. Repair it by returning a complete fresh update. Existing action targets and anchors must use only IDs from statementTargets. Nested callback, data, operation-call, operation-type, and inserted-payload IDs are not valid targets.\n${diagnostics}`;
}

export function getExplicitDeploymentIntent(prompt: string) {
  if (
    /\b(?:avoid|do not|don't|never|not to)\s+(?:ever\s+)?deploy\b/i.test(prompt)
  )
    return;
  if (
    /\bdeploy\b[\s\S]{0,50}\b(?:only\s+)?(?:after|when|if)\s+i\b/i.test(prompt)
  )
    return;
  if (
    !/(?:^|[.!?]\s+)(?:please\s+)?deploy\b/i.test(prompt.trim()) &&
    !/\bi\s+(?:want|need|would like)\s+(?:you\s+)?to\s+deploy\b/i.test(
      prompt
    ) &&
    !/^\s*(?:please\s+)?(?:fix|update|change|build|create|implement|add|remove|rename)\b[\s\S]*\band\s+deploy\b/i.test(
      prompt
    ) &&
    !/\b(?:start|run|create|perform)\s+(?:a\s+)?deployment\b/i.test(prompt)
  )
    return;
  return {
    afterChanges:
      /^\s*(?:please\s+)?(?:fix|update|change|build|create|implement|add|remove|rename)\b[\s\S]*\band\s+deploy\b/i.test(
        prompt
      ),
  };
}

function resolveProviderModel(model: string, apiKey: string) {
  const [provider, ...modelParts] = model.split("/");
  if (!("openai anthropic".split(" ") as string[]).includes(provider)) {
    throw new Error(`Unknown provider: ${provider}`);
  }
  return createProviderModel(
    provider as AgentProvider,
    modelParts.join("/"),
    apiKey
  );
}

function getThinkingProviderOptions(
  provider: AgentProvider,
  thinkingLevel: AgentThinkingLevel
): NonNullable<Parameters<typeof streamText>[0]["providerOptions"]> {
  if (provider === "openai") {
    return {
      openai: {
        reasoningEffort: thinkingLevel,
        strictJsonSchema: false,
      },
    };
  }
  return {
    anthropic: {
      thinking: { type: "adaptive" },
      effort: thinkingLevel,
    },
  };
}

export async function generateOperationProposal({
  apiKey,
  model,
  operation,
  project,
  userPrompt,
  initialProposal,
  thinkingLevel = "medium",
  abortSignal,
  onPartialExplanation,
}: {
  operation: IData<OperationType>;
  project: Project;
  userPrompt: string;
  model: string;
  apiKey: string;
  thinkingLevel?: AgentThinkingLevel;
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

  const discovery = await createAgentDiscovery(project, operation.id);
  const contextSnapshot = discovery.buildContextSnapshot();
  let lookupUsed = false;
  const tools = {
    lookup_operations: tool({
      description:
        "Look up exact operation descriptors only when required information is absent from the context. Submit all queries in this one read-only call, including operations needed inside callbacks or predicates.",
      inputSchema: AgentOperationLookupSchema,
      execute: async (input) => {
        if (lookupUsed) {
          return {
            error: {
              code: "lookup_limit_reached",
              message: "Only one batched operation lookup is allowed",
            },
          };
        }
        lookupUsed = true;
        try {
          return await discovery.lookupOperations(input);
        } catch (error) {
          if (error instanceof AgentDiscoveryError) {
            return { error: { code: error.code, message: error.message } };
          }
          throw error;
        }
      },
    }),
  };
  try {
    const provider = model.split("/")[0] as AgentProvider;
    const prompt = buildContextPrompt(
      userPrompt,
      contextSnapshot,
      initialProposal?.update
    );
    const generate = async (feedback?: string) => {
      let streamError: unknown;
      lookupUsed = false;
      try {
        const result = streamText({
          model: resolveProviderModel(model, apiKey),
          providerOptions: getThinkingProviderOptions(provider, thinkingLevel),
          output: Output.object({
            schema: zodSchema(AgentOperationUpdateSchema, {
              useReferences: true,
            }),
          }),
          tools,
          stopWhen: stepCountIs(MAX_GENERATION_STEPS),
          prepareStep: ({ instructions }) =>
            lookupUsed
              ? {
                  activeTools: [],
                  toolChoice: "none" as const,
                  instructions: `${instructions}\n\nThe one allowed lookup is complete. Return the final structured update now without calling another tool.`,
                }
              : undefined,
          system: LOGICFLOW_SYSTEM_PROMPT,
          prompt: feedback ? `${prompt}\n\n${feedback}` : prompt,
          abortSignal,
          timeout: { stepMs: AGENT_STEP_TIMEOUT },
          maxRetries: 0,
          onError: ({ error }) => {
            streamError = error;
          },
        });
        for await (const partial of result.partialOutputStream) {
          if (partial.explanation) onPartialExplanation?.(partial.explanation);
        }
        return await result.output;
      } catch (error) {
        throw streamError ?? error;
      }
    };
    const generateWithSchemaRetry = async (feedback?: string) => {
      try {
        return await generate(feedback);
      } catch (error) {
        if (!isInvalidStructuredOutput(error)) throw error;
        return await generate(
          `${feedback ? `${feedback}\n\n` : ""}The previous response did not match the required schema. Validation details:\n${getStructuredOutputFeedback(error)}\nReturn only a complete schema-valid AgentOperationUpdate.`,
        );
      }
    };
    let response = await generateWithSchemaRetry();
    if (!response.changes.length && !response.enablePackages.length)
      return { response, proposal: undefined };
    let proposal = await createAgentProposal({
      project,
      fileId: operation.id,
      sourcePrompt: userPrompt,
      update: response,
    });
    if (needsTargetRepair(proposal)) {
      response = await generateWithSchemaRetry(
        getTargetRepairFeedback(proposal),
      );
      if (!response.changes.length && !response.enablePackages.length)
        return { response, proposal: undefined };
      proposal = await createAgentProposal({
        project,
        fileId: operation.id,
        sourcePrompt: userPrompt,
        update: response,
      });
    }
    return { response, proposal };
  } catch (error) {
    throw toAgentTransportError(error);
  }
}
