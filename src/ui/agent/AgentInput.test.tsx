import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  apiKey: "",
  draft: "Keep this draft",
  setDraft: vi.fn(),
  setSelectedModel: vi.fn(),
  setThinkingLevel: vi.fn(),
  smallScreen: false,
}));

vi.mock("@mantine/hooks", async () => ({
  ...(await vi.importActual<typeof import("@mantine/hooks")>("@mantine/hooks")),
  useMediaQuery: () => mocks.smallScreen,
}));

vi.mock("@/lib/store", () => ({
  useProjectStore: (
    selector: (state: { currentProjectId: string }) => unknown,
  ) => selector({ currentProjectId: "project-a" }),
  useAgentStore: (
    selector: (state: {
      selectedModel: string;
      thinkingLevel: "medium";
      getApiKey: () => string;
      setSelectedModel: typeof mocks.setSelectedModel;
      setThinkingLevel: typeof mocks.setThinkingLevel;
      setDraft: typeof mocks.setDraft;
      agentProjects: Record<string, unknown>;
    }) => unknown,
  ) =>
    selector({
      selectedModel: "gpt-5.6-sol",
      thinkingLevel: "medium",
      getApiKey: () => mocks.apiKey,
      setSelectedModel: mocks.setSelectedModel,
      setThinkingLevel: mocks.setThinkingLevel,
      setDraft: mocks.setDraft,
      agentProjects: {
        "project-a": {
          activeThreadId: "thread-a",
          threads: [{ id: "thread-a", draft: mocks.draft }],
        },
      },
    }),
}));

import { AgentInput } from "./AgentInput";

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
    })),
  );
});

afterAll(() => vi.unstubAllGlobals());

function renderInput({
  isLoading = false,
  historyBusy = false,
  onSubmit = vi.fn(),
}: {
  isLoading?: boolean;
  historyBusy?: boolean;
  onSubmit?: (prompt: string) => void;
} = {}) {
  return {
    onSubmit,
    ...render(
      <MantineProvider>
        <AgentInput
          onSubmit={onSubmit}
          onCancel={vi.fn()}
          isLoading={isLoading}
          historyBusy={historyBusy}
        />
      </MantineProvider>,
    ),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.apiKey = "";
  mocks.draft = "Keep this draft";
  mocks.smallScreen = false;
});

describe("AgentInput accessibility", () => {
  it("preserves the draft when Enter is pressed without an API key", () => {
    const { onSubmit } = renderInput();
    const input = screen.getByRole("textbox", { name: "Message the agent" });

    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(mocks.setDraft).not.toHaveBeenCalledWith("thread-a", "");
    expect(input).toHaveProperty("value", "Keep this draft");
    expect(
      screen.getByRole("button", { name: "Send" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.getByText(/Add an API key for .* to send messages/),
    ).toBeDefined();
  });

  it("submits with Enter on desktop when the selected model has a key", () => {
    mocks.apiKey = "key";
    const { onSubmit } = renderInput();

    fireEvent.keyDown(
      screen.getByRole("textbox", { name: "Message the agent" }),
      { key: "Enter" },
    );

    expect(onSubmit).toHaveBeenCalledWith("Keep this draft");
    expect(mocks.setDraft).not.toHaveBeenCalledWith("thread-a", "");
    expect(
      screen.getByRole("button", { name: "Send" }).hasAttribute("disabled"),
    ).toBe(false);
  });

  it("keeps keyboard guidance in the input placeholder instead of the footer", () => {
    mocks.apiKey = "key";
    renderInput();

    expect(
      screen.getByPlaceholderText(
        "Ask anything... (Enter to send; Shift + Enter for a new line)",
      ),
    ).toBeDefined();
    expect(
      screen.queryByText("Enter to send | Shift + Enter for a new line"),
    ).toBeNull();
  });

  it("offers current models and thinking levels", async () => {
    mocks.apiKey = "key";
    renderInput();

    fireEvent.click(screen.getByRole("button", { name: "Model: GPT-5.6 Sol" }));
    expect(await screen.findByText("Claude Opus 5")).toBeDefined();
    expect(screen.queryByText(/Gemini/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Model: GPT-5.6 Sol" }));
    fireEvent.click(screen.getByRole("button", { name: "Thinking: Medium" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "XHigh" }));
    expect(mocks.setThinkingLevel).toHaveBeenCalledWith("xhigh");
  });

  it("uses Enter for new lines on mobile and Ctrl+Enter to submit", () => {
    mocks.apiKey = "key";
    mocks.smallScreen = true;
    const { onSubmit } = renderInput();
    const input = screen.getByRole("textbox", { name: "Message the agent" });

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
    expect(onSubmit).toHaveBeenCalledWith("Keep this draft");
  });

  it("does not submit while an input method is composing text", () => {
    mocks.apiKey = "key";
    const { onSubmit } = renderInput();

    fireEvent.keyDown(
      screen.getByRole("textbox", { name: "Message the agent" }),
      { key: "Enter", isComposing: true },
    );

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("keeps the composer usable without showing a cancel action during history saves", () => {
    mocks.apiKey = "key";
    renderInput({ historyBusy: true });

    expect(screen.queryByRole("button", { name: "Cancel request" })).toBeNull();
    expect(screen.getByText("Saving changes...")).toBeDefined();
  });

  it("returns focus to the composer when a request finishes", () => {
    mocks.apiKey = "key";
    const onSubmit = vi.fn();
    const { rerender } = renderInput({ onSubmit });

    fireEvent.keyDown(
      screen.getByRole("textbox", { name: "Message the agent" }),
      { key: "Enter" },
    );

    rerender(
      <MantineProvider>
        <AgentInput onSubmit={onSubmit} onCancel={vi.fn()} isLoading />
      </MantineProvider>,
    );

    rerender(
      <MantineProvider>
        <AgentInput onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />
      </MantineProvider>,
    );

    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Message the agent" }),
    );
  });

  it("does not steal focus from another control when a request finishes", () => {
    mocks.apiKey = "key";
    const onSubmit = vi.fn();
    const { rerender } = renderInput({ onSubmit });
    fireEvent.keyDown(
      screen.getByRole("textbox", { name: "Message the agent" }),
      { key: "Enter" },
    );
    rerender(
      <MantineProvider>
        <AgentInput onSubmit={onSubmit} onCancel={vi.fn()} isLoading />
      </MantineProvider>,
    );
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();

    rerender(
      <MantineProvider>
        <AgentInput onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />
      </MantineProvider>,
    );

    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it("does not move focus from the model selector when a request finishes", () => {
    mocks.apiKey = "key";
    const onSubmit = vi.fn();
    const { rerender } = renderInput({ onSubmit });
    fireEvent.keyDown(
      screen.getByRole("textbox", { name: "Message the agent" }),
      { key: "Enter" },
    );
    rerender(
      <MantineProvider>
        <AgentInput onSubmit={onSubmit} onCancel={vi.fn()} isLoading />
      </MantineProvider>,
    );
    const modelSelector = screen.getByRole("button", {
      name: "Model: GPT-5.6 Sol",
    });
    modelSelector.focus();

    rerender(
      <MantineProvider>
        <AgentInput onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />
      </MantineProvider>,
    );

    expect(document.activeElement).toBe(modelSelector);
  });
});
