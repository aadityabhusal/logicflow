import { handleNavigation } from "@/lib/navigation";
import {
  useProjectStore,
  useNavigationStore,
  useUiConfigStore,
} from "@/lib/store";
import { NavigationDirection, NavigationModifier } from "@/lib/types";
import { HotkeyItem } from "@mantine/hooks";

const SIDEBAR_TABS = [
  { value: "operations", key: "ctrl+shift+1" },
  { value: "details", key: "ctrl+shift+@" },
  { value: "code", key: "ctrl+shift+3" },
  ...(import.meta.env.VITE_APP_ENABLE_AGENT_PANEL
    ? [{ value: "agent", key: "ctrl+shift+4" }]
    : []),
] as const;

export function useCustomHotkeys(): HotkeyItem[] {
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);

  const navigation = useNavigationStore((state) =>
    state.navigation
      ? { id: state.navigation?.id, disable: state.navigation?.disable }
      : undefined
  );
  const setNavigation = useNavigationStore((state) => state.setNavigation);
  const entities = useNavigationStore((state) => state.navigationEntities);
  const setUiConfig = useUiConfigStore((s) => s.setUiConfig);

  const hotKeys: {
    key: string;
    direction: NavigationDirection;
    modifier?: NavigationModifier;
  }[] = [
    { key: "ArrowLeft", direction: "left" },
    { key: "ArrowLeft", direction: "left", modifier: "mod" },
    { key: "ArrowLeft", direction: "left", modifier: "alt" },
    { key: "ArrowRight", direction: "right" },
    { key: "ArrowRight", direction: "right", modifier: "mod" },
    { key: "ArrowRight", direction: "right", modifier: "alt" },
    { key: "ArrowUp", direction: "up" },
    { key: "ArrowUp", direction: "up", modifier: "mod" },
    { key: "ArrowUp", direction: "up", modifier: "alt" },
    { key: "ArrowDown", direction: "down" },
    { key: "ArrowDown", direction: "down", modifier: "mod" },
    { key: "ArrowDown", direction: "down", modifier: "alt" },
  ];

  return [
    ["mod+shift+z", () => redo()],
    ["mod+z", () => undo()],
    ["mod+y", () => redo()],
    ...(SIDEBAR_TABS.map(({ value, key }) => [
      key,
      () => {
        setUiConfig((s) => {
          const activeTab = s.sidebar?.activeTab === value ? undefined : value;
          return { sidebar: { ...s.sidebar, activeTab } };
        });
      },
      { preventDefault: true },
    ]) as HotkeyItem[]),
    ...(entities
      ? (hotKeys.map(({ modifier, direction, key }) => [
          (modifier ? `${modifier}+` : "") + key,
          (event) => {
            handleNavigation({
              event,
              direction,
              navigation,
              setNavigation,
              modifier,
              entities,
            });
          },
          { preventDefault: modifier === "mod" ? true : false },
        ]) as HotkeyItem[])
      : []),
  ];
}
