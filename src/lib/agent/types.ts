import type {
  AgentDiagnostic,
  AgentHistoryState,
  AgentProposalReview,
} from "./proposal";

export type AgentProvider = "openai" | "anthropic" | "google";

export type AgentExecutionError = { type?: string; message: string };

export type AgentExecutionFeedback = {
  status: "succeeded" | "failed" | "cancelled" | "not_run";
  operationHandle?: string;
  resultType?: { kind: string };
  resultPreview?: unknown;
  errors: AgentExecutionError[];
  reason?: string;
  truncated: boolean;
};

export type AgentThread = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  draft: string;
  messages: AgentMessage[];
};

export type AgentMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  proposal?: {
    id: string;
    review?: AgentProposalReview;
    diagnostics: AgentDiagnostic[];
    applicationId?: string;
  };
  executionFeedback?: AgentExecutionFeedback;
  deploymentAction?: "open-deployment-panel";
  createdAt: number;
};

export type AgentProject = {
  projectId: string;
  activeThreadId: string;
  threads: AgentThread[];
  history?: ProjectAgentHistory;
};

export type AgentEditHistoryEntry = {
  id: string;
  projectId: string;
  threadId: string;
  sequence: number;
  createdAt: number;
  before: AgentHistoryState;
  after: AgentHistoryState;
  beforeSelectedFileId?: string;
  afterSelectedFileId?: string;
};

export type ProjectAgentHistory = {
  entries: AgentEditHistoryEntry[];
  cursor: number;
  lastSequence: number;
};
