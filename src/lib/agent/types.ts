import type {
  AgentDiagnostic,
  AgentHistoryState,
  AgentProposalReview,
} from "./proposal";

export type AgentProvider = "openai" | "anthropic" | "google";

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
