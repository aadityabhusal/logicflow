import { forwardRef, HTMLAttributes, memo, useMemo, useState } from "react";
import { UnionType, IData, DataType, Context } from "@/lib/types";
import {
  createData,
  createDefaultValue,
  isDataOfType,
  getTypeSignature,
  getUnionActiveType,
  isTypeCompatible,
  resolveUnionType,
  getContextExpectedTypes,
} from "@/lib/utils";
import { FaChevronDown, FaX } from "react-icons/fa6";
import { DataTypes } from "@/lib/data";
import { Menu, Tooltip } from "@mantine/core";
import { IconButton } from "@/ui/IconButton";
import { Data } from "../Data";
import { useNavigationStore } from "@/lib/store";

interface UnionInputProps extends HTMLAttributes<HTMLDivElement> {
  data: IData<UnionType>;
  handleData: (data: IData<UnionType>) => void;
  context: Context;
}

const UnionInputComponent = (
  { data, handleData, context, ...props }: UnionInputProps,
  ref: React.ForwardedRef<HTMLDivElement>
) => {
  const isIconFocused = useNavigationStore(
    (s) => s.navigation?.id === `${data.id}_options`
  );
  const setNavigation = useNavigationStore((s) => s.setNavigation);
  const [menuOpened, setMenuOpened] = useState(false);

  const activeType = useMemo(() => {
    const type = getUnionActiveType(data.type, data.value, context);
    const index = data.type.activeIndex ?? 0;
    return {
      data: createData({
        id: `${data.id}_data`,
        type: type,
        value: data.value,
      }),
      index: index,
    };
  }, [context, data.id, data.type, data.value]);

  function handleTypeAdd(newType: DataType) {
    const newTypes = [...data.type.types, newType];
    const newIndex = newTypes.length - 1;
    handleData({
      ...data,
      type: resolveUnionType(newTypes, true, newIndex),
      value: createDefaultValue(newType, { includeOptionalProperties: true }),
    });
  }

  function handleActiveTypeChange(newData: IData) {
    const updatedTypes = [...data.type.types];
    updatedTypes[activeType.index] = isDataOfType(newData, "reference")
      ? newData.type.dataType
      : newData.type;

    handleData({
      ...data,
      type: resolveUnionType(updatedTypes, true, activeType.index),
      value: newData.value,
    });
  }

  function handleTypeSwitch(index: number) {
    const defaultValue = createDefaultValue(data.type.types[index], {
      includeOptionalProperties: true,
    });
    handleData({
      ...data,
      type: { ...data.type, activeIndex: index },
      value: defaultValue,
    });
  }

  // Remove a type from the union
  function handleTypeRemove(index: number) {
    let newTypes = data.type.types.filter((_, i) => i !== index);
    if (newTypes.length === 0) newTypes = [{ kind: "undefined" }];

    // If removing the active type, switch to first type
    const wasActive = index === activeType.index;
    const newActiveIndex = wasActive
      ? Math.min(activeType.index, newTypes.length - 1)
      : index < activeType.index
      ? activeType.index - 1
      : activeType.index;

    const newValue = wasActive
      ? createDefaultValue(newTypes[newActiveIndex], {
          includeOptionalProperties: true,
        })
      : data.value;

    handleData({
      ...data,
      type: resolveUnionType(newTypes, true, newActiveIndex),
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
        disableDelete={!!context.expectedType}
        context={{
          ...context,
          ...getContextExpectedTypes({
            context,
            expectedType:
              context.expectedType?.kind === "union"
                ? context.expectedType.types[activeType.index]
                : undefined,
            enforceExpectedType: true,
          }),
        }}
      />
      <Menu
        width={200}
        position="bottom-start"
        withinPortal={false}
        opened={menuOpened}
        onChange={(opened) => {
          setNavigation(() => ({
            navigation: { id: `${data.id}_options`, disable: opened },
          }));
          setMenuOpened(opened);
        }}
      >
        <Menu.Target>
          <IconButton
            ref={(elem) => {
              if (isIconFocused) {
                if (menuOpened) elem?.blur();
                else elem?.focus();
              }
            }}
            icon={FaChevronDown}
            size={14}
            className={[
              "mt-1 hover:outline hover:outline-border",
              isIconFocused ? "outline outline-border" : "",
            ].join(" ")}
            title="Show union types"
          />
        </Menu.Target>
        <Menu.Dropdown onMouseOver={(e) => e.stopPropagation()}>
          {data.type.types.map((type, i) => {
            const typeSign = getTypeSignature(type);
            return (
              <Tooltip key={typeSign} label={typeSign} position="right">
                <Menu.Item
                  onClick={() => handleTypeSwitch(i)}
                  classNames={{
                    item: i === activeType.index ? "bg-dropdown-selected" : "",
                  }}
                  rightSection={
                    data.type.types.length > 1 && !context.expectedType ? (
                      <FaX
                        size={16}
                        className="p-1 hover:outline hover:outline-border"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTypeRemove(i);
                        }}
                      />
                    ) : null
                  }
                >
                  {type.kind}
                </Menu.Item>
              </Tooltip>
            );
          })}
          {!context.expectedType ? (
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
                      !["union", "operation"].includes(type) &&
                      // This is only for default types, if user updates a complex type, the default type options will be shown
                      !data.type.types.some((t) =>
                        isTypeCompatible(t, value.type)
                      )
                  )
                  .map(([name, { type }]) => (
                    <Tooltip
                      key={name}
                      label={getTypeSignature(type)}
                      position="right"
                    >
                      <Menu.Item onClick={() => handleTypeAdd(type)}>
                        {name}
                      </Menu.Item>
                    </Tooltip>
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
