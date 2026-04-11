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
  isValidIdentifier,
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
import { useExecutionResultsStore } from "@/lib/execution/store";
import { EntityPath } from "@/lib/types";
import { ReservedNames } from "@/lib/execution/types";
import { getStatementLayout } from "@/lib/layout";

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
  path,
  reservedNames,
}: {
  statement: IStatement;
  handleStatement: (
    statement: IStatement,
    remove?: boolean,
    path?: EntityPath
  ) => void;
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
  path: EntityPath;
  reservedNames?: ReservedNames;
}) => {
  const context = useExecutionResultsStore((s) => s.getContext(statement.id));

  const handleDataChange = useCallback(
    (data: IData, remove?: boolean) => {
      const newStatement = {
        ...statement,
        data,
        ...(statement.isRest && data.type.kind !== "array"
          ? { isRest: undefined }
          : {}),
      };
      handleStatement(newStatement, remove, path);
    },
    [statement, handleStatement, path]
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
  const isMultiline = getStatementLayout(statement) === "multiline";
  const PipeArrow = isMultiline ? FaArrowTurnUp : FaArrowRightLong;

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
      handleStatement({ ...statement, operations }, false, path);
      setNavigation({ navigation: { id: operation.id, direction: "right" } });
    },
    [context, handleStatement, setNavigation, statement, path]
  );

  const handleOperationCall = useCallback(
    (operation: IData<OperationType>, remove?: boolean) => {
      const operations = [...statement.operations];
      const index = operations.findIndex((op) => op.id === operation.id);
      if (remove) operations.splice(index, 1);
      else operations[index] = operation;
      handleStatement({ ...statement, operations }, false, path);
    },
    [handleStatement, statement, path]
  );

  const operationPaths = useMemo(() => {
    const arr = Array.from({ length: statement.operations.length });
    return arr.map((_, i) => [...path, "operations", i]);
  }, [path, statement.operations.length]);

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
                if (name && !isValidIdentifier(name)) {
                  return notifications.show({
                    message: `"${name}" is not a valid name`,
                  });
                }
                const isReserved = Array.from(reservedNames ?? []).find(
                  (r) => r.name === name
                );
                if (isReserved) {
                  notifications.show({
                    message: `Cannot use the ${isReserved.kind} '${name}' as a variable name`,
                  });
                  return;
                }
                handleStatement({ ...statement, name }, false, path);
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
                  handleStatement(
                    {
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
                                  prev: reservedNames?.map((r) => r.name) ?? [],
                                }),
                          }),
                    },
                    false,
                    path
                  );
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
          "flex items-start gap-0 " + (isMultiline ? "flex-col" : "flex-row")
        }
      >
        <ErrorBoundary
          displayError={true}
          onRemove={
            disableDelete
              ? undefined
              : () => handleStatement(statement, true, path)
          }
        >
          <Data
            data={statement.data}
            disableDelete={disableDelete}
            context={context}
            addOperationCall={
              !isParameter &&
              !context.skipExecution &&
              getFilteredOperations(statement.data, context).length
                ? addOperationCall
                : undefined
            }
            handleChange={handleDataChange}
            basePath={path}
          />
        </ErrorBoundary>
        {statement.operations.map((operation, i) => {
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
                  transform: isMultiline ? "rotate(90deg)" : "",
                }}
              />
              <ErrorBoundary
                displayError={true}
                onRemove={() => handleOperationCall(operation, true)}
              >
                <OperationCall
                  data={prevData}
                  operation={operation}
                  path={operationPaths[i]}
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
