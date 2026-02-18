import { IData, Context, InstanceDataType, IStatement } from "@/lib/types";
import { forwardRef, memo } from "react";
import { Statement } from "../Statement";
import { BaseInput } from "./BaseInput";
import { getContextExpectedTypes } from "@/lib/utils";
import { AddStatement } from "../AddStatement";

interface InstanceInputProps {
  data: IData<InstanceDataType>;
  handleData: (data: IData<InstanceDataType>) => void;
  context: Context;
  onChange?: (value: string) => void;
}

const InstanceInputComponent = (
  { data, handleData, context, onChange, ...props }: InstanceInputProps,
  ref: React.ForwardedRef<HTMLInputElement>
) => {
  function handleConstructorArgs(
    item: IStatement,
    index: number,
    remove?: boolean
  ) {
    const constructorArgs = [...data.value.constructorArgs];
    if (remove) constructorArgs.splice(index, 1);
    else constructorArgs[index] = item;
    handleData({
      ...data,
      value: { ...data.value, constructorArgs },
    });
  }
  return (
    <div className="flex items-start gap-1">
      <BaseInput
        {...props}
        ref={ref}
        className="text-type"
        onChange={onChange}
      />
      <span>{"("}</span>
      {data.value.constructorArgs.map((item, paramIndex, arr) => {
        return (
          <span key={item.id} className="flex">
            <Statement
              statement={item}
              handleStatement={(val, remove) =>
                val && handleConstructorArgs(val, paramIndex, remove)
              }
              options={{ disableDelete: !item.isOptional }}
              context={{
                ...context,
                ...getContextExpectedTypes({
                  context,
                  expectedType: data.type.constructorArgs[paramIndex].type,
                }),
              }}
            />
            {paramIndex < arr.length - 1 ? <span>{", "}</span> : null}
          </span>
        );
      })}
      {data.value.constructorArgs.length < data.type.constructorArgs.length && (
        <AddStatement
          id={`${data.id}_call_parameter`}
          onSelect={(statement) =>
            handleConstructorArgs(statement, data.value.constructorArgs.length)
          }
          iconProps={{ title: "Add parameter" }}
          config={{
            ...data.type.constructorArgs[data.value.constructorArgs.length],
            name: undefined,
          }}
        />
      )}
      <span className="self-end">{")"}</span>
    </div>
  );
};

export const InstanceInput = memo(forwardRef(InstanceInputComponent));
