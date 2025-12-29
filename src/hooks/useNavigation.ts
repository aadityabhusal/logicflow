import { getOperationEntities, handleNavigation } from "@/lib/navigation";
import { useProjectStore, uiConfigStore } from "@/lib/store";
import {
  IData,
  NavigationDirection,
  NavigationModifier,
  OperationType,
} from "@/lib/types";
import { HotkeyItem } from "@mantine/hooks";
import { useMemo } from "react";

export function useCustomHotkeys(
  currentOperation?: IData<OperationType>
): HotkeyItem[] {
  const { undo, redo } = useProjectStore();

  const { navigation, setUiConfig } = uiConfigStore();
  const entities = useMemo(
    () => currentOperation && getOperationEntities(currentOperation),
    [currentOperation]
  );

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
    ["meta+shift+z", () => redo()],
    ["meta+z", () => undo()],
    ["meta+y", () => redo()],
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
