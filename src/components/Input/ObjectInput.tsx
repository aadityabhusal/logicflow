import { Context, IData, IStatement, ObjectType } from "@/lib/types";
import { Statement } from "../Statement";
import { BaseInput } from "./BaseInput";
import { AddStatement } from "../AddStatement";
import { forwardRef, HTMLAttributes, memo, useMemo } from "react";
import {
  createVariableName,
  inferTypeFromValue,
  getContextExpectedTypes,
} from "@/lib/utils";
import { useNavigationStore } from "@/lib/store";
import { IconButton } from "@/ui/IconButton";
import { FaQuestion } from "react-icons/fa6";
import { Dropdown } from "../Dropdown";

interface ObjectInputProps extends HTMLAttributes<HTMLDivElement> {
  data: IData<ObjectType>;
  handleData: (data: IData<ObjectType>) => void;
  context: Context;
}
const ObjectInputComponent = (
  { data, handleData, context, ...props }: ObjectInputProps,
  ref: React.ForwardedRef<HTMLDivElement>
) => {
  const isMultiline = data.value.entries.length > 2;
  const navigationId = useNavigationStore((s) => s.navigation?.id);
  const setNavigation = useNavigationStore((s) => s.setNavigation);

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

  const remainingOptionalProperties = useMemo(() => {
    const originalProperties =
      context.expectedType?.kind === "object"
        ? context.expectedType.properties
        : data.type.properties;
    const existingKeys = data.value.entries.map((e) => e.key);
    return originalProperties.filter(({ key }) => !existingKeys.includes(key));
  }, [context.expectedType, data.type.properties, data.value]);

  const optionalKeyOptions = useMemo(() => {
    const oldKey = navigationId?.slice(data.id.length + 1);
    return remainingOptionalProperties.map(({ key, value }) => ({
      value: key,
      entityType: "data" as const,
      type: value,
      onClick: () => {
        const entryIndex = data.value.entries.findIndex(
          (e) => e.key === oldKey
        );
        if (entryIndex === -1 || !oldKey) return;
        const newEntries = data.value.entries.map((e, i) =>
          i === entryIndex ? { ...e, key } : e
        );
        handleData({
          ...data,
          type: inferTypeFromValue(
            { entries: newEntries },
            { ...context, expectedType: context.expectedType ?? data.type }
          ),
          value: { entries: newEntries },
        });
      },
    }));
  }, [navigationId, data, remainingOptionalProperties, handleData, context]);

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
        const isOptional = !data.type.required?.includes(entry.key);
        const expectedType =
          context.expectedType?.kind === "object"
            ? context.expectedType.properties.find((p) => p.key === entry.key)
                ?.value
            : undefined;
        const isKeyInputFocused = navigationId === `${data.id}_${entry.key}`;
        return (
          <div
            key={entry.value.id}
            className={["relative flex", isMultiline ? "ml-2" : ""].join(" ")}
          >
            {context.expectedType ? (
              <Dropdown
                id={`${data.id}_${entry.key}`}
                value={entry.key}
                items={
                  isOptional ? [["Properties", optionalKeyOptions]] : undefined
                }
                context={context}
                isInputTarget={true}
                target={(props) => (
                  <BaseInput {...props} className={"text-property"} />
                )}
              />
            ) : (
              <BaseInput
                ref={(elem) => isKeyInputFocused && elem?.focus()}
                className={[
                  "text-property",
                  isKeyInputFocused ? "outline outline-border" : "",
                ].join(" ")}
                value={entry.key}
                onChange={(value) => handleKeyUpdate(i, value)}
              />
            )}
            <IconButton
              ref={(elem) => {
                if (navigationId === `${data.id}_${entry.key}_colon`) {
                  elem?.focus();
                }
              }}
              icon={
                isOptional ? FaQuestion : () => <span className="px-1">:</span>
              }
              className={[
                "hover:outline hover:outline-border",
                navigationId === `${data.id}_${entry.key}_colon`
                  ? "outline outline-border"
                  : "",
                expectedType ? "text-disabled" : "",
              ].join(" ")}
              title={
                expectedType
                  ? isOptional
                    ? "Optional property"
                    : undefined
                  : isOptional
                  ? "Make required"
                  : "Make optional"
              }
              onClick={() => {
                if (expectedType) return;
                const required = isOptional
                  ? [...(data.type.required ?? []), entry.key]
                  : (data.type.required ?? []).filter((k) => k !== entry.key);
                handleData({ ...data, type: { ...data.type, required } });
                setNavigation(() => ({
                  navigation: { id: `${data.id}_${entry.key}_colon` },
                }));
              }}
            />
            <Statement
              statement={entry.value}
              handleStatement={(val, remove) => handleUpdate(i, val, remove)}
              context={{
                ...context,
                ...getContextExpectedTypes({ context, expectedType }),
              }}
              options={{
                disableDelete: !!context.expectedType && !isOptional,
              }}
            />
            {i < data.value.entries.length - 1 ? <span>{","}</span> : null}
          </div>
        );
      })}
      {(!context.expectedType || remainingOptionalProperties.length > 0) && (
        <AddStatement
          id={data.id}
          onSelect={(value) => {
            if (data.value.entries.some((e) => e.key === "")) return;
            const existingKeys = data.value.entries.map((e) => e.key);
            const newEntries = [
              ...data.value.entries,
              {
                key: remainingOptionalProperties[0]
                  ? remainingOptionalProperties[0].key
                  : createVariableName({
                      prefix: "key",
                      prev: existingKeys,
                    }),
                value: { ...value, name: undefined },
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
          iconProps={{ title: "Add object item" }}
          config={
            remainingOptionalProperties[0]
              ? {
                  type: remainingOptionalProperties[0].value,
                  name: remainingOptionalProperties[0].key,
                  isOptional: true,
                }
              : undefined
          }
        />
      )}
      <span>{"}"}</span>
    </div>
  );
};

export const ObjectInput = memo(forwardRef(ObjectInputComponent));
