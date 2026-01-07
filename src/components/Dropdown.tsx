import { Combobox, Tooltip, useCombobox } from "@mantine/core";
import {
  HTMLAttributes,
  memo,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { BaseInput } from "./Input/BaseInput";
import { IconButton } from "../ui/IconButton";
import {
  FaCircleChevronDown,
  FaCirclePlus,
  FaCircleXmark,
  FaSquareArrowUpRight,
} from "react-icons/fa6";
import { useProjectStore, uiConfigStore } from "../lib/store";
import { getHotkeyHandler, HotkeyItem, useHotkeys } from "@mantine/hooks";
import { Context, IData, IDropdownItem } from "../lib/types";
import { useSearchParams } from "react-router";
import {
  createOperationFromFile,
  getTypeSignature,
  handleSearchParams,
  isDataOfType,
  isTextInput,
  resolveReference,
} from "../lib/utils";
import { getNextIdAfterDelete, getOperationEntities } from "@/lib/navigation";
import isEqual from "react-fast-compare";

export interface IDropdownTargetProps
  extends Omit<HTMLAttributes<HTMLElement>, "onChange" | "defaultValue"> {
  value?: string;
  onChange?: (value: string) => void;
}

function useDeepCompareMemoize<T>(value: T): T {
  const ref = useRef<T | undefined>(undefined);
  // eslint-disable-next-line react-hooks/refs
  if (!ref.current || !isEqual(ref.current, value)) ref.current = value;
  // eslint-disable-next-line react-hooks/refs
  return ref.current as T;
}

const DropdownComponent = ({
  id,
  value,
  data,
  operationResult,
  items,
  handleDelete,
  addOperationCall,
  children,
  options,
  hotkeys,
  isInputTarget,
  target,
  context,
}: {
  id: string;
  data?: IData;
  operationResult?: IData;
  value?: string;
  items?: [string, IDropdownItem[]][];
  handleDelete?: () => void;
  addOperationCall?: () => void;
  children?: ReactNode;
  options?: {
    withSearch?: boolean;
    withDropdownIcon?: boolean;
    focusOnClick?: boolean;
  };
  hotkeys?: HotkeyItem[];
  isInputTarget?: boolean;
  target: (value: IDropdownTargetProps) => ReactNode;
  context: Context;
}) => {
  const [, setSearchParams] = useSearchParams();
  const highlightOperation = uiConfigStore((s) => s.highlightOperation);
  const navigationId = uiConfigStore((s) => s.navigation?.id);
  const navigationDirection = uiConfigStore((s) => s.navigation?.direction);
  const navigationModifier = uiConfigStore((s) => s.navigation?.modifier);
  const showPopup = uiConfigStore((s) => s.showPopup);
  const setUiConfig = uiConfigStore((s) => s.setUiConfig);
  const currentProject = useProjectStore((s) => s.getCurrentProject());

  const _result = useMemo(
    () =>
      operationResult
        ? resolveReference(operationResult, context.variables)
        : data
        ? resolveReference(data, context.variables)
        : undefined,
    [operationResult, data, context.variables]
  );
  const result = useDeepCompareMemoize(_result);

  const forceDisplayBorder =
    highlightOperation && isDataOfType(data, "operation");
  const [isHovered, setHovered] = useState(false);
  const isFocused = navigationId === id;
  const [search, setSearch] = useState("");
  const combobox = useCombobox({
    loop: true,
    onDropdownClose: () => {
      handleSearch(options?.withSearch ? "" : value || "");
      combobox.resetSelectedOption();
    },
    onDropdownOpen: () => {
      if (options?.withSearch) combobox.focusSearchInput();
      setUiConfig({ navigation: { id, disable: true } });
    },
  });

  const dropdownOptions = useMemo(() => {
    return items?.reduce((acc, [groupName, groupItems]) => {
      const filteredItem = groupItems.filter((item) => {
        return (
          search === value ||
          item.label?.toLowerCase().includes(search.toLowerCase().trim()) ||
          item.value.toLowerCase().includes(search.toLowerCase().trim())
        );
      });
      if (filteredItem.length > 0) acc.push([groupName, filteredItem]);
      return acc;
    }, [] as [string, IDropdownItem[]][]);
  }, [items, search, value]);

  function handleSearch(val: string) {
    if (!combobox.dropdownOpened) combobox.openDropdown();
    setSearch(val);
  }

  useHotkeys(
    isFocused
      ? [
          ...(["backspace", "alt+backspace"].map((key) => [
            key,
            () => {
              const textInput = isTextInput(combobox.targetRef.current);
              if (!textInput || !handleDelete) return;
              if (
                textInput.value.length > (data?.type.kind === "number" ? 1 : 0)
              ) {
                return;
              }
              handleDelete();
              textInput?.blur();
              setUiConfig((p) => {
                const operation = createOperationFromFile(
                  useProjectStore.getState().getCurrentFile()
                );
                if (!operation) return p;
                const newEntities = getOperationEntities(operation, 0);
                const oldEntities = p.navigationEntities || [];
                return {
                  navigationEntities: newEntities,
                  navigation: {
                    id: getNextIdAfterDelete(newEntities, oldEntities, id),
                    context,
                  },
                };
              });
            },
            { preventDefault: isInputTarget ? !search : false },
          ]) as HotkeyItem[]),
          ...(["alt+=", "alt+≠"].map((key) => [
            key,
            () => addOperationCall?.(),
            { preventDefault: true },
          ]) as HotkeyItem[]),
        ]
      : [],
    []
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (value) setSearch(options?.withSearch ? "" : value);
  }, [value, options?.withSearch]);

  useEffect(() => {
    combobox.selectFirstOption();
  }, [search]);

  useEffect(() => {
    if (combobox.dropdownOpened) combobox.selectActiveOption();
  }, [combobox.dropdownOpened]);

  useEffect(() => {
    if (isFocused && result && showPopup) {
      setUiConfig({ result });
    }
  }, [isFocused, result, setUiConfig, showPopup]);

  useEffect(() => {
    if (!isFocused) return;
    if (combobox.targetRef.current instanceof HTMLInputElement) {
      combobox.targetRef.current.focus();
    }

    const textInput = isTextInput(combobox.targetRef.current);
    if (textInput && textInput !== document.activeElement) {
      let caretPosition = 0;
      if (
        (navigationDirection === "right" && navigationModifier) ||
        (navigationDirection === "left" && !navigationModifier)
      ) {
        caretPosition = textInput.value.length;
      }
      textInput.setSelectionRange(caretPosition, caretPosition);
    }
  }, [isFocused, combobox.targetRef, navigationDirection, navigationModifier]);

  return (
    <Combobox
      onOptionSubmit={(optionValue) => {
        if (value !== optionValue) {
          items
            ?.flatMap(([, groupItems]) => groupItems)
            .find((item) => item.value === optionValue)
            ?.onClick?.();
          handleSearch("");
        }
        combobox.closeDropdown();
      }}
      store={combobox}
      keepMounted={false}
      offset={{ mainAxis: 0, alignmentAxis: -1 }}
      position="bottom-start"
    >
      <Combobox.DropdownTarget>
        <div
          className={[
            "flex items-start relative p-px",
            forceDisplayBorder || isFocused || isHovered
              ? "outline outline-border"
              : "",
            context.skipExecution && context.skipExecution.kind !== "error"
              ? "opacity-50 "
              : "",
            result?.type.kind === "error" ? "bg-error/25" : "",
          ].join(" ")}
          onMouseOver={(e) => {
            e.stopPropagation();
            setHovered(true);
          }}
          onMouseOut={(e) => {
            e.stopPropagation();
            setHovered(false);
          }}
        >
          <Combobox.EventsTarget
            withKeyboardNavigation={combobox.dropdownOpened}
          >
            {target({
              ...(isInputTarget
                ? {
                    value: search,
                    onChange: (val) => handleSearch(val),
                    onBlur: () => combobox?.closeDropdown(),
                    onKeyDown: getHotkeyHandler([
                      ["ctrl+space", () => combobox.openDropdown()],
                      ...(hotkeys ?? []),
                    ]),
                  }
                : {}),
              onClick: (e) => {
                e.stopPropagation();
                if (options?.focusOnClick) {
                  if (e.target === e.currentTarget) {
                    setUiConfig({
                      navigation: { id },
                      showPopup: true,
                      skipExecution: context.skipExecution,
                    });
                  }
                } else combobox?.openDropdown();
              },
              onFocus: () =>
                setUiConfig({
                  navigation: { id },
                  showPopup: true,
                  skipExecution: context.skipExecution,
                }),
            })}
          </Combobox.EventsTarget>
          {isDataOfType(data, "reference") &&
            currentProject?.files.find((f) => f.name === data.value.name) && (
              <IconButton
                tabIndex={-1}
                size={8}
                className="absolute -top-1.5 right-2.5 text-white bg-border rounded-full z-10 p-0.5"
                icon={FaSquareArrowUpRight}
                onClick={() =>
                  setSearchParams(
                    ...handleSearchParams({ file: data.value.name }, true)
                  )
                }
                hidden={!isFocused && !isHovered}
                title="Go to operation file"
              />
            )}
          {handleDelete && (
            <IconButton
              tabIndex={-1}
              size={12}
              className="absolute -top-1.5 -right-1 text-border bg-white rounded-full z-10"
              icon={FaCircleXmark}
              onClick={() => {
                combobox?.closeDropdown();
                handleDelete();
              }}
              hidden={!isFocused && !isHovered}
              title="Delete"
            />
          )}
          {addOperationCall && (
            <IconButton
              size={12}
              title="Add operation call"
              className="absolute top-1.5 -right-2 text-border bg-white rounded-full z-10"
              icon={FaCirclePlus}
              onClick={() => {
                combobox?.closeDropdown();
                addOperationCall();
              }}
              hidden={!isFocused && !isHovered}
            />
          )}
          {options?.withDropdownIcon &&
            !!dropdownOptions?.flatMap(([, i]) => i).length && (
              <IconButton
                size={12}
                className="absolute -bottom-1.5 -right-1 text-border bg-white rounded-full z-10"
                icon={FaCircleChevronDown}
                onClick={() => {
                  combobox?.openDropdown();
                }}
                hidden={!isFocused && !isHovered}
              />
            )}
          {children}
        </div>
      </Combobox.DropdownTarget>
      {isFocused ? (
        <Combobox.Dropdown
          classNames={{
            dropdown:
              "absolute min-w-max" +
              (!!dropdownOptions?.length || options?.withSearch
                ? " bg-editor border"
                : ""),
          }}
        >
          {options?.withSearch ? (
            <Combobox.Search
              component={BaseInput}
              value={search}
              onChange={(value) => handleSearch(value as unknown as string)}
              placeholder="Search..."
              classNames={{ input: "min-w-full" }}
            />
          ) : null}
          {dropdownOptions?.length === 0 ? null : (
            <Combobox.Options className="overflow-y-auto max-h-32 dropdown-scrollbar">
              {dropdownOptions?.map(([groupName, groupItems]) => (
                <Combobox.Group
                  key={groupName}
                  label={groupName}
                  classNames={{
                    groupLabel: "text-[11px] bg-dropdown-scrollbar",
                  }}
                >
                  {groupItems.map((option) => (
                    <Tooltip
                      position="right"
                      key={option.value}
                      classNames={{ tooltip: !option.type ? "hidden" : "" }}
                      label={
                        <span className="text-xs">
                          {option.type ? getTypeSignature(option.type) : null}
                        </span>
                      }
                    >
                      <Combobox.Option
                        value={option.value}
                        key={option.value}
                        className={`flex items-center justify-between gap-4 data-combobox-selected:bg-dropdown-hover data-combobox-active:bg-dropdown-selected hover:bg-dropdown-hover`}
                        active={option.value === value}
                      >
                        <span className="text-sm max-w-32 truncate">
                          {option.label || option.value}
                        </span>
                        <span className="text-xs">{option.secondaryLabel}</span>
                      </Combobox.Option>
                    </Tooltip>
                  ))}
                </Combobox.Group>
              ))}
            </Combobox.Options>
          )}
        </Combobox.Dropdown>
      ) : null}
    </Combobox>
  );
};

export const Dropdown = memo(DropdownComponent);
