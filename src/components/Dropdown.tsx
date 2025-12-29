import { Combobox, Tooltip, useCombobox } from "@mantine/core";
import { HTMLAttributes, ReactNode, useEffect, useMemo, useState } from "react";
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

export interface IDropdownTargetProps
  extends Omit<HTMLAttributes<HTMLElement>, "onChange" | "defaultValue"> {
  value?: string;
  onChange?: (value: string) => void;
}

export function Dropdown({
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
  items?: IDropdownItem[];
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
}) {
  const [, setSearchParams] = useSearchParams();
  const { highlightOperation, navigation, setUiConfig } = uiConfigStore();
  const result = useMemo(
    () =>
      operationResult
        ? resolveReference(operationResult, context)
        : data
        ? resolveReference(data, context)
        : undefined,
    [operationResult, data, context]
  );
  const forceDisplayBorder =
    highlightOperation && isDataOfType(data, "operation");
  const [isHovered, setHovered] = useState(false);
  const isFocused = navigation?.id === id;
  const [search, setSearch] = useState("");
  const combobox = useCombobox({
    loop: true,
    onDropdownClose: () => {
      handleSearch(options?.withSearch ? "" : value || "");
      combobox.resetSelectedOption();
      setUiConfig({ navigation: { id } });
    },
    onDropdownOpen: () => {
      if (options?.withSearch) combobox.focusSearchInput();
      setUiConfig({ navigation: { id, disable: true } });
    },
  });
  const { getCurrentProject } = useProjectStore();

  const dropdownOptions = useMemo(
    () =>
      items
        ?.filter(
          (option) =>
            search === value ||
            option.label?.toLowerCase().includes(search.toLowerCase().trim()) ||
            option.value.toLowerCase().includes(search.toLowerCase().trim())
        )
        ?.map((option) => (
          <Combobox.Option
            value={option.value}
            key={option.value}
            className={`flex items-center justify-between gap-4 data-combobox-selected:bg-dropdown-hover data-combobox-active:bg-dropdown-selected hover:bg-dropdown-hover`}
            active={option.value === value}
          >
            <span className="text-sm max-w-32 truncate">
              {option.label || option.value}
            </span>
            <Tooltip
              position="right"
              label={
                <span className="text-xs">
                  {option.variableType
                    ? getTypeSignature(option.variableType)
                    : null}
                </span>
              }
            >
              <span className="text-xs">{option.secondaryLabel}</span>
            </Tooltip>
          </Combobox.Option>
        )),
    [items, search, value]
  );

  function handleSearch(val: string) {
    if (!combobox.dropdownOpened) combobox.openDropdown();
    setSearch(val);
    setUiConfig({ result, skipExecution: context.skipExecution });
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
    if (!isFocused) return;
    if (combobox.targetRef.current instanceof HTMLInputElement) {
      combobox.targetRef.current.focus();
    } else {
      setUiConfig({ result, skipExecution: context.skipExecution });
    }

    const textInput = isTextInput(combobox.targetRef.current);
    if (textInput && textInput !== document.activeElement) {
      let caretPosition = 0;
      if (
        (navigation.direction === "right" && navigation.modifier) ||
        (navigation.direction === "left" && !navigation.modifier)
      ) {
        caretPosition = textInput.value.length;
      }
      textInput.setSelectionRange(caretPosition, caretPosition);
    }
  }, [
    isFocused,
    combobox.targetRef,
    navigation?.direction,
    navigation?.modifier,
    setUiConfig,
  ]);

  return (
    <Combobox
      onOptionSubmit={(optionValue) => {
        if (value !== optionValue) {
          items?.find((i) => i.value === optionValue)?.onClick?.();
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
            context.skipExecution ? "opacity-50 " : "",
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
                      result,
                      showPopup: true,
                      skipExecution: context.skipExecution,
                    });
                  }
                } else combobox?.openDropdown();
              },
              onFocus: () =>
                setUiConfig({
                  navigation: { id },
                  result,
                  showPopup: true,
                  skipExecution: context.skipExecution,
                }),
            })}
          </Combobox.EventsTarget>
          {isDataOfType(data, "reference") &&
            getCurrentProject()?.files.find(
              (f) => f.name === data.value.name
            ) && (
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
                title="Go to reference"
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
          {options?.withDropdownIcon && !!items?.length && (
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
              {dropdownOptions}
            </Combobox.Options>
          )}
        </Combobox.Dropdown>
      ) : null}
    </Combobox>
  );
}
