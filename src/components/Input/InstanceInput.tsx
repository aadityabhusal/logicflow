import { IData, InstanceDataType, IStatement } from "@/lib/types";
import { Statement } from "../Statement";
import { BaseInput } from "./BaseInput";
import { AddStatement } from "../AddStatement";
import { Context } from "@/lib/execution/types";
import { EntityPath } from "@/lib/types";
import { forwardRef, memo, useCallback, useMemo } from "react";

interface InstanceInputProps {
  data: IData<InstanceDataType>;
  handleData: (data: IData<InstanceDataType>) => void;
  context: Context;
  onChange?: (value: string) => void;
  basePath: EntityPath;
}

const InstanceInputComponent = (
  { data, handleData, onChange, basePath, ...props }: InstanceInputProps,
  ref: React.ForwardedRef<HTMLInputElement>
) => {
  const argPaths = useMemo(() => {
    const arr = Array.from({ length: data.value.constructorArgs.length });
    return arr.map((_, i) => [...basePath, "constructorArgs", i]);
  }, [basePath, data.value.constructorArgs.length]);

  const handleConstructorArgs = useCallback(
    (item: IStatement, remove?: boolean) => {
      const constructorArgs = [...data.value.constructorArgs];
      const index = constructorArgs.findIndex((arg) => arg.id === item.id);
      if (remove) constructorArgs.splice(index, 1);
      else constructorArgs[index] = item;
      handleData({ ...data, value: { ...data.value, constructorArgs } });
    },
    [data, handleData]
  );

  return (
    <div className="flex items-start gap-1">
      <BaseInput
        {...props}
        ref={ref}
        className="text-type"
        onChange={onChange}
      />
      <span>{"("}</span>
      {data.value.constructorArgs.map((item, paramIndex, arr) => (
        <span key={item.id} className="flex">
          <Statement
            statement={item}
            path={argPaths[paramIndex]}
            handleStatement={handleConstructorArgs}
            disableDelete={!item.isOptional}
          />
          {paramIndex < arr.length - 1 ? <span>{", "}</span> : null}
        </span>
      ))}
      {data.value.constructorArgs.length < data.type.constructorArgs.length && (
        <AddStatement
          id={`${data.id}_call_parameter`}
          onSelect={(statement) => handleConstructorArgs(statement, undefined)}
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
