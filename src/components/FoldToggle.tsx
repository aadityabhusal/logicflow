import { memo } from "react";
import { FaCaretDown, FaCaretRight } from "react-icons/fa6";
import { useNavigationStore, useUiConfigStore } from "@/lib/store";
import { IconButton } from "@/ui/IconButton";

const FoldToggleComponent = ({ id }: { id: string }) => {
  const isFolded = useUiConfigStore((s) => !!s.foldedEntities?.[id]);
  const isFocused = useNavigationStore(
    (s) => s.navigation?.id === `${id}_fold` && !s.navigation.disable
  );
  const setNavigation = useNavigationStore((s) => s.setNavigation);
  const Icon = isFolded ? FaCaretRight : FaCaretDown;
  const label = isFolded ? "Expand" : "Collapse";

  return (
    <IconButton
      tabIndex={-1}
      ref={(elem) => isFocused && elem?.focus()}
      className={[
        "mt-0.5 editor-inline-control shrink-0",
        isFocused ? "outline outline-border" : "",
      ].join(" ")}
      icon={Icon}
      title={label}
      aria-label={label}
      onFocus={() => setNavigation({ navigation: { id: `${id}_fold` } })}
      onClick={(e) => {
        e.stopPropagation();
        useUiConfigStore.getState().setUiConfig(({ foldedEntities }) => ({
          foldedEntities: { ...foldedEntities, [id]: !foldedEntities?.[id] },
        }));
      }}
    />
  );
};

export const FoldToggle = memo(FoldToggleComponent);
