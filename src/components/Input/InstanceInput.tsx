import { IData, InstanceDataType, IStatement } from "@/lib/types";
import { Statement } from "../Statement";
import { BaseInput } from "./BaseInput";
import { AddStatement } from "../AddStatement";
import { Context } from "@/lib/execution/types";
import { EntityPath } from "@/lib/types";
import { forwardRef, memo, useCallback, useMemo } from "react";
import { inferTypeFromValue } from "@/lib/utils";
import { getEntityLayout } from "@/lib/layout";

interface InstanceInputProps {
  data: IData<InstanceDataType>;
  handleData: (data: IData<InstanceDataType>) => void;
  context: Context;
  onChange?: (value: string) => void;
  basePath: EntityPath;
}

const InstanceInputComponent = (
  {
    data,
    handleData,
    onChange,
    basePath,
    context,
    ...props
  }: InstanceInputProps,
  ref: React.ForwardedRef<HTMLInputElement>
) => {
  const argPaths = useMemo(() => {
    const arr = Array.from({ length: data.value.constructorArgs.length });
    return arr.map((_, i) => [...basePath, "constructorArgs", i]);
  }, [basePath, data.value.constructorArgs.length]);

  const handleConstructorArgs = useCallback(
    (item: IStatement, remove?: boolean) => {
      const constructorArgs = [...data.value.constructorArgs];
      const _index = constructorArgs.findIndex((arg) => arg.id === item.id);
      const index = _index === -1 ? constructorArgs.length : _index;
      if (remove) constructorArgs.splice(index, 1);
      else constructorArgs[index] = item;
      const newValue = { ...data.value, constructorArgs };
      handleData({
        ...data,
        type: inferTypeFromValue(newValue, context),
        value: newValue,
      });
    },
    [data, handleData, context]
  );

  const isMultiline = getEntityLayout(data) === "multiline";

  return (
    <div
      className={[
        "flex items-start gap-1",
        isMultiline ? "flex-col" : "flex-row",
      ].join(" ")}
    >
      <div className="flex items-start gap-1">
        <BaseInput
          {...props}
          ref={ref}
          className="text-type"
          onChange={onChange}
        />
        <span>{"("}</span>
      </div>
      <div
        className={[
          "flex items-start gap-1",
          isMultiline ? "flex-col ml-2" : "flex-row",
        ].join(" ")}
      >
        {data.value.constructorArgs.map((item, paramIndex, arr) => (
          <div
            key={item.id}
            className={isMultiline ? "flex items-start" : "flex items-start"}
          >
            <Statement
              statement={item}
              path={argPaths[paramIndex]}
              handleStatement={handleConstructorArgs}
              disableDelete={!item.isOptional}
            />
            {paramIndex < arr.length - 1 ? (
              <span>{isMultiline ? "," : ", "}</span>
            ) : null}
          </div>
        ))}
        {data.value.constructorArgs.length <
          data.type.constructorArgs.length && (
          <AddStatement
            id={`${data.id}_call_parameter`}
            onSelect={(statement) => handleConstructorArgs(statement)}
            iconProps={{ title: "Add parameter" }}
            config={{
              ...data.type.constructorArgs[data.value.constructorArgs.length],
              name: undefined,
            }}
          />
        )}
        <span className="self-end">{")"}</span>
      </div>
    </div>
  );
};

export const InstanceInput = memo(forwardRef(InstanceInputComponent));
