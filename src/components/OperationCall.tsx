import { Context, IData, IStatement, OperationType } from "../lib/types";
import { Statement } from "./Statement";
import { Dropdown } from "./Dropdown";
import {
  createOperationCall,
  getFilteredOperations,
  getOperationListItemParameters,
  getSkipExecution,
} from "../lib/operation";
import {
  getInverseTypes,
  mergeNarrowedTypes,
  resolveReference,
} from "../lib/utils";
import { BaseInput } from "./Input/BaseInput";
import { memo, useMemo } from "react";
import { uiConfigStore } from "@/lib/store";
import { AddStatement } from "./AddStatement";

const OperationCallComponent = ({
  data,
  operation,
  handleOperationCall,
  addOperationCall,
  context,
  narrowedTypes,
}: {
  data: IData;
  operation: IData<OperationType>;
  handleOperationCall: (
    operation: IData<OperationType>,
    remove?: boolean
  ) => void;
  addOperationCall?: () => void;
  context: Context;
  narrowedTypes: Context["variables"];
}) => {
  const setUiConfig = uiConfigStore((s) => s.setUiConfig);

  const updatedVariables = useMemo(
    () =>
      mergeNarrowedTypes(
        context.variables,
        narrowedTypes,
        operation.value.name
      ),
    [context.variables, narrowedTypes, operation.value.name]
  );
  const filteredOperations = useMemo(
    () => getFilteredOperations(data, context.variables, true),
    [data, context.variables]
  );

  function handleDropdown(name: string) {
    if (operation.value.name === name) return;
    const operationCall = createOperationCall({
      data,
      name,
      parameters: operation.value.parameters,
      context,
    });
    handleOperationCall(operationCall);
    const params = operationCall.value.parameters;
    setUiConfig({
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
        parameters: operation.type.parameters.map((param, i) => {
          const idx = (i >= index && remove ? i + 1 : i) - 1;
          return {
            ...param,
            name: parameters[idx]?.name ?? param.name,
            type: parameters[idx]?.data.type ?? param.type,
          };
        }),
      },
      value: { ...operation.value, parameters },
    });
  }

  return (
    <Dropdown
      id={operation.id}
      operationResult={operation.value.result}
      items={filteredOperations.map(([groupName, groupItems]) => [
        groupName,
        groupItems.map((item) => ({
          label: item.name,
          value: item.name,
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
      <span>{"("}</span>
      {operation.value.parameters.map((item, paramIndex, arr) => {
        const originalOperation = filteredOperations
          .flatMap(([_, items]) => items)
          .find((item) => item.name === operation.value.name);

        return (
          <span key={item.id} className="flex">
            <Statement
              statement={item}
              handleStatement={(val, remove) =>
                val && handleParameter(val, paramIndex, remove)
              }
              options={{
                disableDelete:
                  !operation.type.parameters[paramIndex + 1]?.isOptional,
              }}
              context={{
                ...context,
                variables:
                  operation.value.name === "thenElse" && paramIndex === 1
                    ? getInverseTypes(context.variables, narrowedTypes)
                    : updatedVariables,
                expectedType: originalOperation
                  ? getOperationListItemParameters(
                      originalOperation,
                      resolveReference(data, context)
                    )?.[paramIndex + 1]?.type
                  : undefined,
                skipExecution: getSkipExecution({
                  context,
                  data,
                  operation,
                  paramIndex,
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
          id={`${operation.id}_parameter`}
          onSelect={(statement) =>
            handleParameter(statement, operation.value.parameters.length)
          }
          iconProps={{ title: "Add parameter" }}
          dataType={
            operation.type.parameters[operation.value.parameters.length + 1]
              ?.type
          }
        />
      )}
      <span className="self-end">{")"}</span>
    </Dropdown>
  );
};

export const OperationCall = memo(OperationCallComponent);
