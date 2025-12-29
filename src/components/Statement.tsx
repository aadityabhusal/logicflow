import { FaArrowRightLong, FaArrowTurnUp, FaEquals } from "react-icons/fa6";
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
import { useMemo, type ReactNode } from "react";
import { uiConfigStore } from "@/lib/store";
import { useCustomHotkeys } from "@/hooks/useNavigation";
import { ErrorBoundary } from "./ErrorBoundary";

export function Statement({
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
    disableNameToggle?: boolean;
    disableDelete?: boolean;
    disableOperationCall?: boolean;
  };
}) {
  const hasName = statement.name !== undefined;
  const { navigation, setUiConfig } = uiConfigStore();
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

  const isEqualsFocused = navigation?.id === `${statement.id}_equals`;
  const isNameFocused = navigation?.id === `${statement.id}_name`;
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
  function addOperationCall() {
    const data = getStatementResult(statement);
    const operation = createOperationCall({ data, context });
    const operations = [...statement.operations, operation];
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
    const params = operation.value.parameters;
    setUiConfig({
      navigation: {
        id: params.length > 0 ? params[0].data.id : operation.id,
        direction: "right",
      },
    });
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
                  [
                    ...Object.keys(DataTypes),
                    ...context.variables.keys(),
                    "operation",
                  ].includes(name)
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
            opened={hoverOpened || navigation?.id === `${statement.id}_add`}
            offset={4}
            position="left"
            withinPortal={false}
          >
            <Popover.Target>
              <IconButton
                ref={(elem) => isEqualsFocused && elem?.focus()}
                icon={FaEquals}
                position="right"
                className={[
                  "mt-[5px] hover:outline hover:outline-border",
                  isEqualsFocused ? "outline outline-border" : "",
                ].join(" ")}
                disabled={options?.disableNameToggle}
                title="Create variable"
                onClick={() => {
                  handleStatement({
                    ...statement,
                    name: hasName
                      ? undefined
                      : createVariableName({
                          prefix: "var",
                          prev: [...context.variables.keys()],
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
                context={context}
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
              !options?.disableOperationCall &&
              statement.operations.length === 0 &&
              !context.skipExecution &&
              getFilteredOperations(statement.data, context.variables).length
                ? addOperationCall
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
                      context={{
                        ...context,
                        skipExecution: getSkipExecution({
                          context,
                          data,
                          operation,
                        }),
                      }}
                      narrowedTypes={acc.narrowedTypes}
                      addOperationCall={
                        !options?.disableOperationCall &&
                        i + 1 === operationsList.length
                          ? addOperationCall
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
}
