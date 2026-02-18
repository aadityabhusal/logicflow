import { Context, IData, IStatement, DictionaryType } from "@/lib/types";
import { Statement } from "../Statement";
import { BaseInput } from "./BaseInput";
import { AddStatement } from "../AddStatement";
import { forwardRef, HTMLAttributes, memo } from "react";
import {
  createVariableName,
  inferTypeFromValue,
  getContextExpectedTypes,
} from "@/lib/utils";
import { useNavigationStore } from "@/lib/store";

interface DictionaryInputProps extends HTMLAttributes<HTMLDivElement> {
  data: IData<DictionaryType>;
  handleData: (data: IData<DictionaryType>) => void;
  context: Context;
}
const DictionaryInputComponent = (
  { data, handleData, context, ...props }: DictionaryInputProps,
  ref: React.ForwardedRef<HTMLDivElement>
) => {
  const isMultiline = data.value.entries.length > 2;
  const navigationId = useNavigationStore((s) => s.navigation?.id);

  function handleUpdate(index: number, result: IStatement, remove?: boolean) {
    const newEntries = [...data.value.entries];
    if (remove) newEntries.splice(index, 1);
    else newEntries[index] = { ...newEntries[index], value: result };

    handleData({
      ...data,
      type: inferTypeFromValue(
        { entries: newEntries },
        { ...context, expectedType: context.expectedType ?? data.type }
      ),
      value: { entries: newEntries },
    });
  }

  function handleKeyUpdate(index: number, newKey: string) {
    const existingKey = data.value.entries.some(
      (e, i) => i !== index && e.key === newKey
    );
    if (typeof newKey === "string" && !existingKey) {
      const newEntries = [...data.value.entries];
      newEntries[index] = { ...newEntries[index], key: newKey };
      handleData({
        ...data,
        type: inferTypeFromValue(
          { entries: newEntries },
          { ...context, expectedType: context.expectedType ?? data.type }
        ),
        value: { entries: newEntries },
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
      {data.value.entries.map((entry, i) => {
        const isKeyInputFocused = navigationId === `${data.id}_${entry.key}`;
        return (
          <div
            key={entry.value.id}
            className={["flex", isMultiline ? "ml-2" : ""].join(" ")}
          >
            <BaseInput
              ref={(elem) => isKeyInputFocused && elem?.focus()}
              className={[
                "text-property",
                isKeyInputFocused ? "outline outline-border" : "",
              ].join(" ")}
              value={entry.key}
              onChange={(value) => handleKeyUpdate(i, value)}
            />
            <span style={{ marginRight: 4 }}>:</span>
            <Statement
              statement={entry.value}
              handleStatement={(val, remove) => handleUpdate(i, val, remove)}
              context={{
                ...context,
                ...getContextExpectedTypes({
                  context,
                  expectedType:
                    context.expectedType?.kind === "dictionary"
                      ? context.expectedType.elementType
                      : undefined,
                }),
              }}
            />
            {i < data.value.entries.length - 1 ? <span>{","}</span> : null}
          </div>
        );
      })}
      <AddStatement
        id={data.id}
        onSelect={(value) => {
          if (data.value.entries.some((e) => e.key === "")) return;
          const existingKeys = data.value.entries.map((e) => e.key);
          const newEntries = [
            ...data.value.entries,
            {
              key: createVariableName({ prefix: "key", prev: existingKeys }),
              value,
            },
          ];
          handleData({
            ...data,
            type: inferTypeFromValue(
              { entries: newEntries },
              { ...context, expectedType: context.expectedType ?? data.type }
            ),
            value: { entries: newEntries },
          });
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
