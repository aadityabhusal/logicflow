import { forwardRef, HTMLAttributes, memo, useMemo, useState } from "react";
import { UnionType, IData, DataType, Context } from "../../lib/types";
import {
  createData,
  createDefaultValue,
  isDataOfType,
  getTypeSignature,
  inferTypeFromValue,
  isTypeCompatible,
  resolveUnionType,
} from "../../lib/utils";
import { FaChevronDown, FaX } from "react-icons/fa6";
import { DataTypes } from "@/lib/data";
import { Menu, Tooltip } from "@mantine/core";
import { IconButton } from "@/ui/IconButton";
import { Data } from "../Data";
import { uiConfigStore } from "@/lib/store";

export interface UnionInputProps extends HTMLAttributes<HTMLDivElement> {
  data: IData<UnionType>;
  handleData: (data: IData<UnionType>) => void;
  context: Context;
}

const UnionInputComponent = (
  { data, handleData, context, ...props }: UnionInputProps,
  ref: React.ForwardedRef<HTMLDivElement>
) => {
  const navigationId = uiConfigStore((s) => s.navigation?.id);
  const setUiConfig = uiConfigStore((s) => s.setUiConfig);
  const [menuOpened, setMenuOpened] = useState(false);
  const isFocused = navigationId === `${data.id}_options`;

  const activeType = useMemo(() => {
    const type = inferTypeFromValue(data.value, context);
    const index = data.type.types.findIndex((t) => isTypeCompatible(type, t));
    return {
      data: createData({
        id: `${data.id}_data`,
        type: index === -1 ? data.type.types[0] : type,
        value: data.value,
        isTypeEditable: data.isTypeEditable,
      }),
      index: index === -1 ? 0 : index,
    };
  }, [context, data.id, data.isTypeEditable, data.type.types, data.value]);

  function handleTypeAdd(newType: DataType) {
    handleData({
      ...data,
      type: resolveUnionType([...data.type.types, newType], true),
      value: createDefaultValue(newType),
    });
  }

  function handleActiveTypeChange(newData: IData) {
    const updatedTypes = [...data.type.types];
    updatedTypes[activeType.index] = isDataOfType(newData, "reference")
      ? newData.type.dataType
      : newData.type;

    handleData({
      ...data,
      type: resolveUnionType(updatedTypes, true),
      value: newData.value,
    });
  }

  function handleTypeSwitch(index: number) {
    const defaultValue = createDefaultValue(data.type.types[index]);
    handleData({ ...data, value: defaultValue });
  }

  // Remove a type from the union
  function handleTypeRemove(index: number) {
    let newTypes = data.type.types.filter((_, i) => i !== index);
    if (newTypes.length === 0) newTypes = [{ kind: "undefined" }];

    // If removing the active type, switch to first type
    const wasActive = index === activeType.index;
    const newValue = wasActive ? createDefaultValue(newTypes[0]) : data.value;

    handleData({
      ...data,
      type: resolveUnionType(newTypes, true),
      value: newValue,
    });
  }

  return (
    <div
      {...props}
      ref={ref}
      className={["flex items-start gap-1", props?.className].join(" ")}
    >
      <Data
        data={activeType.data}
        handleChange={(newData, remove) =>
          remove
            ? handleTypeRemove(activeType.index)
            : handleActiveTypeChange(newData)
        }
        context={context}
      />
      <Menu
        width={200}
        position="bottom-start"
        withinPortal={false}
        classNames={{ dropdown: "absolute bg-editor border" }}
        opened={menuOpened}
        onChange={(opened) => {
          setUiConfig(() => ({
            navigation: { id: `${data.id}_options`, disable: opened },
          }));
          setMenuOpened(opened);
        }}
      >
        <Menu.Target>
          <IconButton
            ref={(elem) => {
              if (isFocused) {
                if (menuOpened) elem?.blur();
                else elem?.focus();
              }
            }}
            icon={FaChevronDown}
            size={14}
            className={[
              "mt-1 hover:outline hover:outline-border",
              isFocused ? "outline outline-border" : "",
            ].join(" ")}
            title="Show union types"
          />
        </Menu.Target>
        <Menu.Dropdown
          classNames={{ dropdown: "flex flex-col" }}
          onMouseOver={(e) => e.stopPropagation()}
        >
          {data.type.types.map((type, i) => (
            <Menu.Item
              key={i}
              onClick={() => handleTypeSwitch(i)}
              classNames={{
                item: [
                  "menu-item",
                  i === activeType.index ? "bg-dropdown-selected" : "",
                ].join(" "),
              }}
            >
              <Tooltip label={getTypeSignature(type)} position="right">
                <div className={"flex items-center gap-1 justify-between"}>
                  {type.kind}
                  {data.type.types.length > 1 ? (
                    <FaX
                      size={16}
                      className="p-1 hover:outline hover:outline-border"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTypeRemove(i);
                      }}
                    />
                  ) : null}
                </div>
              </Tooltip>
            </Menu.Item>
          ))}
          {data.isTypeEditable ? (
            <Menu.Sub>
              <Menu.Sub.Target>
                <Menu.Sub.Item
                  classNames={{
                    item: "flex items-center justify-between menu-item",
                    itemSection: "size-4 -rotate-90",
                  }}
                >
                  Add
                </Menu.Sub.Item>
              </Menu.Sub.Target>
              <Menu.Sub.Dropdown classNames={{ dropdown: "flex flex-col" }}>
                {Object.entries(DataTypes)
                  .filter(
                    ([type, value]) =>
                      !value.hideFromDropdown &&
                      !["union"].includes(type) &&
                      // This is only for default types, if user updates a complex type, the default type options will be shown
                      !data.type.types.some((t) =>
                        isTypeCompatible(t, value.type)
                      )
                  )
                  .map(([name, { type }]) => (
                    <Menu.Item
                      classNames={{ item: "text-left menu-item" }}
                      key={name}
                      onClick={() => handleTypeAdd(type)}
                    >
                      <Tooltip label={getTypeSignature(type)} position="right">
                        <span className="text-left">{name}</span>
                      </Tooltip>
                    </Menu.Item>
                  ))}
              </Menu.Sub.Dropdown>
            </Menu.Sub>
          ) : null}
        </Menu.Dropdown>
      </Menu>
    </div>
  );
};

export const UnionInput = memo(forwardRef(UnionInputComponent));
