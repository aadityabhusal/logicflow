import { Context, IData, IStatement, DictionaryType } from "@/lib/types";
import { Statement } from "../Statement";
import { BaseInput } from "./BaseInput";
import { AddStatement } from "../AddStatement";
import { forwardRef, HTMLAttributes, memo } from "react";
import {
  createVariableName,
  inferTypeFromValue,
  getChildContext,
} from "@/lib/utils";
import { useNavigationStore } from "@/lib/store";

export interface DictionaryInputProps extends HTMLAttributes<HTMLDivElement> {
  data: IData<DictionaryType>;
  handleData: (data: IData<DictionaryType>) => void;
  context: Context;
}
const DictionaryInputComponent = (
  { data, handleData, context, ...props }: DictionaryInputProps,
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
      type: inferTypeFromValue(newValue, {
        ...context,
        expectedType: context.expectedType ?? data.type,
      }),
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
        type: inferTypeFromValue(newValue, {
          ...context,
          expectedType: context.expectedType ?? data.type,
        }),
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
        const isKeyInputFocused = navigationId === `${data.id}_${key}`;
        const childContext = getChildContext(context);
        return (
          <div
            key={value.id}
            className={["flex", isMultiline ? "ml-2" : ""].join(" ")}
          >
            <BaseInput
              ref={(elem) => isKeyInputFocused && elem?.focus()}
              className={[
                "text-property",
                isKeyInputFocused ? "outline outline-border" : "",
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
                ...childContext,
                expectedType:
                  childContext.expectedType?.kind === "dictionary"
                    ? childContext.expectedType.elementType
                    : undefined,
              }}
            />
            {i < arr.length - 1 ? <span>{","}</span> : null}
          </div>
        );
      })}
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
              type: inferTypeFromValue(newMap, {
                ...context,
                expectedType: context.expectedType ?? data.type,
              }),
              value: newMap,
            });
          }
        }}
        iconProps={{ title: "Add dictionary item" }}
        config={{
          type:
            context.expectedType?.kind === "dictionary"
              ? context.expectedType.elementType
              : data.type.elementType,
        }}
      />
      <span>{"}"}</span>
    </div>
  );
};

export const DictionaryInput = memo(forwardRef(DictionaryInputComponent));
