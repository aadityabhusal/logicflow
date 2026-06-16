import {
  IData,
  IStatement,
  OperationType,
  IDropdownItem,
  IDropdownTargetProps,
} from "../lib/types";
import { Statement } from "./Statement";
import { Dropdown } from "./Dropdown";
import {
  createOperationCall,
  getFilteredOperations,
} from "@/lib/execution/execution";
import { resolveParameters } from "../lib/utils";
import { resolveDisplayName } from "../lib/packages/registry";
import { BaseInput } from "./Input/BaseInput";
import { memo, MouseEvent, useCallback, useMemo } from "react";
import { useNavigationStore } from "@/lib/store";
import { AddStatement } from "./AddStatement";
import { useExecutionResultsStore } from "@/lib/execution/store";
import { EntityPath } from "@/lib/types";
import { getOperationCallLayout } from "@/lib/layout";
import { useMobileCodeWrapping } from "@/hooks/useMobileLayout";

const OperationCallComponent = ({
  data,
  operation,
  handleOperationCall,
  addOperationCall,
  path,
  onOperationContextMenu,
}: {
  data: IData;
  operation: IData<OperationType>;
  handleOperationCall: (
    operation: IData<OperationType>,
    remove?: boolean
  ) => void;
  addOperationCall?: (data: IData, operationId?: string) => void;
  path: EntityPath;
  onOperationContextMenu?: (e: MouseEvent, op: IData<OperationType>) => void;
}) => {
  const context = useExecutionResultsStore((s) =>
    s.getContextOrAncestor(operation.id, path)
  );

  const setNavigation = useNavigationStore((s) => s.setNavigation);
  const restParamType = useMemo(() => {
    const restParam = operation.type.parameters.findLast((p) => p.isRest)?.type;
    if (restParam?.kind === "array") return restParam.elementType;
    return undefined;
  }, [operation.type.parameters]);

  const handleDropdown = useCallback(
    async (name: string) => {
      if (operation.value.name === name) return;
      const operationCall = await createOperationCall({
        data,
        name,
        parameters: operation.value.parameters,
        context,
        operationId: operation.id,
      });
      operationCall.id = operation.id;
      handleOperationCall(operationCall);
      const params = operationCall.value.parameters;
      setNavigation({
        navigation: {
          id: params.length > 0 ? params[0].data.id : operation.id,
          direction: "right",
        },
      });
    },
    [operation, data, context, handleOperationCall, setNavigation]
  );

  const handleParameter = useCallback(
    (item: IStatement, remove?: boolean) => {
      const parameters = [...operation.value.parameters];
      const _index = parameters.findIndex((p) => p.id === item.id);
      const index = _index === -1 ? parameters.length : _index;
      if (remove) parameters.splice(index, 1);
      else parameters[index] = item;

      const ops = getFilteredOperations(data, context, true);
      const origOp = ops
        .flatMap(([_, items]) => items)
        .find((opItem) => opItem.name === operation.value.name);
      const origParams = origOp
        ? resolveParameters(origOp, data, context)
        : undefined;

      handleOperationCall({
        ...operation,
        type: {
          ...operation.type,
          parameters: (origParams ?? operation.type.parameters).map(
            (param, i) => {
              const idx = (i >= index && remove ? i + 1 : i) - 1;
              return {
                ...param,
                name: parameters[idx]?.name ?? param.name,
                type: parameters[idx]?.data.type ?? param.type,
              };
            }
          ),
        },
        value: { ...operation.value, parameters },
      });
    },
    [operation, handleOperationCall, data, context]
  );

  const handleDelete = useCallback(() => {
    handleOperationCall(operation, true);
  }, [handleOperationCall, operation]);

  const getDropdownItems = useCallback(() => {
    return getFilteredOperations(data, context, true).map(
      ([groupName, groupItems]) => [
        groupName,
        groupItems.map((item) => ({
          label: resolveDisplayName(item.name, context.packageAliases),
          value: `${
            resolveParameters(item, data, context)?.[0]?.type.kind ??
            "undefined"
          }-${item.name}`,
          color: "method",
          entityType: "operationCall" as const,
          onClick: () => handleDropdown(item.name),
        })),
      ]
    ) as [string, IDropdownItem[]][];
  }, [data, context, handleDropdown]);

  const handleAddOperationCall = useCallback(
    (_data?: IData) => addOperationCall?.(_data ?? data, operation.id),
    [addOperationCall, data, operation.id]
  );
  const canAddOperationCall = useCallback(
    (_data?: IData) => !!getFilteredOperations(_data ?? data, context).length,
    [data, context]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => onOperationContextMenu?.(e, operation),
    [onOperationContextMenu, operation]
  );

  const parameterPaths = useMemo(() => {
    const arr = Array.from({ length: operation.value.parameters.length });
    return arr.map((_, i) => [...path, "value", "parameters", i]);
  }, [path, operation.value.parameters.length]);

  const TooltipTarget = useCallback(
    (props: IDropdownTargetProps) => (
      <BaseInput {...props} className="text-method" />
    ),
    []
  );

  const enableWrapping = useMobileCodeWrapping();
  const isMultiline =
    getOperationCallLayout(operation, enableWrapping) === "multiline";

  return (
    <Dropdown
      id={operation.id}
      items={getDropdownItems}
      context={context}
      value={resolveDisplayName(
        operation.value.name ?? "",
        context.packageAliases
      )}
      operation={operation}
      addOperationCall={
        !context.skipExecution ? handleAddOperationCall : undefined
      }
      canAddOperationCall={
        !context.skipExecution ? canAddOperationCall : undefined
      }
      handleDelete={handleDelete}
      isInputTarget
      target={TooltipTarget}
      onContextMenu={handleContextMenu}
    >
      <span>{"("}</span>
      <div
        className={[
          "flex items-start gap-1",
          isMultiline ? "flex-col ml-2" : "flex-row",
        ].join(" ")}
      >
        {operation.value.parameters.map((item, paramIndex, arr) => (
          <div key={item.id} className="flex items-start">
            <Statement
              statement={item}
              path={parameterPaths[paramIndex]}
              handleStatement={handleParameter}
              disableDelete={!item.isOptional}
            />
            {paramIndex < arr.length - 1 ? (
              <span>{isMultiline ? "," : ", "}</span>
            ) : null}
          </div>
        ))}
        {operation.value.parameters.length + 1 <
          operation.type.parameters.length || restParamType ? (
          <AddStatement
            id={`${operation.id}_call_parameter`}
            onSelect={(statement) => handleParameter(statement, undefined)}
            iconProps={{ title: "Add parameter" }}
            config={{
              ...(restParamType
                ? { type: restParamType, isOptional: true }
                : operation.type.parameters[
                    operation.value.parameters.length + 1
                  ]),
              name: undefined,
            }}
          />
        ) : null}
        <span className="self-end">{")"}</span>
      </div>
    </Dropdown>
  );
};

export const OperationCall = memo(OperationCallComponent);
