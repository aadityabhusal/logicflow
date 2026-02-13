import { Tabs, Tooltip } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { FaCircleInfo, FaRobot, FaFileCode } from "react-icons/fa6";
import { useUiConfigStore } from "../lib/store";
import { MAX_SCREEN_WIDTH } from "@/lib/data";
import { OperationsList } from "./OperationsList";
import { DetailsPanel } from "./DetailsPanel";
import { Resizer } from "./Resizer";
import { Context } from "@/lib/types";

const TABS = [
  { value: "operations", label: "Operations", Icon: FaFileCode },
  { value: "details", label: "Details", Icon: FaCircleInfo },
  { value: "agent", label: "Agent", Icon: FaRobot },
];
export function SidebarTabs({ context }: { context: Context }) {
  const smallScreen = useMediaQuery(`(max-width: ${MAX_SCREEN_WIDTH}px)`);
  const { sidebar, setUiConfig } = useUiConfigStore((s) => ({
    sidebar: s.sidebar,
    setUiConfig: s.setUiConfig,
  }));

  const activeTab = sidebar.activeTab;
  const panelWidth = activeTab ? sidebar.width || 300 : 0;
  const panelHeight = activeTab ? sidebar.height || 300 : 0;

  const handleTabChange = (value: string | null) => {
    setUiConfig((s) => ({
      sidebar: {
        ...(s.sidebar || {}),
        activeTab:
          value === s.sidebar?.activeTab ? undefined : value ?? undefined,
      },
    }));
  };

  return (
    <div
      className={`relative flex flex-col-reverse md:flex-row bg-editor`}
      style={{
        width: smallScreen ? "100%" : activeTab ? panelWidth : 48,
        height: smallScreen ? (activeTab ? panelHeight : 48) : "100%",
      }}
    >
      <Tabs
        value={activeTab}
        onChange={handleTabChange}
        orientation={smallScreen ? "horizontal" : "vertical"}
        className="flex relative flex-1 h-full min-h-0 min-w-0"
        style={{
          flexDirection: smallScreen ? "column-reverse" : "row",
        }}
        classNames={{
          root: "bg-editor",
          list: [smallScreen ? "border-t" : "border-r"].join(" "),
        }}
      >
        <Tabs.List
          className={["flex", smallScreen ? "flex-row" : "flex-col"].join(" ")}
        >
          {TABS.map((tab) => (
            <Tooltip
              key={tab.value}
              label={tab.label}
              position={smallScreen ? "top" : "right"}
            >
              <Tabs.Tab
                value={tab.value}
                leftSection={<tab.Icon size={24} />}
                title={tab.label}
                classNames={{
                  tab: [
                    "flex gap-1 items-center justify-center p-0 w-full text-sm outline-none hover:bg-dropdown-hover",
                    activeTab ? "data-active:bg-dropdown-selected" : "",
                  ].join(" "),
                  tabSection: smallScreen ? "p-2" : "p-3",
                }}
              >
                {smallScreen ? tab.label : ""}
              </Tabs.Tab>
            </Tooltip>
          ))}
        </Tabs.List>
        {!activeTab ? null : (
          <div className="overflow-hidden relative flex-1">
            <Tabs.Panel value="operations" className="h-full w-full">
              <OperationsList context={context} />
            </Tabs.Panel>
            <Tabs.Panel value="details" className="h-full w-full">
              <DetailsPanel />
            </Tabs.Panel>
          </div>
        )}
      </Tabs>

      {!activeTab ? null : !smallScreen ? (
        <Resizer
          type="width"
          direction="positive"
          minSize={200}
          maxSize={window.innerWidth / 2}
          setPanelSize={(size) =>
            setUiConfig((p) => ({
              sidebar: { ...(p.sidebar ?? {}), width: size.width },
            }))
          }
          className="absolute top-0 right-0 z-10"
        />
      ) : (
        <Resizer
          type="height"
          direction="negative"
          minSize={150}
          maxSize={window.innerHeight * 0.75}
          setPanelSize={(size) =>
            setUiConfig((p) => ({
              sidebar: { ...(p.sidebar ?? {}), height: size.height },
            }))
          }
          className="absolute top-0 left-0 z-10"
        />
      )}
    </div>
  );
}
