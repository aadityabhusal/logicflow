import { IData, IStatement, DictionaryType } from "@/lib/types";
import { Statement } from "../Statement";
import { BaseInput } from "./BaseInput";
import { AddStatement } from "../AddStatement";
import { forwardRef, HTMLAttributes, memo, useCallback, useMemo } from "react";
import { createVariableName, inferTypeFromValue } from "@/lib/utils";
import { useNavigationStore } from "@/lib/store";
import { Context } from "@/lib/execution/types";
import { EntityPath } from "@/lib/types";
import { getEntityLayout } from "@/lib/layout";

interface DictionaryInputProps extends HTMLAttributes<HTMLDivElement> {
  data: IData<DictionaryType>;
  handleData: (data: IData<DictionaryType>) => void;
  context: Context;
  basePath: EntityPath;
}

const DictionaryInputComponent = (
  { data, handleData, context, basePath, ...props }: DictionaryInputProps,
  ref: React.ForwardedRef<HTMLDivElement>
) => {
  const isMultiline = getEntityLayout(data) === "multiline";
  const navigationId = useNavigationStore((s) => s.navigation?.id);
  const isDisabled = useNavigationStore((s) => s.navigation?.disable);
  const setNavigation = useNavigationStore((s) => s.setNavigation);

  const entryPaths = useMemo(() => {
    const arr = Array.from({ length: data.value.entries.length });
    return arr.map((_, i) => [...basePath, "entries", i, "value"]);
  }, [basePath, data.value.entries.length]);

  const handleUpdate = useCallback(
    (result: IStatement, remove?: boolean) => {
      const newEntries = [...data.value.entries];
      const index = newEntries.findIndex((e) => e.value.id === result.id);
      if (remove) newEntries.splice(index, 1);
      else newEntries[index] = { ...newEntries[index], value: result };

      handleData({
        ...data,
        type: inferTypeFromValue({ entries: newEntries }, context),
        value: { entries: newEntries },
      });
    },
    [data, handleData, context]
  );

  function handleKeyUpdate(index: number, newKey: string) {
    const existingKey = data.value.entries.some(
      (e, i) => i !== index && e.key === newKey
    );
    if (typeof newKey === "string" && !existingKey) {
      const newEntries = [...data.value.entries];
      newEntries[index] = { ...newEntries[index], key: newKey };
      handleData({
        ...data,
        type: inferTypeFromValue({ entries: newEntries }, context),
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
        const isKeyInputFocused = navigationId === `${data.id}_key_${i}`;
        return (
          <div
            key={entry.value.id}
            className={[
              "flex items-start",
              isMultiline ? "ml-2 mt-1" : "",
            ].join(" ")}
          >
            <BaseInput
              ref={(elem) => isKeyInputFocused && !isDisabled && elem?.focus()}
              className={[
                "text-property",
                isKeyInputFocused ? "outline outline-border" : "",
              ].join(" ")}
              value={entry.key}
              onChange={(value) => handleKeyUpdate(i, value)}
              onFocus={() =>
                setNavigation({ navigation: { id: `${data.id}_key_${i}` } })
              }
            />
            <span style={{ marginRight: 4 }}>:</span>
            <Statement
              statement={entry.value}
              path={entryPaths[i]}
              handleStatement={handleUpdate}
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
            type: inferTypeFromValue({ entries: newEntries }, context),
            value: { entries: newEntries },
          });
        }}
        iconProps={{ title: "Add dictionary item" }}
        config={{
          type:
            context.expectedType?.kind === "dictionary"
              ? context.expectedType.elementType
              : undefined,
        }}
      />
      <span>{"}"}</span>
    </div>
  );
};

export const DictionaryInput = memo(forwardRef(DictionaryInputComponent));
