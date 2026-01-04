import {
  FaArrowRightLong,
  FaArrowTurnUp,
  FaEquals,
  FaQuestion,
} from "react-icons/fa6";
import { Context, IData, IStatement, OperationType } from "../lib/types";
import {
  getStatementResult,
  createVariableName,
  applyTypeNarrowing,
} from "../lib/utils";
import {
  createOperationCall,
  getFilteredOperations,
  getSkipExecution,
} from "../lib/operation";
import { Data } from "./Data";
import { BaseInput } from "./Input/BaseInput";
import { OperationCall } from "./OperationCall";
import { IconButton } from "../ui/IconButton";
import { AddStatement } from "./AddStatement";
import { getHotkeyHandler, useDisclosure } from "@mantine/hooks";
import { Popover, useDelayedHover } from "@mantine/core";
import { DataTypes } from "../lib/data";
import { memo, useMemo, type ReactNode } from "react";
import { uiConfigStore } from "@/lib/store";
import { useCustomHotkeys } from "@/hooks/useNavigation";
import { ErrorBoundary } from "./ErrorBoundary";

const StatementComponent = ({
  statement,
  handleStatement,
  context,
  addStatement,
  options,
}: {
  statement: IStatement;
  handleStatement: (statement: IStatement, remove?: boolean) => void;
  addStatement?: (statement: IStatement, position: "before" | "after") => void;
  context: Context;
  options?: {
    enableVariable?: boolean;
    isOptional?: boolean;
    isParameter?: boolean;
    disableNameToggle?: boolean;
    disableDelete?: boolean;
  };
}) => {
  const hasName = statement.name !== undefined;
  const navigationId = uiConfigStore((state) => state.navigation?.id);
  const setUiConfig = uiConfigStore((state) => state.setUiConfig);
  const customHotKeys = useCustomHotkeys();
  const [hoverOpened, { open, close }] = useDisclosure(false);
  const { openDropdown, closeDropdown } = useDelayedHover({
    open,
    close,
    openDelay: 0,
    closeDelay: 150,
  });
  const PipeArrow =
    statement.operations.length > 1 ? FaArrowTurnUp : FaArrowRightLong;

  const isEqualsFocused = navigationId === `${statement.id}_equals`;
  const isNameFocused = navigationId === `${statement.id}_name`;

  const hoverEvents = useMemo(
    () => ({
      onMouseEnter: openDropdown,
      onFocus: openDropdown,
      onMouseLeave: closeDropdown,
      onBlur: closeDropdown,
    }),
    [openDropdown, closeDropdown]
  );

  // TODO: should context be passed as a parameter?
  function addOperationCall(data: IData, index: number) {
    const operation = createOperationCall({ data, context });
    const operations = [...statement.operations];
    operations.splice(index, 0, operation);
    handleStatement({ ...statement, operations });
    setUiConfig({ navigation: { id: operation.id, direction: "right" } });
  }

  function handleOperationCall(
    operation: IData<OperationType>,
    index: number,
    remove?: boolean
  ) {
    // eslint-disable-next-line prefer-const
    let operations = [...statement.operations];
    if (remove) operations.splice(index, 1);
    else operations[index] = operation;
    handleStatement({ ...statement, operations });
  }

  return (
    <div className="flex items-start gap-1">
      {options?.enableVariable ? (
        <div className="flex items-center gap-1 mr-1">
          {hasName ? (
            <BaseInput
              ref={(elem) => isNameFocused && elem?.focus()}
              value={statement.name || ""}
              className={[
                "text-variable",
                isNameFocused ? "outline outline-border" : "",
              ].join(" ")}
              onChange={(value) => {
                const name = value || statement.name || "";
                if (
                  Object.keys(DataTypes)
                    .concat(Array.from(context.reservedNames ?? []))
                    .includes(name)
                ) {
                  return;
                }
                handleStatement({ ...statement, name });
              }}
              onFocus={() =>
                setUiConfig(() => ({
                  navigation: { id: `${statement.id}_name` },
                }))
              }
              onKeyDown={getHotkeyHandler(customHotKeys)}
            />
          ) : null}
          <Popover
            opened={hoverOpened || navigationId === `${statement.id}_add`}
            offset={4}
            position="left"
            withinPortal={false}
          >
            <Popover.Target>
              <IconButton
                ref={(elem) => isEqualsFocused && elem?.focus()}
                icon={options?.isOptional ? FaQuestion : FaEquals}
                position="right"
                className={[
                  "hover:outline hover:outline-border",
                  options?.isOptional ? "self-center" : "self-end",
                  isEqualsFocused ? "outline outline-border" : "",
                ].join(" ")}
                disabled={options?.disableNameToggle}
                title={
                  options?.isOptional
                    ? "Make required"
                    : options?.isParameter
                    ? "Make optional"
                    : "Create variable"
                }
                onClick={() => {
                  if (options?.disableNameToggle) return;
                  handleStatement({
                    ...statement,
                    name: hasName
                      ? undefined
                      : createVariableName({
                          prefix: "var",
                          prev: Array.from(context.reservedNames ?? []),
                        }),
                  });
                  setUiConfig(() => ({
                    navigation: { id: `${statement.id}_name` },
                  }));
                }}
                {...hoverEvents}
              />
            </Popover.Target>
            <Popover.Dropdown
              classNames={{ dropdown: "absolute bg-inherit" }}
              {...hoverEvents}
            >
              <AddStatement
                id={statement.id}
                onSelect={(statement) => {
                  addStatement?.(statement, "before");
                  closeDropdown();
                }}
                iconProps={{ title: "Add before" }}
                className="bg-editor"
              />
            </Popover.Dropdown>
          </Popover>
        </div>
      ) : null}
      <div
        className={
          "flex items-start gap-0 " +
          (statement.operations.length > 1 ? "flex-col" : "flex-row")
        }
      >
        <ErrorBoundary
          displayError={true}
          onRemove={
            options?.disableDelete
              ? undefined
              : () => handleStatement(statement, true)
          }
        >
          <Data
            data={statement.data}
            disableDelete={options?.disableDelete}
            addOperationCall={
              !options?.isParameter &&
              !context.skipExecution &&
              getFilteredOperations(statement.data, context.variables).length
                ? () => addOperationCall(statement.data, 0)
                : undefined
            }
            context={context}
            handleChange={(data, remove) =>
              handleStatement({ ...statement, data }, remove)
            }
          />
        </ErrorBoundary>
        {
          statement.operations.reduce(
            (acc, operation, i, operationsList) => {
              const data = getStatementResult(statement, i, true);
              acc.narrowedTypes = applyTypeNarrowing(
                context,
                acc.narrowedTypes,
                data,
                operation
              );
              const skipExecution = getSkipExecution({
                context,
                data,
                operation,
              });

              acc.elements.push(
                <div key={operation.id} className="flex items-start gap-1 ml-2">
                  <PipeArrow
                    size={10}
                    className="text-disabled mt-1.5"
                    style={{
                      transform:
                        operationsList.length > 1 ? "rotate(90deg)" : "",
                    }}
                  />
                  <ErrorBoundary
                    displayError={true}
                    onRemove={() => handleOperationCall(operation, i, true)}
                  >
                    <OperationCall
                      data={data}
                      operation={operation}
                      handleOperationCall={(op, remove) =>
                        handleOperationCall(op, i, remove)
                      }
                      // passing context and narrowedTypes separately to handle inverse type narrowing
                      context={{ ...context, skipExecution }}
                      narrowedTypes={acc.narrowedTypes}
                      addOperationCall={
                        !options?.isParameter && !skipExecution
                          ? () =>
                              addOperationCall(
                                operation.value.result ?? data,
                                i + 1
                              )
                          : undefined
                      }
                    />
                  </ErrorBoundary>
                </div>
              );
              return acc;
            },
            { elements: [] as ReactNode[], narrowedTypes: new Map() }
          ).elements
        }
      </div>
    </div>
  );
};

export const Statement = memo(StatementComponent);
