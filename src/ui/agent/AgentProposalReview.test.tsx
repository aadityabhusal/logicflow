import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AgentMessage } from "@/lib/agent/types";
import { AgentProposalReview } from "./AgentProposalReview";

const proposal: NonNullable<AgentMessage["proposal"]> = {
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
  recoverable?: boolean;
  proposal?: NonNullable<AgentMessage["proposal"]>;
  diagnosticFileNames?: (string | undefined)[];
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
        proposal={overrides?.proposal ?? proposal}
        active={overrides?.active ?? true}
        stale={overrides?.stale ?? false}
        busy={overrides?.busy ?? false}
        recoverable={overrides?.recoverable ?? true}
        diagnosticFileNames={overrides?.diagnosticFileNames}
        {...actions}
      />
    </MantineProvider>
  );
  return actions;
}

describe("AgentProposalReview", () => {
  it("renders legacy single-operation reviews and enables Apply", () => {
    const actions = renderReview();

    expect(screen.getByText("formatMessage")).toBeDefined();
    expect(screen.getByText("undefined to string")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(actions.onApply).toHaveBeenCalledOnce();
  });

  it("renders multi-file and supported package changes without IDs", () => {
    renderReview({
      proposal: {
        id: "proposal-2",
        diagnostics: [
          {
            code: "invalid_call",
            severity: "warning",
            message: "Check the updated call",
            repairable: true,
            fileId: "private-file-id",
          },
          {
            code: "package_warning",
            severity: "warning",
            message: "Review package usage",
            repairable: true,
            packageName: "wretch",
          },
        ],
        review: {
          ...proposal.review!,
          files: [
            {
              change: "create",
              operationName: "newFormatter",
              parameters: { before: 0, after: 1 },
              statements: { before: 0, after: 1 },
              operationCalls: { before: 0, after: 0 },
              returnType: { before: "undefined", after: "string" },
              generatedSyntax: "valid",
            },
            {
              change: "update",
              operationName: "formatMessage",
              parameters: { before: 0, after: 1 },
              statements: { before: 1, after: 2 },
              operationCalls: { before: 0, after: 1 },
              returnType: { before: "string", after: "string" },
              generatedSyntax: "valid",
            },
            {
              change: "delete",
              operationName: "oldFormatter",
              parameters: { before: 1, after: 0 },
              statements: { before: 2, after: 0 },
              operationCalls: { before: 1, after: 0 },
              returnType: { before: "string", after: "undefined" },
            },
          ],
          packages: { enabled: ["wretch"], disabled: ["date-fns"] },
        },
      },
      diagnosticFileNames: ["formatMessage", undefined],
    });

    expect(
      screen.getByRole("heading", { name: "Affected operations" })
    ).toBeDefined();
    expect(screen.getByText("create newFormatter")).toBeDefined();
    expect(screen.getByText("update formatMessage")).toBeDefined();
    expect(screen.getByText("delete oldFormatter")).toBeDefined();
    expect(screen.getByText("not applicable")).toBeDefined();
    expect(screen.getByText("wretch")).toBeDefined();
    expect(screen.getByText("date-fns")).toBeDefined();
    expect(screen.getByText(/Operation formatMessage:/)).toBeDefined();
    expect(screen.getByText(/Package wretch:/)).toBeDefined();
    expect(screen.queryByText(/private-file-id/)).toBeNull();
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

  it("disables Apply for stale proposals", () => {
    renderReview({ stale: true });
    expect(
      screen.getByRole("button", { name: "Apply" }).hasAttribute("disabled")
    ).toBe(true);
  });

  it("disables Apply but keeps Revise enabled when a diagnostic is repairable", () => {
    renderReview({
      proposal: {
        ...proposal,
        diagnostics: [
          {
            code: "invalid_operation",
            severity: "error",
            message: "The operation is invalid",
            repairable: true,
          },
        ],
      },
    });

    expect(
      screen.getByRole("button", { name: "Apply" }).hasAttribute("disabled")
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "Revise" }).hasAttribute("disabled")
    ).toBe(false);
  });

  it("disables Apply when the proposal anchor is not recoverable", () => {
    renderReview({ recoverable: false });

    expect(
      screen.getByRole("button", { name: "Apply" }).hasAttribute("disabled")
    ).toBe(true);
  });
});
