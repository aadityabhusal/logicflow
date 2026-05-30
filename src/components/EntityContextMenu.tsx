import { useEffect, useState } from "react";
import { clamp, useClickOutside, useWindowEvent } from "@mantine/hooks";
import { ContextMenuItem } from "@/lib/types";

export function EntityContextMenu({
  items,
  position,
  onClose,
}: {
  items: ContextMenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
}) {
  const [clampedPos, setClampedPos] = useState(position);
  const menuRef = useClickOutside(onClose, ["mousedown"]);

  useWindowEvent("keydown", (e) => {
    if (e.key === "Escape") onClose();
  });

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    const x = clamp(position.x, 4, window.innerWidth - rect.width - 4);
    const y = clamp(position.y, 4, window.innerHeight - rect.height - 4);
    if (x !== position.x || y !== position.y) setClampedPos({ x, y });
  }, [position, menuRef]);

  return (
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-50 min-w-[140px] bg-editor border flex flex-col"
      style={{ left: clampedPos.x, top: clampedPos.y }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          role="menuitem"
          disabled={item.disabled}
          className={[
            "w-full text-left p-1 hover:bg-dropdown-hover focus:bg-dropdown-hover focus:outline-none",
            "disabled:text-disabled disabled:cursor-default",
            item.danger ? "text-error" : "",
          ].join(" ")}
          onClick={(e) => {
            e.stopPropagation();
            if (!item.disabled) {
              item.onClick();
              onClose();
            }
          }}
        >
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}
