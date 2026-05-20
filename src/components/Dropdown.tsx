import { Combobox, Tooltip, useCombobox } from "@mantine/core";
import {
  memo,
  ReactNode,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { BaseInput } from "./Input/BaseInput";
import { IconButton } from "../ui/IconButton";
import {
  FaCircleChevronDown,
  FaCirclePlus,
  FaCircleXmark,
  FaObjectUngroup,
  FaSquareArrowUpRight,
} from "react-icons/fa6";
import {
  useProjectStore,
  useNavigationStore,
  useUiConfigStore,
} from "../lib/store";
import { getHotkeyHandler, HotkeyItem, useHotkeys } from "@mantine/hooks";
import {
  IData,
  IDropdownItem,
  IDropdownTargetProps,
  OperationType,
} from "../lib/types";
import { useSearchParams } from "react-router";
import {
  createOperationFromFile,
  createFileFromOperation,
  createFileVariables,
  createVariableName,
  createStatement,
  createParamData,
  createData,
  getFreeVariableNames,
  getTypeSignature,
  handleSearchParams,
  isDataOfType,
  isTextInput,
  resolveReference,
  fuzzySearch,
  getCacheKey,
} from "../lib/utils";
import { getNextIdAfterDelete, getOperationEntities } from "@/lib/navigation";
import { Context } from "@/lib/execution/types";
import { useExecutionResultsStore } from "@/lib/execution/store";
import { createOperationCall } from "@/lib/execution/execution";
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
  handleChange,
  children,
  options,
  isInputTarget,
  target,
  context,
  operation,
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
}) => {
  const [, setSearchParams] = useSearchParams();
  const isFocused = useNavigationStore((s) => s.navigation?.id === id);

  const setNavigation = useNavigationStore((s) => s.setNavigation);
  const addFile = useProjectStore((s) => s.addFile);
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
  const isOperationFile = useProjectStore((s) => {
    if (!(isDataOfType(data, "reference") || operationResult)) return undefined;
    return s.getCurrentProject()?.files.find((f) => f.name === value);
  });
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

  const handleExtractToFile = async (data: IData<OperationType>) => {
    const newName = createVariableName({
      prefix: "operation",
      prev: useProjectStore.getState().getCurrentProject()?.files || [],
      indexOffset: 1,
    });

    const definedVars = [...getFreeVariableNames(data, context)]
      .map((name) => ({ name, variable: context.variables.get(name)! }))
      .filter((item) => !!item.variable);
    const fileParams = definedVars.map(({ name, variable }) => {
      const data = createParamData({ type: variable.data.type });
      return createStatement({ name, data });
    });
    const callArgs = definedVars.map(({ name, variable }) => {
      const data = createData({ value: { name, id: variable.data.id } });
      return createStatement({ name, data });
    });

    const file = createFileFromOperation(
      createData({
        type: fileParams.length > 0 ? undefined : data.type,
        value: {
          ...data.value,
          name: newName,
          parameters: [...fileParams, ...data.value.parameters],
        },
      })
    );
    addFile(file);

    const opRef = createData({ value: { name: newName, id: data.id } });
    if (fileParams.length === 0) {
      handleChange?.(opRef);
      return;
    }
    const newVariables = createFileVariables([file], context.variables);
    const callOp = await createOperationCall({
      data: opRef,
      name: "call",
      parameters: [...callArgs, ...data.value.parameters],
      context: { ...context, variables: newVariables },
      executePreview: false,
    });

    handleChange?.(
      createData({
        type: data.type,
        value: {
          parameters: data.value.parameters,
          statements: [createStatement({ data: opRef, operations: [callOp] })],
        },
      })
    );
  };

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
      offset={{ mainAxis: 0, alignmentAxis: -1 }}
      position="bottom-start"
    >
      <Combobox.DropdownTarget>
        <div
          className={[
            "flex items-start relative p-px",
            isFocused || isHovered ? "outline outline-border" : "",
            context.skipExecution && context.skipExecution.kind !== "error"
              ? "opacity-50 "
              : "",
            isDataOfType(result, "error") &&
            result.type.errorType !== "custom_error"
              ? "bg-error/25"
              : "",
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
              onFocus: () => setNavigation({ navigation: { id } }),
            })}
          </Combobox.EventsTarget>
          {(isDataOfType(data, "reference") || operationResult) &&
            isOperationFile && (
              <IconButton
                tabIndex={-1}
                size={10}
                className="absolute -top-1.5 right-3 text-white bg-border rounded-full z-10 p-0.5"
                icon={FaSquareArrowUpRight}
                onClick={() =>
                  setSearchParams(...handleSearchParams({ file: value }, true))
                }
                hidden={!isFocused && !isHovered}
                title="Go to operation"
              />
            )}
          {isDataOfType(data, "operation") && handleChange && (
            <IconButton
              tabIndex={-1}
              size={10}
              className="absolute -top-1.5 right-3 text-white bg-border rounded-full z-10 p-0.5"
              icon={FaObjectUngroup}
              onClick={() => handleExtractToFile(data)}
              hidden={!isFocused && !isHovered}
              title="Extract operation"
            />
          )}
          {handleDelete && (
            <IconButton
              tabIndex={-1}
              size={13}
              className="absolute -top-1.5 -right-0.5 text-border bg-white rounded-full z-10"
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
              className="absolute top-1.5 -right-2 text-border bg-white rounded-full z-10"
              icon={FaCirclePlus}
              onClick={() => {
                combobox?.closeDropdown();
                addOperationCall(result);
              }}
            />
          )}
          {options?.withDropdownIcon &&
            !!dropdownOptions?.flatMap(([, i]) => i).length && (
              <IconButton
                size={13}
                className="absolute -bottom-1.5 -right-0.5 text-border bg-white rounded-full z-10"
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
