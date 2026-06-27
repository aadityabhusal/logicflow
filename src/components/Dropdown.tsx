import { Combobox, Tooltip, useCombobox } from "@mantine/core";
import {
  memo,
  ReactNode,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { IconButton } from "../ui/IconButton";
import {
  FaCircleChevronDown,
  FaCirclePlus,
  FaCircleXmark,
} from "react-icons/fa6";
import {
  useProjectStore,
  useNavigationStore,
  useUiConfigStore,
  useContextMenuStore,
} from "../lib/store";
import { getHotkeyHandler, HotkeyItem, useHotkeys } from "@mantine/hooks";
import {
  IData,
  IDropdownItem,
  IDropdownTargetProps,
  OperationType,
} from "../lib/types";
import {
  createOperationFromFile,
  getTypeSignature,
  isDataOfType,
  isTextInput,
  resolveReference,
  fuzzySearch,
  getCacheKey,
  getEditableElement,
} from "../lib/utils";
import { getNextIdAfterDelete, getOperationEntities } from "@/lib/navigation";
import { Context } from "@/lib/execution/types";
import { useExecutionResultsStore } from "@/lib/execution/store";
import { resolveDisplayName } from "@/lib/packages/registry";

const MAX_DROPDOWN_ITEMS_PER_GROUP = 100;

const DropdownComponent = ({
  id,
  value,
  data,
  items,
  handleDelete,
  addOperationCall,
  canAddOperationCall,
  children,
  options,
  isInputTarget,
  target,
  context,
  operation,
  onContextMenu,
}: {
  id: string;
  data?: IData;
  value?: string;
  items?:
    | [string, IDropdownItem[]][]
    | ((search: string) => [string, IDropdownItem[]][]);
  handleDelete?: () => void;
  addOperationCall?: (data?: IData) => void;
  canAddOperationCall?: (data?: IData) => boolean;
  handleChange?: (data: IData) => void;
  children?: ReactNode;
  options?: {
    withSearch?: boolean;
    withDropdownIcon?: boolean;
    focusOnClick?: boolean;
  };
  isInputTarget?: boolean;
  target: (value: IDropdownTargetProps) => ReactNode;
  context: Context;
  operation?: IData<OperationType>;
  onContextMenu?: (e: React.MouseEvent) => void;
}) => {
  const isFocused = useNavigationStore((s) => s.navigation?.id === id);
  const isContextMenuHighlighted = useContextMenuStore(
    (s) => s.highlightedEntityId === id
  );

  const setNavigation = useNavigationStore((s) => s.setNavigation);
  const currentFileId = useProjectStore((s) => s.currentFileId);
  const detailsPanelLockedId = useUiConfigStore((s) => {
    const lockedId = currentFileId && s.sidebar.lockedIds?.[currentFileId];
    if (!lockedId) return undefined;
    const ctx = useExecutionResultsStore.getState().getContext(lockedId);
    if (
      !useExecutionResultsStore
        .getState()
        .results.has(getCacheKey(ctx, lockedId))
    ) {
      return undefined;
    }
    return lockedId;
  });
  const operationResult = useExecutionResultsStore(
    (s) => s.getResult(getCacheKey(context, id))?.data
  );
  const _result = useMemo(
    () =>
      operationResult
        ? resolveReference(operationResult, context)
        : data
          ? resolveReference(data, context)
          : undefined,
    [operationResult, data, context]
  );
  const result = useDeferredValue(_result);

  const [isHovered, setHovered] = useState(false);
  const [search, setSearch] = useState("");
  const wasFocusedAtPressStart = useRef<boolean>();

  const displayValue = useMemo(
    () => resolveDisplayName(value ?? "", context.packageAliases),
    [value, context.packageAliases]
  );
  const combobox = useCombobox({
    loop: true,
    onDropdownClose: () => {
      setSearch(options?.withSearch ? "" : (displayValue ?? ""));
      combobox.resetSelectedOption();
      setNavigation({ navigation: { id, disable: false } });
    },
    onDropdownOpen: () => {
      if (options?.withSearch) combobox.focusSearchInput();
      setNavigation({ navigation: { id, disable: hasOptions } });
    },
  });

  const activeSearch = displayValue === search ? "" : search.trim();

  const resolvedItems = useMemo(() => {
    if (typeof items !== "function") return items;
    return isFocused ? items(activeSearch) : undefined;
  }, [items, isFocused, activeSearch]);

  const dropdownOptions = useMemo(() => {
    return resolvedItems?.reduce(
      (acc, [groupName, groupItems]) => {
        const filteredItem = fuzzySearch(
          groupItems,
          activeSearch ? [{ label: activeSearch, value: activeSearch }] : []
        ).slice(0, MAX_DROPDOWN_ITEMS_PER_GROUP);
        if (filteredItem.length > 0) acc.push([groupName, filteredItem]);
        return acc;
      },
      [] as [string, IDropdownItem[]][]
    );
  }, [resolvedItems, activeSearch]);

  const hasOptions = !!dropdownOptions?.flatMap(([, i]) => i).length;

  const showAddOperationCall =
    !!addOperationCall &&
    (isFocused || isHovered) &&
    (!canAddOperationCall || canAddOperationCall(result));

  function handleSearch(val: string) {
    if (!combobox.dropdownOpened) combobox.openDropdown();
    setSearch(val);
  }

  function trackEditableFocus(target: EventTarget | null) {
    const editable = getEditableElement(target);
    wasFocusedAtPressStart.current = editable
      ? document.activeElement === editable
      : undefined;
  }

  function handleTargetContextMenu(e: React.MouseEvent<HTMLElement>) {
    if (wasFocusedAtPressStart.current) {
      e.stopPropagation();
      return;
    }
    onContextMenu?.(e);
  }

  // TODO: Fix this when creating single attachable dropdown component
  useHotkeys(
    isFocused
      ? [
          ...(["backspace", "alt+backspace"].map((key) => [
            key,
            (e) => {
              const textInput = isTextInput(combobox.targetRef.current);
              if (!handleDelete) return;
              if (
                textInput &&
                textInput.value.length > (isDataOfType(data, "number") ? 1 : 0)
              ) {
                return;
              }
              e.preventDefault();
              handleDelete();
              textInput?.blur();
              setNavigation((p) => {
                const operation = createOperationFromFile(
                  useProjectStore.getState().getCurrentFile()
                );
                if (!operation) return p;
                const newEntities = getOperationEntities(operation, context);
                const oldEntities = p.navigationEntities || [];
                return {
                  navigationEntities: newEntities,
                  navigation: {
                    id: getNextIdAfterDelete(newEntities, oldEntities, id),
                  },
                };
              });
            },
            { preventDefault: isInputTarget ? !search : false },
          ]) as HotkeyItem[]),
          ...(["alt+=", "alt+≠"].map((key) => [
            key,
            () => addOperationCall?.(result),
            { preventDefault: true },
          ]) as HotkeyItem[]),
        ]
      : [],
    []
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearch(options?.withSearch ? "" : displayValue);
  }, [displayValue, options?.withSearch]);

  useEffect(() => {
    combobox.selectFirstOption();
  }, [search]);

  useEffect(() => {
    if (combobox.dropdownOpened) combobox.selectActiveOption();
  }, [combobox.dropdownOpened]);

  useEffect(() => {
    if (combobox.dropdownOpened && isFocused) {
      setNavigation({ navigation: { id, disable: hasOptions } });
    }
  }, [hasOptions]);

  useEffect(() => {
    if (detailsPanelLockedId ? detailsPanelLockedId === id : isFocused) {
      setNavigation({
        result,
        skipExecution: context.skipExecution,
        operation,
      });
    }
  }, [
    detailsPanelLockedId,
    id,
    isFocused,
    result,
    setNavigation,
    context.skipExecution,
    operation,
  ]);

  useEffect(() => {
    if (!isFocused) return;
    if (combobox.targetRef.current instanceof HTMLInputElement) {
      combobox.targetRef.current.focus();
    }

    const textInput = isTextInput(combobox.targetRef.current);
    if (textInput && textInput !== document.activeElement) {
      let caretPosition = 0;
      const navigation = useNavigationStore.getState().navigation;
      if (
        (navigation?.direction === "right" && navigation.modifier) ||
        (navigation?.direction === "left" && !navigation.modifier)
      ) {
        caretPosition = textInput.value.length;
      }
      textInput.setSelectionRange(caretPosition, caretPosition);
    }
  }, [isFocused, combobox.targetRef, data?.type.kind]);

  useEffect(() => {
    if (!isFocused && combobox.dropdownOpened) {
      combobox.closeDropdown();
    }
  }, [isFocused, combobox]);

  return (
    <Combobox
      onOptionSubmit={(optionValue) => {
        if (value !== optionValue) {
          resolvedItems
            ?.flatMap(([, groupItems]) => groupItems)
            .find((item) => item.value === optionValue)
            ?.onClick?.();
          handleSearch("");
        }
        combobox.closeDropdown();
      }}
      store={combobox}
      keepMounted={false}
      offset={{ mainAxis: 1, alignmentAxis: -1 }}
      position="bottom-start"
    >
      <Combobox.DropdownTarget>
        <div
          className={[
            "flex items-start relative p-px",
            isFocused || combobox.dropdownOpened
              ? "editor-focus"
              : isHovered
                ? "editor-hover"
                : "",
            isContextMenuHighlighted ? "editor-focus" : "",
            context.skipExecution && context.skipExecution.kind !== "error"
              ? "opacity-50 "
              : "",
            isDataOfType(result, "error") &&
            result.type.errorType !== "custom_error"
              ? "bg-error/25"
              : "",
          ].join(" ")}
          onContextMenu={children ? undefined : onContextMenu}
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
            withKeyboardNavigation={combobox.dropdownOpened && hasOptions}
          >
            {target({
              ...(isInputTarget
                ? {
                    value: search,
                    onChange: (val) => handleSearch(val),
                    onBlur: () => combobox?.closeDropdown(),
                    onKeyDown: getHotkeyHandler([
                      ["ctrl+space", () => combobox.openDropdown()],
                    ]),
                    options: { allowDisableKeyboard: true },
                  }
                : {}),
              onClick: (e) => {
                e.stopPropagation();
                if (options?.focusOnClick) {
                  if (e.target === e.currentTarget) {
                    setNavigation({ navigation: { id } });
                  }
                } else combobox?.openDropdown();
              },
              onPointerDownCapture: (e) => trackEditableFocus(e.target),
              onTouchStartCapture: (e) => trackEditableFocus(e.target),
              onContextMenu: handleTargetContextMenu,
              onFocus: () => setNavigation({ navigation: { id } }),
            })}
          </Combobox.EventsTarget>
          {handleDelete && (
            <IconButton
              tabIndex={-1}
              size={13}
              className="editor-affordance absolute -top-1.5 -right-0.5 z-10"
              icon={FaCircleXmark}
              onClick={() => {
                combobox?.closeDropdown();
                handleDelete();
              }}
              hidden={!isFocused && !isHovered}
              title="Delete"
            />
          )}
          {showAddOperationCall && (
            <IconButton
              size={13}
              title="Add operation call"
              className="editor-affordance absolute top-1.5 -right-2 z-10"
              icon={FaCirclePlus}
              onClick={() => {
                combobox?.closeDropdown();
                addOperationCall(result);
              }}
            />
          )}
          {options?.withDropdownIcon && (
            <IconButton
              size={13}
              className="editor-affordance absolute -bottom-1.5 -right-0.5 z-10"
              icon={FaCircleChevronDown}
              onClick={(e) => {
                e.stopPropagation();
                setNavigation({ navigation: { id } });
                combobox?.openDropdown();
              }}
              title="Open dropdown"
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
                ? " bg-dropdown-default border border-border rounded-sm overflow-hidden"
                : ""),
          }}
        >
          {options?.withSearch ? (
            <Combobox.Search
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search..."
              classNames={{ input: "min-w-full p-1" }}
            />
          ) : null}
          {dropdownOptions?.length === 0 ? null : (
            <Combobox.Options className="overflow-y-auto max-h-32 dropdown-scrollbar">
              {dropdownOptions?.map(([groupName, groupItems]) => (
                <Combobox.Group
                  key={groupName}
                  label={groupName}
                  classNames={{
                    groupLabel:
                      "text-[11px] text-gray-400 bg-dropdown-default p-0.5",
                  }}
                >
                  {groupItems.map((option) => (
                    <Tooltip
                      position="right"
                      key={option.value}
                      classNames={{ tooltip: !option.type ? "hidden" : "" }}
                      label={
                        <span className="text-xs">
                          {option.type
                            ? getTypeSignature(option.type, context)
                            : null}
                        </span>
                      }
                    >
                      <Combobox.Option
                        value={option.value}
                        key={option.value}
                        className={`flex items-center justify-between gap-4 p-0.5 data-combobox-selected:bg-dropdown-hover data-combobox-active:bg-dropdown-selected hover:bg-dropdown-hover`}
                        active={option.value === value}
                      >
                        <span>{option.label || option.value}</span>
                        <span className="text-sm text-disabled">
                          {option.secondaryLabel}
                        </span>
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
