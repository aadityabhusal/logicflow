import { IData, Context, InstanceDataType, IStatement } from "@/lib/types";
import { forwardRef, memo } from "react";
import { Statement } from "../Statement";
import { BaseInput } from "./BaseInput";
import { IDropdownTargetProps } from "../Dropdown";

export interface InstanceInputProps extends IDropdownTargetProps {
  data: IData<InstanceDataType>;
  handleData: (data: IData<InstanceDataType>) => void;
  context: Context;
}

const InstanceInputComponent = (
  { data, handleData, context, onChange, ...props }: InstanceInputProps,
  ref: React.ForwardedRef<HTMLInputElement>
) => {
  function handleConstructorArgs(item: IStatement, index: number) {
    const constructorArgs = [...data.value.constructorArgs];
    constructorArgs[index] = item;
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
              handleStatement={(val) =>
                val && handleConstructorArgs(val, paramIndex)
              }
              options={{ disableDelete: true }}
              context={{
                ...context,
                expectedType: data.type.constructorArgs[paramIndex + 1],
              }}
            />
            {paramIndex < arr.length - 1 ? <span>{", "}</span> : null}
          </span>
        );
      })}
      <span className="self-end">{")"}</span>
    </div>
  );
};

export const InstanceInput = memo(forwardRef(InstanceInputComponent));
