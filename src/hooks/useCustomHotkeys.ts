import { handleNavigation } from "@/lib/navigation";
import {
  useProjectStore,
  useNavigationStore,
  useContextMenuStore,
} from "@/lib/store";
import { NavigationDirection, NavigationModifier } from "@/lib/types";
import { HotkeyItem } from "@mantine/hooks";
import { Dispatch, SetStateAction } from "react";

const SIDEBAR_TABS = [
  { value: "operations", key: "ctrl+shift+1" },
  { value: "details", key: "ctrl+shift+@" },
  { value: "code", key: "ctrl+shift+3" },
  ...(import.meta.env.VITE_APP_ENABLE_AGENT_PANEL
    ? [{ value: "agent", key: "ctrl+shift+4" }]
    : []),
] as const;

export function useCustomHotkeys(
  setActiveTab: Dispatch<SetStateAction<string | undefined>>
): HotkeyItem[] {
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const contextMenuOpen = useContextMenuStore((s) => !!s.menu);

  const navigation = useNavigationStore((state) =>
    state.navigation
      ? { id: state.navigation?.id, disable: state.navigation?.disable }
      : undefined
  );
  const setNavigation = useNavigationStore((state) => state.setNavigation);
  const entities = useNavigationStore((state) => state.navigationEntities);

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
        setActiveTab((activeTab) => (activeTab === value ? undefined : value));
      },
      { preventDefault: true },
    ]) as HotkeyItem[]),
    ...(entities
      ? (hotKeys.map(({ modifier, direction, key }) => [
          (modifier ? `${modifier}+` : "") + key,
          (event) => {
            if (contextMenuOpen) return;
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
