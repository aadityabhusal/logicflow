import { ControlledMenu, MenuItem } from "@szhsin/react-menu";
import { ContextMenuItem } from "@/lib/types";

const FIRST_MENU_ITEM = { position: "first" } as const;

export function EntityContextMenu({
  items,
  position,
  onClose,
}: {
  items: ContextMenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
}) {
  return (
    <ControlledMenu
      state="open"
      anchorPoint={position}
      menuItemFocus={FIRST_MENU_ITEM}
      portal
      position="auto"
      onClose={onClose}
      className="z-50"
      menuClassName="m-0 list-none min-w-40 bg-editor border flex flex-col p-0"
    >
      {items.map((item) => (
        <MenuItem
          key={item.label}
          disabled={item.disabled}
          className={({ hover, disabled }) =>
            [
              "w-full text-left p-1 outline-none cursor-default",
              hover && !disabled ? "bg-dropdown-hover" : "",
              disabled ? "text-disabled" : "",
              item.danger ? "text-error" : "",
            ].join(" ")
          }
          onClick={(e) => {
            e.syntheticEvent.stopPropagation();
            item.onClick();
            onClose();
          }}
        >
          {item.label}
        </MenuItem>
      ))}
    </ControlledMenu>
  );
}
