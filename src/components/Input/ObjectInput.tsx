import { Context, IData, IStatement, ObjectType } from "../../lib/types";
import { Statement } from "../Statement";
import { BaseInput } from "./BaseInput";
import { AddStatement } from "../AddStatement";
import { forwardRef, HTMLAttributes, memo } from "react";
import { createVariableName, inferTypeFromValue } from "../../lib/utils";
import { useNavigationStore } from "@/lib/store";

export interface ObjectInputProps extends HTMLAttributes<HTMLDivElement> {
  data: IData<ObjectType>;
  handleData: (data: IData<ObjectType>) => void;
  context: Context;
}
const ObjectInputComponent = (
  { data, handleData, context, ...props }: ObjectInputProps,
  ref: React.ForwardedRef<HTMLDivElement>
) => {
  const isMultiline = data.value.size > 2;
  const navigationId = useNavigationStore((s) => s.navigation?.id);

  function handleUpdate(
    dataArray: [string, IStatement][],
    index: number,
    result: IStatement,
    remove?: boolean
  ) {
    if (remove) dataArray.splice(index, 1);
    else dataArray[index] = [dataArray[index][0], result];
    const newValue = new Map(dataArray);
    handleData({
      ...data,
      type: inferTypeFromValue(newValue),
      value: newValue,
    });
  }

  function handleKeyUpdate(
    dataArray: [string, IStatement][],
    index: number,
    value: string
  ) {
    if (typeof value === "string" && !data.value.has(value)) {
      dataArray[index] = [value, dataArray[index][1]];
      const newValue = new Map(dataArray);
      handleData({
        ...data,
        type: inferTypeFromValue(newValue),
        value: newValue,
      });
    }
  }

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
      <span>{"{"}</span>
      {Array.from(data.value).map(([key, value], i, arr) => {
        const isNameFocused = navigationId === `${value.id}_key`;
        return (
          <div
            key={value.id}
            style={{ display: "flex", marginLeft: isMultiline ? 8 : 0 }}
          >
            <BaseInput
              ref={(elem) => isNameFocused && elem?.focus()}
              className={[
                "text-property",
                isNameFocused ? "outline outline-border" : "",
              ].join(" ")}
              value={key}
              onChange={(value) => handleKeyUpdate(arr, i, value)}
            />
            <span style={{ marginRight: 4 }}>:</span>
            <Statement
              statement={value}
              handleStatement={(val, remove) =>
                handleUpdate(arr, i, val, remove)
              }
              context={{
                ...context,
                expectedType:
                  context.expectedType?.kind === "object"
                    ? context.expectedType.properties[key]
                    : undefined,
              }}
            />
            {i < arr.length - 1 ? <span>{","}</span> : null}
          </div>
        );
      })}
      {!context.expectedType && (
        <AddStatement
          id={data.id}
          onSelect={(value) => {
            if (!data.value.has("")) {
              const newMap = new Map(data.value);
              newMap.set(
                createVariableName({
                  prefix: "key",
                  prev: Array.from(data.value.keys()),
                }),
                value
              );
              handleData({
                ...data,
                type: inferTypeFromValue(newMap),
                value: newMap,
              });
            }
          }}
          iconProps={{ title: "Add object item" }}
        />
      )}
      <span>{"}"}</span>
    </div>
  );
};

export const ObjectInput = memo(forwardRef(ObjectInputComponent));
