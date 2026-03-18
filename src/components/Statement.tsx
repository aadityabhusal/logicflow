import {
  FaArrowRightLong,
  FaArrowTurnUp,
  FaEquals,
  FaQuestion,
  FaEllipsis,
} from "react-icons/fa6";
import { IData, IStatement, OperationType } from "../lib/types";
import {
  getStatementResult,
  createVariableName,
  createStatement,
  createData,
} from "../lib/utils";
import {
  createOperationCall,
  getFilteredOperations,
} from "@/lib/execution/execution";
import { Data } from "./Data";
import { BaseInput } from "./Input/BaseInput";
import { OperationCall } from "./OperationCall";
import { IconButton } from "../ui/IconButton";
import { AddStatement } from "./AddStatement";
import { useDisclosure } from "@mantine/hooks";
import { Popover, useDelayedHover } from "@mantine/core";
import { memo, useMemo } from "react";
import { useNavigationStore } from "@/lib/store";
import { ErrorBoundary } from "./ErrorBoundary";
import { notifications } from "@mantine/notifications";
import {
  getReservedNames,
  useExecutionResultsStore,
} from "@/lib/execution/store";

const StatementComponent = ({
  statement,
  handleStatement,
  addStatement,
  options,
}: {
  statement: IStatement;
  handleStatement: (statement: IStatement, remove?: boolean) => void;
  addStatement?: (statement: IStatement, position: "before" | "after") => void;
  options?: {
    enableVariable?: boolean;
    isOptional?: boolean;
    isParameter?: boolean;
    isRest?: boolean;
    disableNameToggle?: boolean;
    disableDelete?: boolean;
  };
}) => {
  const context = useExecutionResultsStore((s) =>
    s.getContext(statement.name ?? statement.id)
  );
  const reservedNames = useMemo(() => getReservedNames(context), [context]);

  const hasName = statement.name !== undefined;
  const isEqualsFocused = useNavigationStore(
    (s) => s.navigation?.id === `${statement.id}_equals`
  );
  const isNameFocused = useNavigationStore(
    (s) => s.navigation?.id === `${statement.id}_name`
  );
  const isAddFocused = useNavigationStore(
    (s) => s.navigation?.id === `${statement.id}_add`
  );
  const setNavigation = useNavigationStore((state) => state.setNavigation);
  const [hoverOpened, { open, close }] = useDisclosure(false);
  const { openDropdown, closeDropdown } = useDelayedHover({
    open,
    close,
    openDelay: 0,
    closeDelay: 150,
  });
  const PipeArrow =
    statement.operations.length > 1 ? FaArrowTurnUp : FaArrowRightLong;

  const hoverEvents = useMemo(
    () => ({
      onMouseEnter: openDropdown,
      onFocus: openDropdown,
      onMouseLeave: closeDropdown,
      onBlur: closeDropdown,
    }),
    [openDropdown, closeDropdown]
  );

  async function addOperationCall(data: IData, index: number) {
    const operation = await createOperationCall({ data, context });
    const operations = [...statement.operations];
    operations.splice(index, 0, operation);
    handleStatement({ ...statement, operations });
    setNavigation({ navigation: { id: operation.id, direction: "right" } });
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
                const isReserved = Array.from(reservedNames ?? []).find(
                  (r) => r.name === name
                );
                if (isReserved) {
                  notifications.show({
                    message: `Cannot use the ${isReserved.kind} '${name}' as a variable name`,
                  });
                  return;
                }
                handleStatement({ ...statement, name });
              }}
              onFocus={() =>
                setNavigation(() => ({
                  navigation: { id: `${statement.id}_name` },
                }))
              }
            />
          ) : null}
          <Popover
            opened={
              context.enforceExpectedType ? false : hoverOpened || isAddFocused
            }
            offset={4}
            position="left"
            withinPortal={false}
          >
            <Popover.Target>
              <IconButton
                ref={(elem) => isEqualsFocused && elem?.focus()}
                icon={
                  options?.isRest
                    ? FaEllipsis
                    : options?.isOptional
                      ? FaQuestion
                      : FaEquals
                }
                position="right"
                className={[
                  "hover:outline hover:outline-border",
                  options?.isOptional || options?.isRest ? "" : "mt-1",
                  isEqualsFocused ? "outline outline-border" : "",
                  options?.disableNameToggle ? "text-disabled" : "",
                ].join(" ")}
                title={
                  options?.disableNameToggle
                    ? options?.isRest
                      ? "Rest Parameter"
                      : options?.isOptional
                        ? "Optional Parameter"
                        : undefined
                    : options?.isParameter
                      ? options?.isRest
                        ? "Make required"
                        : options?.isOptional
                          ? "Make rest"
                          : "Make optional"
                      : "Create variable"
                }
                onClick={() => {
                  if (options?.disableNameToggle) return;
                  const rest = createData({
                    value: [createStatement({ data: statement.data })],
                  });
                  handleStatement({
                    ...statement,
                    ...(options?.isParameter
                      ? options?.isRest
                        ? { isOptional: undefined, isRest: undefined }
                        : options?.isOptional
                          ? {
                              isOptional: undefined,
                              isRest: true,
                              data: rest,
                            }
                          : { isOptional: true, isRest: undefined }
                      : {
                          name: hasName
                            ? undefined
                            : createVariableName({
                                prefix: "var",
                                prev: Array.from(reservedNames).map(
                                  (r) => r.name
                                ),
                              }),
                        }),
                  });
                  setNavigation(() => ({
                    navigation: { id: `${statement.id}_name` },
                  }));
                }}
                {...hoverEvents}
              />
            </Popover.Target>
            <Popover.Dropdown {...hoverEvents}>
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
            context={context}
            addOperationCall={
              !options?.isParameter &&
              !context.skipExecution &&
              getFilteredOperations(statement.data, context).length
                ? (_data) => addOperationCall(_data ?? statement.data, 0)
                : undefined
            }
            handleChange={(data, remove) =>
              handleStatement(
                {
                  ...statement,
                  data,
                  ...(statement.isRest && data.type.kind !== "array"
                    ? { isRest: undefined }
                    : {}),
                },
                remove
              )
            }
          />
        </ErrorBoundary>
        {statement.operations.map((operation, i, operationsList) => {
          const prevData = getStatementResult(statement, context, {
            index: i,
            prevEntity: true,
            skipResolveReference: true,
          });

          return (
            <div key={operation.id} className="flex items-start gap-1 ml-2">
              <PipeArrow
                size={10}
                className="text-disabled mt-1.5"
                style={{
                  transform: operationsList.length > 1 ? "rotate(90deg)" : "",
                }}
              />
              <ErrorBoundary
                displayError={true}
                onRemove={() => handleOperationCall(operation, i, true)}
              >
                <OperationCall
                  data={prevData}
                  operation={operation}
                  handleOperationCall={(op, remove) =>
                    handleOperationCall(op, i, remove)
                  }
                  addOperationCall={
                    !options?.isParameter
                      ? (_data) => addOperationCall(_data ?? prevData, i + 1)
                      : undefined
                  }
                />
              </ErrorBoundary>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const Statement = memo(StatementComponent);
