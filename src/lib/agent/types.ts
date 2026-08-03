import { AgentChange } from "../schemas";

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
  changes?: AgentChange[];
  createdAt: number;
};

export type AgentProject = {
  projectId: string;
  activeThreadId: string;
  threads: AgentThread[];
};
