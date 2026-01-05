import { IconButton } from "../ui/IconButton";
import { FaPlus } from "react-icons/fa6";
import { IStatement, OperationType } from "../lib/types";
import { createData, createStatement } from "../lib/utils";
import { ComponentPropsWithoutRef, memo } from "react";
import { uiConfigStore } from "@/lib/store";

const AddStatementComponent = ({
  id,
  onSelect,
  iconProps,
  className,
  config,
}: {
  id: string;
  onSelect: (statement: IStatement) => void;
  iconProps?: Partial<ComponentPropsWithoutRef<typeof IconButton>>;
  className?: string;
  config?: Partial<OperationType["parameters"][number]>;
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
          const data = createData({ type: config?.type });
          setUiConfig({ navigation: { id: data.id } });
          onSelect(createStatement({ data, ...config }));
        }}
        {...iconProps}
      />
    </div>
  );
};

export const AddStatement = memo(AddStatementComponent);
