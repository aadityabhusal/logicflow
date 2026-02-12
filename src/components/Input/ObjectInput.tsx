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
  const setNavigation = useNavigationStore((s) => s.setNavigation);

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

  const remainingOptionalProperties = useMemo(() => {
    const originalProperties =
      context.expectedType?.kind === "object"
        ? context.expectedType.properties
        : data.type.properties;
    return Object.entries(originalProperties).filter(
      ([key]) => !data.value.has(key)
    );
  }, [context.expectedType, data.type.properties, data.value]);

  const optionalKeyOptions = useMemo(() => {
    const oldKey = navigationId?.slice(data.id.length + 1);
    return remainingOptionalProperties.map(([key, type]) => ({
      value: key,
      entityType: "data" as const,
      type,
      onClick: () => {
        const newValue = new Map(data.value);
        const oldKeyValue = newValue.get(oldKey || "");
        if (!oldKeyValue || !oldKey) return;
        newValue.set(key, oldKeyValue);
        newValue.delete(oldKey);
        handleData({
          ...data,
          type: inferTypeFromValue(newValue, {
            ...context,
            expectedType: context.expectedType ?? data.type,
          }),
          value: newValue,
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
      {Array.from(data.value).map(([key, value], i, arr) => {
        const isOptional = !data.type.required?.includes(key);
        const expectedType =
          context.expectedType?.kind === "object"
            ? context.expectedType.properties[key]
            : undefined;
        const isKeyInputFocused = navigationId === `${data.id}_${key}`;
        return (
          <div
            key={value.id}
            className={["relative flex", isMultiline ? "ml-2" : ""].join(" ")}
          >
            {context.expectedType ? (
              <Dropdown
                id={`${data.id}_${key}`}
                value={key}
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
                value={key}
                onChange={(value) => handleKeyUpdate(arr, i, value)}
              />
            )}
            <IconButton
              ref={(elem) => {
                if (navigationId === `${data.id}_${key}_colon`) elem?.focus();
              }}
              icon={
                isOptional ? FaQuestion : () => <span className="px-1">:</span>
              }
              className={[
                "hover:outline hover:outline-border",
                navigationId === `${data.id}_${key}_colon`
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
                  ? [...(data.type.required ?? []), key]
                  : (data.type.required ?? []).filter((k) => k !== key);
                handleData({ ...data, type: { ...data.type, required } });
                setNavigation(() => ({
                  navigation: { id: `${data.id}_${key}_colon` },
                }));
              }}
            />
            <Statement
              statement={value}
              handleStatement={(val, remove) =>
                handleUpdate(arr, i, val, remove)
              }
              context={{
                ...context,
                ...getContextExpectedTypes({ context, expectedType }),
              }}
              options={{
                disableDelete: !!context.expectedType && !isOptional,
              }}
            />
            {i < arr.length - 1 ? <span>{","}</span> : null}
          </div>
        );
      })}
      {(!context.expectedType || remainingOptionalProperties.length > 0) && (
        <AddStatement
          id={data.id}
          onSelect={(value) => {
            if (!data.value.has("")) {
              const newMap = new Map(data.value);
              newMap.set(
                remainingOptionalProperties[0]
                  ? remainingOptionalProperties[0][0]
                  : createVariableName({
                      prefix: "key",
                      prev: Array.from(data.value.keys()),
                    }),
                { ...value, name: undefined }
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
          iconProps={{ title: "Add object item" }}
          config={
            remainingOptionalProperties[0]
              ? {
                  type: remainingOptionalProperties[0][1],
                  name: remainingOptionalProperties[0][0],
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
