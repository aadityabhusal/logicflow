import { IData, IStatement, OperationType, IDropdownItem } from "../lib/types";
import { Statement } from "./Statement";
import { Dropdown } from "./Dropdown";
import {
  createOperationCall,
  getFilteredOperations,
  executeOperation,
} from "@/lib/execution/execution";
import { FaArrowRotateRight } from "react-icons/fa6";
import { resolveParameters } from "../lib/utils";
import { BaseInput } from "./Input/BaseInput";
import { memo, useCallback, useMemo } from "react";
import { useNavigationStore } from "@/lib/store";
import { AddStatement } from "./AddStatement";
import { IconButton } from "@/ui/IconButton";
import { useExecutionResultsStore } from "@/lib/execution/store";
import { EntityPath } from "@/lib/types";

const OperationCallComponent = ({
  data,
  operation,
  handleOperationCall,
  addOperationCall,
  path,
}: {
  data: IData;
  operation: IData<OperationType>;
  handleOperationCall: (
    operation: IData<OperationType>,
    remove?: boolean
  ) => void;
  addOperationCall?: (data: IData, operationId?: string) => void;
  path: EntityPath;
}) => {
  const context = useExecutionResultsStore((s) => s.getContext(operation.id));

  const setNavigation = useNavigationStore((s) => s.setNavigation);
  const filteredOperations = useMemo(
    () => getFilteredOperations(data, context, true),
    [data, context]
  );
  const restParamType = useMemo(() => {
    const restParam = operation.type.parameters.findLast((p) => p.isRest)?.type;
    if (restParam?.kind === "array") return restParam.elementType;
    return undefined;
  }, [operation.type.parameters]);

  const originalOperation = useMemo(() => {
    return filteredOperations
      .flatMap(([_, items]) => items)
      .find((item) => item.name === operation.value.name);
  }, [filteredOperations, operation.value.name]);

  const originalParameters = useMemo(() => {
    if (!originalOperation) return undefined;
    return resolveParameters(originalOperation, data, context);
  }, [context, data, originalOperation]);

  const handleManualExecute = useCallback(async () => {
    if (!originalOperation) return;
    const result = await executeOperation(
      originalOperation,
      data,
      operation.value.parameters,
      context
    );
    context.setResult(operation.id, {
      data: { ...result, id: operation.id },
      shouldCacheResult: originalOperation.shouldCacheResult,
    });
    handleOperationCall({
      ...operation,
      type: { ...operation.type, result: result.type },
    });
  }, [originalOperation, data, operation, context, handleOperationCall]);

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
      const index = parameters.findIndex((p) => p.id === item.id);
      if (remove) parameters.splice(index, 1);
      else parameters[index] = item;
      handleOperationCall({
        ...operation,
        type: {
          ...operation.type,
          parameters: (originalParameters ?? operation.type.parameters).map(
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
    [operation, originalParameters, handleOperationCall]
  );

  const handleDelete = useCallback(() => {
    handleOperationCall(operation, true);
  }, [handleOperationCall, operation]);

  const dropdownItems = useMemo(() => {
    return filteredOperations.map(([groupName, groupItems]) => [
      groupName,
      groupItems.map((item) => ({
        label: item.name,
        value: `${
          resolveParameters(item, data, context)?.[0]?.type.kind ?? "undefined"
        }-${item.name}`,
        color: "method",
        entityType: "operationCall" as const,
        onClick: () => handleDropdown(item.name),
      })),
    ]) as [string, IDropdownItem[]][];
  }, [filteredOperations, data, context, handleDropdown]);

  const handleAddOperationCall = useCallback(
    (_data?: IData) => {
      if (!filteredOperations.length || context.skipExecution) return undefined;
      addOperationCall?.(_data ?? data, operation.id);
    },
    [
      addOperationCall,
      context.skipExecution,
      data,
      filteredOperations.length,
      operation.id,
    ]
  );

  const parameterPaths = useMemo(() => {
    const arr = Array.from({ length: operation.value.parameters.length });
    return arr.map((_, i) => [...path, "value", "parameters", i]);
  }, [path, operation.value.parameters.length]);

  return (
    <Dropdown
      id={operation.id}
      items={dropdownItems}
      context={context}
      value={operation.value.name}
      addOperationCall={handleAddOperationCall}
      handleDelete={handleDelete}
      isInputTarget
      target={(props) => <BaseInput {...props} className="text-method" />}
    >
      {originalOperation?.shouldCacheResult && (
        <IconButton
          icon={FaArrowRotateRight}
          title="Re-run operation"
          className="mx-0.5"
          onClick={(e) => {
            e.stopPropagation();
            handleManualExecute();
          }}
          size={12}
        />
      )}
      <span>{"("}</span>
      {operation.value.parameters.map((item, paramIndex, arr) => (
        <span key={item.id} className="flex">
          <Statement
            statement={item}
            path={parameterPaths[paramIndex]}
            handleStatement={handleParameter}
            disableDelete={!item.isOptional}
          />
          {paramIndex < arr.length - 1 ? <span>{", "}</span> : null}
        </span>
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
    </Dropdown>
  );
};

export const OperationCall = memo(OperationCallComponent);
