import { IData, Context, InstanceType, IStatement } from "@/lib/types";
import { forwardRef, HTMLAttributes, memo } from "react";
import { Statement } from "../Statement";

export interface InstanceInputProps extends HTMLAttributes<HTMLDivElement> {
  data: IData<InstanceType>;
  handleData: (data: IData<InstanceType>) => void;
  context: Context;
}

const InstanceInputComponent = (
  { data, handleData, context, ...props }: InstanceInputProps,
  ref: React.ForwardedRef<HTMLDivElement>
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
    <div {...props} ref={ref} className="flex items-center gap-1">
      <span>{data.type.className}</span>
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
