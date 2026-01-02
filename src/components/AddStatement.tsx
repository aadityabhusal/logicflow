import { IconButton } from "../ui/IconButton";
import { FaPlus } from "react-icons/fa6";
import { Context, DataType, IStatement } from "../lib/types";
import { createData, createStatement } from "../lib/utils";
import { ComponentPropsWithoutRef, memo } from "react";
import { uiConfigStore } from "@/lib/store";

const AddStatementComponent = ({
  id,
  onSelect,
  iconProps,
  className,
  dataType,
}: {
  id: string;
  onSelect: (statement: IStatement) => void;
  iconProps?: Partial<ComponentPropsWithoutRef<typeof IconButton>>;
  context: Context;
  className?: string;
  dataType?: DataType;
}) => {
  const navigationId = uiConfigStore((s) => s.navigation?.id);
  const setUiConfig = uiConfigStore((s) => s.setUiConfig);
  const isFocused = navigationId === `${id}_add`;

  return (
    <div className="w-max">
      <IconButton
        icon={FaPlus}
        size={14}
        ref={(elem) => isFocused && elem?.focus()}
        className={[
          "mt-1 hover:outline hover:outline-border",
          isFocused ? "outline outline-border" : "",
          className || "",
        ].join(" ")}
        onClick={() => {
          const data = createData({ type: dataType });
          setUiConfig({ navigation: { id: data.id } });
          onSelect(createStatement({ data }));
        }}
        {...iconProps}
      />
    </div>
  );
};

export const AddStatement = memo(AddStatementComponent);
