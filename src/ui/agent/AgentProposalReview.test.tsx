import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AgentProposalReview } from "./AgentProposalReview";

const proposal = {
  id: "proposal-1",
  diagnostics: [],
  review: {
    operationName: "formatMessage",
    parameters: { before: 0, after: 1 },
    statements: { before: 0, after: 2 },
    operationCalls: { before: 0, after: 1 },
    returnType: { before: "undefined", after: "string" },
    generatedSyntax: "valid" as const,
  },
};

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

function renderReview(overrides?: {
  active?: boolean;
  stale?: boolean;
  busy?: boolean;
}) {
  const actions = {
    onApply: vi.fn(),
    onReject: vi.fn(),
    onRevise: vi.fn(),
    onRegenerate: vi.fn(),
  };
  render(
    <MantineProvider>
      <AgentProposalReview
        proposal={proposal}
        active={overrides?.active ?? true}
        stale={overrides?.stale ?? false}
        busy={overrides?.busy ?? false}
        recoverable
        {...actions}
      />
    </MantineProvider>
  );
  return actions;
}

describe("AgentProposalReview", () => {
  it("shows semantic changes and enables Apply", () => {
    const actions = renderReview();

    expect(screen.getByText("formatMessage")).toBeDefined();
    expect(screen.getByText("undefined to string")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(actions.onApply).toHaveBeenCalledOnce();
  });

  it("supports reject, revise, and regenerate without applying", () => {
    const actions = renderReview();

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    fireEvent.click(screen.getByRole("button", { name: "Revise" }));
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));

    expect(actions.onReject).toHaveBeenCalledOnce();
    expect(actions.onRevise).toHaveBeenCalledOnce();
    expect(actions.onRegenerate).toHaveBeenCalledOnce();
  });

  it("shows an accessible stale warning", () => {
    renderReview({ stale: true });

    expect(screen.getByRole("alert").textContent).toContain("stale");
  });

  it("disables proposal actions during a run", () => {
    renderReview({ busy: true });

    for (const name of ["Reject", "Revise", "Regenerate", "Apply"]) {
      expect(
        screen.getByRole("button", { name }).hasAttribute("disabled")
      ).toBe(true);
    }
  });

  it("disables Apply for stale or invalid proposals", () => {
    renderReview({ stale: true });
    expect(
      screen.getByRole("button", { name: "Apply" }).hasAttribute("disabled")
    ).toBe(true);
  });
});
