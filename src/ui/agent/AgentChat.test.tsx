import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isAgentProposalStale: vi.fn(() => false),
  projectState: {
    currentProjectId: "project-a",
    getCurrentProject: vi.fn(() => ({
      id: "project-a",
      files: [
        { id: "anchor-file", name: "anchorOperation", type: "operation" },
        { id: "selected-file", name: "selectedOperation", type: "operation" },
      ],
    })),
  },
  agentState: {
    agentProjects: {
      "project-a": {
        activeThreadId: "thread-a",
        threads: [
          {
            id: "thread-a",
            messages: [
              {
                id: "message-a",
                role: "assistant",
                content: "Review this",
                executionFeedback: {
                  status: "succeeded",
                  resultType: { kind: "string" },
                  resultPreview: "done",
                  errors: [],
                  truncated: true,
                },
                deploymentAction: "open-deployment-panel",
                proposal: {
                  id: "proposal-a",
                  diagnostics: [],
                  review: {
                    operationName: "anchorOperation",
                    parameters: { before: 0, after: 0 },
                    statements: { before: 0, after: 1 },
                    operationCalls: { before: 0, after: 0 },
                    returnType: { before: "undefined", after: "string" },
                    generatedSyntax: "valid",
                  },
                },
              },
            ],
          },
        ],
      },
    },
    activeRun: undefined,
    pendingProposals: {
      "thread-a": {
        id: "proposal-a",
        fileId: "anchor-file",
      },
    },
  },
}));

vi.mock("@/lib/store", () => ({
  useProjectStore: (selector: (state: typeof mocks.projectState) => unknown) =>
    selector(mocks.projectState),
  useAgentStore: () => mocks.agentState,
}));
vi.mock("@/lib/agent/proposal", () => ({
  isAgentProposalStale: mocks.isAgentProposalStale,
}));

import { AgentChat } from "./AgentChat";

beforeAll(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
});

afterAll(() => vi.unstubAllGlobals());

describe("AgentChat proposal navigation", () => {
  it("keeps an anchored proposal recoverable when another file is selected", () => {
    render(
      <MantineProvider>
        <AgentChat
          onApplyProposal={vi.fn()}
          onRejectProposal={vi.fn()}
          onReviseProposal={vi.fn()}
          onRegenerateProposal={vi.fn()}
          onOpenDeploymentPanel={vi.fn()}
          historyBusy={false}
        />
      </MantineProvider>
    );

    expect(mocks.isAgentProposalStale).toHaveBeenCalled();
    expect(
      screen.getByRole("log", { name: "Agent conversation" })
    ).toBeDefined();
    expect(screen.getAllByRole("article").length).toBeGreaterThan(0);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Apply" }).hasAttribute("disabled")
    ).toBe(false);
  });

  it("shows bounded execution feedback distinctly", () => {
    render(
      <MantineProvider>
        <AgentChat
          onApplyProposal={vi.fn()}
          onRejectProposal={vi.fn()}
          onReviseProposal={vi.fn()}
          onRegenerateProposal={vi.fn()}
          onOpenDeploymentPanel={vi.fn()}
          historyBusy={false}
        />
      </MantineProvider>
    );

    expect(screen.getByLabelText("Execution succeeded")).toBeDefined();
    expect(screen.getByText("Result type: string")).toBeDefined();
    expect(screen.getByText("Feedback was truncated.")).toBeDefined();
  });

  it("shows a manual deployment action", () => {
    const onOpenDeploymentPanel = vi.fn();
    render(
      <MantineProvider>
        <AgentChat
          onApplyProposal={vi.fn()}
          onRejectProposal={vi.fn()}
          onReviseProposal={vi.fn()}
          onRegenerateProposal={vi.fn()}
          onOpenDeploymentPanel={onOpenDeploymentPanel}
          historyBusy={false}
        />
      </MantineProvider>
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Open Deployment panel" })
    );
    expect(onOpenDeploymentPanel).toHaveBeenCalledOnce();
  });
});
