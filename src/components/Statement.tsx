import {
  FaArrowRightLong,
  FaArrowTurnUp,
  FaEquals,
  FaQuestion,
  FaEllipsis,
  FaArrowTurnDown,
} from "react-icons/fa6";
import {
  IData,
  IStatement,
  OperationType,
  ConditionType,
  DataValue,
} from "../lib/types";
import {
  getStatementResult,
  createVariableName,
  createStatement,
  createData,
  isDataOfType,
  isBlockCondition,
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
import { memo, useCallback, useMemo, useState } from "react";
import { useNavigationStore } from "@/lib/store";
import { ErrorBoundary } from "./ErrorBoundary";
import { notifications } from "@mantine/notifications";
import { useExecutionResultsStore } from "@/lib/execution/store";
import { useRestrictedName } from "@/lib/useRestrictedName";
import { EntityPath } from "@/lib/types";
import { ReservedNames } from "@/lib/execution/types";
import { getStatementLayout } from "@/lib/layout";
import { useMobileLayout } from "@/hooks/useMobileLayout";
import { useEntityContextMenu } from "@/hooks/useEntityContextMenu";

const StatementComponent = ({
  statement,
  handleStatement,
  addStatement,
  moveStatement,
  enableVariable,
  isOptional,
  isParameter,
  isRest,
  disableNameToggle,
  disableDelete,
  path,
  reservedNames,
  position,
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
  moveStatement?: (id: string, direction: "up" | "down") => void;
  enableVariable?: boolean;
  isOptional?: boolean;
  isParameter?: boolean;
  isRest?: boolean;
  disableNameToggle?: boolean;
  disableDelete?: boolean;
  path: EntityPath;
  reservedNames?: ReservedNames;
  position?: "first" | "last" | "only";
}) => {
  const context = useExecutionResultsStore((s) =>
    s.getContextOrAncestor(statement.id, path)
  );
  const { isRestricted } = useRestrictedName({ context, reservedNames });

  const isReturn = statement.controlFlow === "return";
  const isTopLevelStatement = enableVariable && !isParameter;

  const {
    handleContextMenu,
    handleDataContextMenu,
    handleOperationContextMenu,
    isHighlighted,
  } = useEntityContextMenu({
    statement,
    handleStatement,
    addStatement,
    moveStatement,
    disableDelete,
    path,
    position,
  });

  const normalizeStatement = useCallback((nextStatement: IStatement) => {
    if (!isDataOfType(nextStatement.data, "condition")) return nextStatement;

    const shouldDropName =
      nextStatement.name !== undefined &&
      isBlockCondition(nextStatement.data.value);
    const shouldDropOperations = nextStatement.operations.length > 0;

    if (!shouldDropName && !shouldDropOperations) return nextStatement;
    return {
      ...nextStatement,
      ...(shouldDropName ? { name: undefined } : {}),
      ...(shouldDropOperations ? { operations: [] } : {}),
    };
  }, []);

  const handleDataChange = useCallback(
    (data: IData, remove?: boolean) => {
      const newStatement = {
        ...statement,
        data,
        ...(statement.isRest && data.type.kind !== "array"
          ? { isRest: undefined }
          : {}),
      };
      handleStatement(normalizeStatement(newStatement), remove, path);
    },
    [handleStatement, normalizeStatement, statement, path]
  );

  const hasName = statement.name !== undefined;
  const isConditionBlock =
    isDataOfType(statement.data, "condition") &&
    isBlockCondition(statement.data.value as DataValue<ConditionType>);

  const isEqualsFocused = useNavigationStore(
    (s) =>
      s.navigation?.id === `${statement.id}_equals` && !s.navigation?.disable
  );
  const isReturnFocused = useNavigationStore(
    (s) =>
      s.navigation?.id === `${statement.id}_return` && !s.navigation?.disable
  );
  const isNameFocused = useNavigationStore(
    (s) => s.navigation?.id === `${statement.id}_name` && !s.navigation?.disable
  );
  const isAddFocused = useNavigationStore(
    (s) => s.navigation?.id === `${statement.id}_add` && !s.navigation?.disable
  );
  const setNavigation = useNavigationStore((state) => state.setNavigation);
  const [localName, setLocalName] = useState(statement.name || "");
  const [popoverOpened, { open, close, toggle }] = useDisclosure(false);
  const { openDropdown, closeDropdown } = useDelayedHover({
    open,
    close,
    openDelay: 0,
    closeDelay: 150,
  });
  const isMobileLayout = useMobileLayout();
  const isMultiline =
    getStatementLayout(statement, isMobileLayout) === "multiline";
  const PipeArrow = isMultiline ? FaArrowTurnUp : FaArrowRightLong;
  const equalsIcon = isReturn
    ? FaArrowTurnDown
    : isRest
      ? FaEllipsis
      : isOptional
        ? FaQuestion
        : FaEquals;

  const equalsTitle = (() => {
    if (isReturn) return "Remove return";
    if (isConditionBlock) return "Cannot add condition block variable";
    if (disableNameToggle) {
      if (isRest) return "Rest Parameter";
      if (isOptional) return "Optional Parameter";
      return undefined;
    }
    if (!isParameter) return "Create variable";
    if (isRest) return "Make required";
    if (isOptional) return "Make rest";
    return "Make optional";
  })();

  const handleEqualsAction = () => {
    if (disableNameToggle || isConditionBlock) return;
    const data = createData({
      value: [createStatement({ data: statement.data })],
    });
    handleStatement(
      normalizeStatement({
        ...statement,
        ...(isReturn
          ? { controlFlow: undefined }
          : isParameter
            ? isRest
              ? { isOptional: undefined, isRest: undefined }
              : isOptional
                ? { isOptional: undefined, isRest: true, data }
                : { isOptional: true, isRest: undefined }
            : {
                name: hasName
                  ? undefined
                  : createVariableName({
                      prefix: "var",
                      prev: reservedNames?.map((r) => r.name) ?? [],
                    }),
              }),
      }),
      false,
      path
    );
    setNavigation(() => ({ navigation: { id: `${statement.id}_name` } }));
  };

  const popoverEvents = !isMobileLayout && {
    onMouseEnter: openDropdown,
    onFocus: openDropdown,
    onMouseLeave: closeDropdown,
    onBlur: closeDropdown,
  };

  const addOperationCall = useCallback(
    async (data: IData, operationId?: string) => {
      if (isDataOfType(statement.data, "condition")) return;
      if (!getFilteredOperations(data, context).length) return;
      const operation = await createOperationCall({
        data,
        context,
        executePreview: false,
      });
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
    <div
      className={[
        "flex items-start gap-1",
        isHighlighted ? "outline outline-border bg-dropdown-hover" : "",
      ].join(" ")}
      onContextMenu={handleContextMenu}
    >
      {enableVariable ? (
        <div className="flex items-center gap-1 mr-1">
          {hasName ? (
            <BaseInput
              key={`${statement.name ?? ""}_${statement.id}`}
              ref={(elem) => isNameFocused && elem?.focus()}
              value={localName}
              onChange={setLocalName}
              className={[
                "text-variable",
                isNameFocused ? "outline outline-border" : "",
              ].join(" ")}
              onBlur={() => {
                if (!localName || localName === statement.name) {
                  setLocalName(statement.name || "");
                  return;
                }
                const error = isRestricted(localName, statement.name);
                if (error) {
                  notifications.show({ message: error });
                  setLocalName(statement.name || "");
                  return;
                }
                handleStatement(
                  normalizeStatement({ ...statement, name: localName }),
                  false,
                  path
                );
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
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
              !context.enforceExpectedType && (popoverOpened || isAddFocused)
            }
            onChange={(opened) => !opened && close()}
            offset={4}
            position={isMobileLayout ? "bottom-start" : "top"}
            withinPortal={false}
            clickOutsideEvents={["mousedown", "touchstart"]}
          >
            <Popover.Target>
              <IconButton
                ref={(elem) => isEqualsFocused && elem?.focus()}
                icon={equalsIcon}
                position="right"
                className={[
                  "hover:outline hover:outline-border",
                  isOptional || isRest ? "" : "mt-1",
                  isEqualsFocused ? "outline outline-border" : "",
                  disableNameToggle || isConditionBlock ? "text-disabled" : "",
                  isReturn ? "transform rotate-90" : "",
                ].join(" ")}
                title={!isMobileLayout ? equalsTitle : undefined}
                aria-label={equalsTitle}
                onClick={() => {
                  if (isMobileLayout) toggle();
                  else handleEqualsAction();
                }}
                {...popoverEvents}
              />
            </Popover.Target>
            <Popover.Dropdown
              {...popoverEvents}
              classNames={{ dropdown: "flex items-center gap-2 border" }}
            >
              {isMobileLayout && !disableNameToggle && !isConditionBlock ? (
                <IconButton
                  icon={equalsIcon}
                  position="right"
                  title={!isMobileLayout ? equalsTitle : undefined}
                  aria-label={equalsTitle}
                  className={isReturn ? "transform rotate-90" : ""}
                  onClick={() => {
                    handleEqualsAction();
                    close();
                  }}
                />
              ) : null}
              {isTopLevelStatement && !isReturn ? (
                <IconButton
                  ref={(elem) => isReturnFocused && elem?.focus()}
                  icon={FaArrowTurnDown}
                  position="right"
                  title={!isMobileLayout ? "Return here" : undefined}
                  aria-label="Return here"
                  className="hover:outline hover:outline-border transform rotate-90"
                  onClick={() => {
                    handleStatement(
                      { ...statement, controlFlow: "return", name: undefined },
                      false,
                      path
                    );
                    close();
                  }}
                />
              ) : null}
              <AddStatement
                id={statement.id}
                onSelect={(newStatement) => {
                  addStatement?.(newStatement, "before", statement.id);
                  close();
                }}
                iconProps={{
                  title: !isMobileLayout ? "Add before" : undefined,
                  "aria-label": "Add before",
                }}
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
            isTopLevelStatement={isTopLevelStatement}
            addOperationCall={
              !isParameter &&
              !context.skipExecution &&
              !isDataOfType(statement.data, "condition")
                ? addOperationCall
                : undefined
            }
            handleChange={handleDataChange}
            basePath={path}
            onContextMenu={handleDataContextMenu}
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
                  addOperationCall={
                    isParameter || isDataOfType(statement.data, "condition")
                      ? undefined
                      : addOperationCall
                  }
                  onOperationContextMenu={handleOperationContextMenu}
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
