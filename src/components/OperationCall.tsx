import { Context, IData, IStatement, OperationType } from "../lib/types";
import { Statement } from "./Statement";
import { Dropdown } from "./Dropdown";
import {
  createOperationCall,
  getFilteredOperations,
  executeOperation,
  storeInstance,
} from "../lib/operation";
import { FaArrowRotateRight, FaPlay } from "react-icons/fa6";
import {
  updateContextWithNarrowedTypes,
  resolveParameters,
  getContextExpectedTypes,
} from "../lib/utils";
import { BaseInput } from "./Input/BaseInput";
import { memo, useMemo } from "react";
import { useExecutionResultsStore, useNavigationStore } from "@/lib/store";
import { AddStatement } from "./AddStatement";
import { IconButton } from "@/ui/IconButton";

const OperationCallComponent = ({
  data,
  operation,
  handleOperationCall,
  addOperationCall,
  context,
}: {
  data: IData;
  operation: IData<OperationType>;
  handleOperationCall: (
    operation: IData<OperationType>,
    remove?: boolean
  ) => void;
  addOperationCall?: () => void;
  context: Context;
}) => {
  const setNavigation = useNavigationStore((s) => s.setNavigation);
  const setResult = useExecutionResultsStore((s) => s.setResult);
  const filteredOperations = useMemo(
    () => getFilteredOperations(data, context, true),
    [data, context]
  );

  const originalOperation = useMemo(() => {
    return filteredOperations
      .flatMap(([_, items]) => items)
      .find((item) => item.name === operation.value.name);
  }, [filteredOperations, operation.value.name]);

  const originalParameters = useMemo(() => {
    if (!originalOperation) return undefined;
    return resolveParameters(originalOperation, data, context);
  }, [context, data, originalOperation]);

  async function handleManualExecute() {
    if (!originalOperation) return;
    const result = await executeOperation(
      originalOperation,
      data,
      operation.value.parameters,
      { ...context, operationId: operation.id }
    );
    const operationResult = { ...result, id: operation.id };
    setResult(operation.id, { data: operationResult, isPending: false });
    storeInstance(operationResult, operation.id, context);
    handleOperationCall({
      ...operation,
      type: { ...operation.type, result: result.type },
    });
  }

  async function handleDropdown(name: string) {
    if (operation.value.name === name) return;
    const operationCall = await createOperationCall({
      data,
      name,
      parameters: operation.value.parameters,
      context,
      operationId: operation.id,
      setResult,
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
  }

  function handleParameter(item: IStatement, index: number, remove?: boolean) {
    // eslint-disable-next-line prefer-const
    let parameters = [...operation.value.parameters];
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
  }

  return (
    <Dropdown
      id={operation.id}
      items={filteredOperations.map(([groupName, groupItems]) => [
        groupName,
        groupItems.map((item) => ({
          label: item.name,
          value: `${
            resolveParameters(item, data, context)?.[0]?.type.kind ??
            "undefined"
          }-${item.name}`,
          color: "method",
          entityType: "operationCall",
          onClick: () => handleDropdown(item.name),
        })),
      ])}
      context={context}
      value={operation.value.name}
      addOperationCall={
        filteredOperations.length ? addOperationCall : undefined
      }
      handleDelete={() => handleOperationCall(operation, true)}
      isInputTarget
      target={(props) => <BaseInput {...props} className="text-method" />}
    >
      {originalOperation?.isManual && (
        <IconButton
          icon={
            context.getResult(operation.id)?.data?.value
              ? FaArrowRotateRight
              : FaPlay
          }
          title="Run operation"
          className="mx-0.5"
          onClick={(e) => {
            e.stopPropagation();
            handleManualExecute();
          }}
        />
      )}
      <span>{"("}</span>
      {operation.value.parameters.map((item, paramIndex, arr) => {
        return (
          <span key={item.id} className="flex">
            <Statement
              statement={item}
              handleStatement={(val, remove) =>
                val && handleParameter(val, paramIndex, remove)
              }
              options={{ disableDelete: !item.isOptional }}
              context={{
                ...updateContextWithNarrowedTypes(
                  context,
                  data,
                  operation.value.name,
                  paramIndex
                ),
                ...getContextExpectedTypes({
                  context,
                  expectedType: originalParameters?.[paramIndex + 1]?.type,
                }),
              }}
            />
            {paramIndex < arr.length - 1 ? <span>{", "}</span> : null}
          </span>
        );
      })}
      {operation.value.parameters.length + 1 <
        operation.type.parameters.length && (
        <AddStatement
          id={`${operation.id}_call_parameter`}
          onSelect={(statement) =>
            handleParameter(statement, operation.value.parameters.length)
          }
          iconProps={{ title: "Add parameter" }}
          config={{
            ...operation.type.parameters[operation.value.parameters.length + 1],
            name: undefined,
          }}
        />
      )}
      <span className="self-end">{")"}</span>
    </Dropdown>
  );
};

export const OperationCall = memo(OperationCallComponent);
