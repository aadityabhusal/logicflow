import { ArrayType, TupleType, IData, IStatement } from "@/lib/types";
import { Statement } from "../Statement";
import { AddStatement } from "../AddStatement";
import { forwardRef, HTMLAttributes, memo, useCallback, useMemo } from "react";
import { inferTypeFromValue, isDataOfType } from "@/lib/utils";
import { Context } from "@/lib/execution/types";
import { EntityPath } from "@/lib/types";

interface ArrayInputProps extends HTMLAttributes<HTMLDivElement> {
  data: IData<ArrayType | TupleType>;
  handleData: (data: IData<ArrayType | TupleType>) => void;
  context: Context;
  basePath: EntityPath;
}

const ArrayInputComponent = (
  { data, handleData, context, basePath, ...props }: ArrayInputProps,
  ref: React.ForwardedRef<HTMLDivElement>
) => {
  const isMultiline = data.value.length > 3;

  const itemPaths = useMemo(() => {
    const arr = Array.from({ length: data.value.length });
    return arr.map((_, i) => [...basePath, i]);
  }, [basePath, data.value.length]);

  const handleStatement = useCallback(
    (result: IStatement, remove?: boolean) => {
      const newValue = [...data.value];
      const index = newValue.findIndex((item) => item.id === result.id);
      if (remove) newValue.splice(index, 1);
      else newValue[index] = result;
      handleData({
        ...data,
        type: inferTypeFromValue(newValue, {
          ...context,
          expectedType: context.expectedType ?? data.type,
        }),
        value: newValue,
      });
    },
    [data, handleData, context]
  );

  return (
    <div
      {...props}
      ref={ref}
      className={[
        "flex items-start gap-1 [&>span]:text-method",
        isMultiline ? "flex-col" : "flex-row",
        props?.className,
      ].join(" ")}
    >
      <span>{"["}</span>
      {data.value.map((item, i, arr) => (
        <div
          key={item.id}
          style={{ display: "flex", marginLeft: isMultiline ? 8 : 0 }}
        >
          <Statement
            statement={item}
            path={itemPaths[i]}
            handleStatement={handleStatement}
            disableDelete={
              isDataOfType(data, "tuple") && !!context.expectedType
            }
          />
          {i < arr.length - 1 ? <span>{","}</span> : null}
        </div>
      ))}
      {(isDataOfType(data, "array") || !context.expectedType) && (
        <AddStatement
          id={data.id}
          onSelect={(value) => {
            const newVal = [...data.value, value];
            handleData({
              ...data,
              type: inferTypeFromValue(newVal, {
                ...context,
                expectedType: context.expectedType ?? data.type,
              }),
              value: newVal,
            });
          }}
          iconProps={{ title: "Add array item" }}
          config={{
            type:
              context.expectedType?.kind === "array"
                ? context.expectedType.elementType
                : context.expectedType?.kind === "tuple"
                  ? context.expectedType.elements[0]
                  : undefined,
          }}
        />
      )}
      <span>{"]"}</span>
    </div>
  );
};

export const ArrayInput = memo(forwardRef(ArrayInputComponent));
