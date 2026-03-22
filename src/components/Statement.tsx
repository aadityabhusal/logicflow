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
import { memo, useCallback, useMemo } from "react";
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
  enableVariable,
  isOptional,
  isParameter,
  isRest,
  disableNameToggle,
  disableDelete,
}: {
  statement: IStatement;
  handleStatement: (statement: IStatement, remove?: boolean) => void;
  addStatement?: (
    newStatement: IStatement,
    position: "before" | "after",
    currentStatementId: string
  ) => void;
  enableVariable?: boolean;
  isOptional?: boolean;
  isParameter?: boolean;
  isRest?: boolean;
  disableNameToggle?: boolean;
  disableDelete?: boolean;
}) => {
  const context = useExecutionResultsStore((s) =>
    s.getContext(statement.name ?? statement.id)
  );
  const reservedNames = useMemo(() => getReservedNames(context), [context]);

  const handleDataChange = useCallback(
    (data: IData, remove?: boolean) => {
      const newStatement = {
        ...statement,
        data,
        ...(statement.isRest && data.type.kind !== "array"
          ? { isRest: undefined }
          : {}),
      };
      handleStatement(newStatement, remove);
    },
    [statement, handleStatement]
  );

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

  const addOperationCall = useCallback(
    async (data: IData, operationId?: string) => {
      const operation = await createOperationCall({ data, context });
      const operations = [...statement.operations];
      const index = operationId
        ? operations.findIndex((op) => op.id === operationId) + 1
        : 0;
      operations.splice(index, 0, operation);
      handleStatement({ ...statement, operations });
      setNavigation({ navigation: { id: operation.id, direction: "right" } });
    },
    [context, handleStatement, setNavigation, statement]
  );

  const handleOperationCall = useCallback(
    (operation: IData<OperationType>, remove?: boolean) => {
      const operations = [...statement.operations];
      const index = operations.findIndex((op) => op.id === operation.id);
      if (remove) operations.splice(index, 1);
      else operations[index] = operation;
      handleStatement({ ...statement, operations });
    },
    [handleStatement, statement]
  );

  return (
    <div className="flex items-start gap-1">
      {enableVariable ? (
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
                icon={isRest ? FaEllipsis : isOptional ? FaQuestion : FaEquals}
                position="right"
                className={[
                  "hover:outline hover:outline-border",
                  isOptional || isRest ? "" : "mt-1",
                  isEqualsFocused ? "outline outline-border" : "",
                  disableNameToggle ? "text-disabled" : "",
                ].join(" ")}
                title={
                  disableNameToggle
                    ? isRest
                      ? "Rest Parameter"
                      : isOptional
                        ? "Optional Parameter"
                        : undefined
                    : isParameter
                      ? isRest
                        ? "Make required"
                        : isOptional
                          ? "Make rest"
                          : "Make optional"
                      : "Create variable"
                }
                onClick={() => {
                  if (disableNameToggle) return;
                  const rest = createData({
                    value: [createStatement({ data: statement.data })],
                  });
                  handleStatement({
                    ...statement,
                    ...(isParameter
                      ? isRest
                        ? { isOptional: undefined, isRest: undefined }
                        : isOptional
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
                onSelect={(newStatement) => {
                  addStatement?.(newStatement, "before", statement.id);
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
            disableDelete ? undefined : () => handleStatement(statement, true)
          }
        >
          <Data
            data={statement.data}
            disableDelete={disableDelete}
            context={context}
            addOperationCall={
              isParameter ||
              context.skipExecution ||
              !getFilteredOperations(statement.data, context).length
                ? addOperationCall
                : undefined
            }
            handleChange={handleDataChange}
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
                onRemove={() => handleOperationCall(operation, true)}
              >
                <OperationCall
                  data={prevData}
                  operation={operation}
                  handleOperationCall={handleOperationCall}
                  addOperationCall={isParameter ? undefined : addOperationCall}
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
