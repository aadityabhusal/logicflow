import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

type UiState = {
  sidebar: { width: number; height: number };
  setUiConfig: () => void;
};

const mocks = vi.hoisted(() => ({
  agentPanelLifecycle: { mounts: 0, unmounts: 0 },
  setUiConfig: vi.fn(),
}));

vi.hoisted(() => {
  vi.stubEnv("VITE_APP_ENABLE_AGENT_PANEL", "true");
});

vi.mock("@/lib/layout", () => ({
  getSidebarPanelLimits: () => ({
    minWidth: 200,
    maxWidth: 500,
    minHeight: 200,
    maxHeight: 500,
  }),
}));
vi.mock("@/lib/store", () => ({
  useUiConfigStore: (selector: (state: UiState) => unknown) =>
    selector({
      sidebar: { width: 300, height: 300 },
      setUiConfig: mocks.setUiConfig,
    }),
}));
vi.mock("@mantine/hooks", () => ({
  useMediaQuery: () => false,
  useViewportSize: () => ({ width: 1024, height: 768 }),
}));
vi.mock("./AgentPanel", () => ({
  AgentPanel: () => {
    useEffect(() => {
      mocks.agentPanelLifecycle.mounts += 1;
      return () => {
        mocks.agentPanelLifecycle.unmounts += 1;
      };
    }, []);
    return <div data-testid="agent-panel" />;
  },
}));
vi.mock("./DeploymentPanel", () => ({ Deployment: () => null }));
vi.mock("./DetailsPanel", () => ({ DetailsPanel: () => null }));
vi.mock("./LoadingFallback", () => ({ LoadingFallback: () => null }));
vi.mock("./OperationsList", () => ({
  OperationsList: () => <div data-testid="operations-panel" />,
}));
vi.mock("./Resizer", () => ({ Resizer: () => null }));
vi.mock("./SettingsPanel", () => ({ SettingsPanel: () => null }));

import { SidebarTabs } from "./SidebarTabs";

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

function renderSidebar(activeTab: string | undefined = "agent") {
  function Sidebar() {
    const [active, setActive] = useState<string | undefined>(activeTab);
    return <SidebarTabs activeTab={active} setActiveTab={setActive} />;
  }

  return render(
    <MantineProvider>
      <Sidebar />
    </MantineProvider>
  );
}

beforeEach(() => {
  mocks.agentPanelLifecycle.mounts = 0;
  mocks.agentPanelLifecycle.unmounts = 0;
});

describe("SidebarTabs agent panel lifecycle", () => {
  it("keeps the agent panel mounted while switching panels and collapsing the sidebar", async () => {
    renderSidebar();

    await screen.findByTestId("agent-panel");
    expect(mocks.agentPanelLifecycle.mounts).toBe(1);

    fireEvent.click(screen.getByRole("tab", { name: "Operations" }));
    await screen.findByTestId("operations-panel");
    expect(screen.getByTestId("agent-panel")).toBeDefined();
    expect(mocks.agentPanelLifecycle.unmounts).toBe(0);

    fireEvent.click(screen.getByRole("tab", { name: "Operations" }));
    expect(screen.getByTestId("agent-panel")).toBeDefined();
    expect(mocks.agentPanelLifecycle.unmounts).toBe(0);
  });
});
