import { handleNavigation } from "@/lib/navigation";
import { useProjectStore, uiConfigStore } from "@/lib/store";
import { NavigationDirection, NavigationModifier } from "@/lib/types";
import { HotkeyItem } from "@mantine/hooks";

export function useCustomHotkeys(): HotkeyItem[] {
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);

  const navigation = uiConfigStore((state) =>
    state.navigation
      ? { id: state.navigation?.id, disable: state.navigation?.disable }
      : undefined
  );
  const setUiConfig = uiConfigStore((state) => state.setUiConfig);
  const entities = uiConfigStore((state) => state.navigationEntities);

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
    ...(entities
      ? (hotKeys.map(({ modifier, direction, key }) => [
          (modifier ? `${modifier}+` : "") + key,
          (event) => {
            handleNavigation({
              event,
              direction,
              navigation,
              setUiConfig,
              modifier,
              entities,
            });
          },
          { preventDefault: modifier === "mod" ? true : false },
        ]) as HotkeyItem[])
      : []),
  ];
}
