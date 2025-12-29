import { Context, IData, IStatement, OperationType } from "../lib/types";
import { Statement } from "./Statement";
import { Dropdown } from "./Dropdown";
import {
  createOperationCall,
  getFilteredOperations,
  getSkipExecution,
} from "../lib/operation";
import { getInverseTypes, mergeNarrowedTypes } from "../lib/utils";
import { BaseInput } from "./Input/BaseInput";
import { useMemo } from "react";

export function OperationCall({
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
}) {
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
    () => getFilteredOperations(data, context.variables),
    [data, context.variables]
  );

  function handleDropdown(name: string) {
    if (operation.value.name === name) return;
    handleOperationCall(
      createOperationCall({
        data,
        name,
        parameters: operation.value.parameters,
        context,
      })
    );
  }

  function handleParameter(item: IStatement, index: number) {
    const parameters = operation.value.parameters.map((param, i) =>
      i === index ? item : param
    );
    handleOperationCall({
      ...operation,
      type: {
        ...operation.type,
        parameters: parameters.map((param) => ({
          name: param.name,
          type: param.data.type,
        })),
      },
      value: { ...operation.value, parameters },
    });
  }

  return (
    <Dropdown
      id={operation.id}
      operationResult={operation.value.result}
      items={filteredOperations.map((item) => ({
        label: item.name,
        value: item.name,
        color: "method",
        entityType: "operationCall",
        onClick: () => handleDropdown(item.name),
      }))}
      context={context}
      value={operation.value.name}
      addOperationCall={
        filteredOperations.length && !context.skipExecution
          ? addOperationCall
          : undefined
      }
      handleDelete={() => handleOperationCall(operation, true)}
      isInputTarget
      target={(props) => <BaseInput {...props} className="text-method" />}
    >
      <span>{"("}</span>
      {operation.value.parameters.map((item, paramIndex, arr) => {
        const variables =
          operation.value.name === "thenElse" && paramIndex === 1
            ? getInverseTypes(context.variables, narrowedTypes)
            : updatedVariables;
        return (
          <span key={paramIndex} className="flex">
            <Statement
              statement={item}
              handleStatement={(val) => val && handleParameter(val, paramIndex)}
              options={{ disableDelete: true }}
              context={{
                ...context,
                variables,
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
      <span className="self-end">{")"}</span>
    </Dropdown>
  );
}
