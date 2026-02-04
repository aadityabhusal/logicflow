import { ArrayType, TupleType, Context, IData, IStatement } from "@/lib/types";
import { Statement } from "../Statement";
import { AddStatement } from "../AddStatement";
import { forwardRef, HTMLAttributes, memo, useCallback } from "react";
import {
  inferTypeFromValue,
  isDataOfType,
  getContextExpectedTypes,
} from "@/lib/utils";

export interface ArrayInputProps extends HTMLAttributes<HTMLDivElement> {
  data: IData<ArrayType | TupleType>;
  handleData: (data: IData<ArrayType | TupleType>) => void;
  context: Context;
}

const ArrayInputComponent = (
  { data, handleData, context, ...props }: ArrayInputProps,
  ref: React.ForwardedRef<HTMLDivElement>
) => {
  const isMultiline = data.value.length > 3;
  function handleUpdate(result: IStatement, index: number, remove?: boolean) {
    const newValue = [...data.value];
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
  }
  const getExpectedType = useCallback(
    (index: number = 0) => {
      return context.expectedType?.kind === "array"
        ? context.expectedType.elementType
        : context.expectedType?.kind === "tuple"
        ? context.expectedType.elements[index]
        : undefined;
    },
    [context.expectedType]
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
      {data.value.map((item, i, arr) => {
        return (
          <div
            key={item.id}
            style={{ display: "flex", marginLeft: isMultiline ? 8 : 0 }}
          >
            <Statement
              statement={item}
              handleStatement={(val, remove) => handleUpdate(val, i, remove)}
              context={{
                ...context,
                ...getContextExpectedTypes({
                  context,
                  expectedType: getExpectedType(i),
                }),
              }}
              options={{
                disableDelete:
                  isDataOfType(data, "tuple") && !!context.expectedType,
              }}
            />
            {i < arr.length - 1 ? <span>{","}</span> : null}
          </div>
        );
      })}
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
          config={{ type: getExpectedType() }}
        />
      )}
      <span>{"]"}</span>
    </div>
  );
};

export const ArrayInput = memo(forwardRef(ArrayInputComponent));
