import { IData, IStatement, DataType, Context } from "../lib/types";
import { ArrayInput } from "./Input/ArrayInput";
import { ObjectInput } from "./Input/ObjectInput";
import { BooleanInput } from "./Input/BooleanInput";
import { Dropdown, IDropdownTargetProps } from "./Dropdown";
import {
  createDefaultValue,
  getDataDropdownList,
  getTypeSignature,
  isDataOfType,
  isObject,
} from "../lib/utils";
import { memo, useMemo } from "react";
import { BaseInput, BaseInputProps } from "./Input/BaseInput";
import { isNumberLike } from "@mantine/core";
import { DataTypes } from "../lib/data";
import { ConditionInput } from "./Input/ConditionInput";
import { UnionInput } from "./Input/UnionInput";
import { Operation } from "./Operation";
import { ErrorInput } from "./Input/ErrorInput";
import { DictionaryInput } from "./Input/Dictionary";
import { InstanceInput } from "./Input/InstanceInput";
import { useNavigationStore } from "@/lib/store";

interface IProps {
  data: IData;
  disableDelete?: boolean;
  addOperationCall?: () => void;
  handleChange(item: IStatement["data"], remove?: boolean): void;
  context: Context;
}

const DataComponent = ({
  data,
  disableDelete,
  addOperationCall,
  handleChange,
  context,
}: IProps) => {
  const setNavigation = useNavigationStore((s) => s.setNavigation);
  const dropdownItems = useMemo(
    () => getDataDropdownList({ data, onSelect: handleChange, context }),
    [data, handleChange, context]
  );

  const dropdownOptions = useMemo(() => {
    const showDropdownIcon =
      isDataOfType(data, "array") ||
      isDataOfType(data, "tuple") ||
      isDataOfType(data, "object") ||
      isDataOfType(data, "dictionary") ||
      isDataOfType(data, "boolean") ||
      isDataOfType(data, "union") ||
      isDataOfType(data, "condition") ||
      isDataOfType(data, "operation") ||
      isDataOfType(data, "error");
    return {
      withDropdownIcon: showDropdownIcon,
      withSearch: showDropdownIcon,
      focusOnClick: showDropdownIcon,
    };
  }, [data]);

  return (
    <Dropdown
      id={data.id}
      data={data}
      items={dropdownItems}
      handleDelete={!disableDelete ? () => handleChange(data, true) : undefined}
      addOperationCall={addOperationCall}
      options={dropdownOptions}
      context={context}
      value={
        isDataOfType(data, "reference")
          ? data.value.name
          : getTypeSignature(data.type)
      }
      isInputTarget={
        isDataOfType(data, "reference") ||
        ["string", "number", "undefined", "instance"].includes(data.type.kind)
      }
      target={({ onChange, ...props }: IDropdownTargetProps) =>
        isDataOfType(data, "reference") ? (
          <BaseInput {...props} onChange={onChange} className="text-variable" />
        ) : isDataOfType(data, "operation") ? (
          <Operation
            operation={data}
            handleChange={handleChange}
            context={context}
          />
        ) : isDataOfType(data, "array") || isDataOfType(data, "tuple") ? (
          <ArrayInput
            data={data}
            handleData={handleChange}
            context={context}
            onClick={props.onClick}
          />
        ) : isDataOfType(data, "object") ? (
          <ObjectInput
            data={data}
            handleData={handleChange}
            context={context}
            onClick={props.onClick}
          />
        ) : isDataOfType(data, "dictionary") ? (
          <DictionaryInput
            data={data}
            handleData={handleChange}
            context={context}
            onClick={props.onClick}
          />
        ) : isDataOfType(data, "boolean") ? (
          <BooleanInput
            data={data}
            handleData={handleChange}
            onClick={props.onClick}
          />
        ) : isDataOfType(data, "number") ? (
          <BaseInput
            {...props}
            type="number"
            className="text-number"
            value={data.value}
            onChange={(val) => {
              handleChange({ ...data, value: Number(val) });
            }}
          />
        ) : isDataOfType(data, "string") ? (
          <BaseInput
            {...props}
            className="text-string"
            value={data.value}
            onChange={(val) => {
              onChange?.(val);
              handleChange({ ...data, value: val });
            }}
            options={{
              withQuotes: true,
              ...(props as BaseInputProps<string>).options,
            }}
          />
        ) : isDataOfType(data, "condition") ? (
          <ConditionInput
            data={data}
            handleData={handleChange}
            context={context}
            onClick={props.onClick}
          />
        ) : isDataOfType(data, "union") ? (
          <UnionInput
            data={data}
            handleData={handleChange}
            context={context}
            onClick={props.onClick}
          />
        ) : isDataOfType(data, "error") ? (
          <ErrorInput
            data={data}
            handleData={handleChange}
            context={context}
            onClick={props.onClick}
          />
        ) : isDataOfType(data, "instance") ? (
          <InstanceInput
            {...props}
            onChange={onChange}
            data={data}
            handleData={handleChange}
            context={context}
          />
        ) : (
          // Undefined type
          <BaseInput
            {...props}
            className="text-border"
            value={data.value?.toString() || ""}
            onChange={(_val) => {
              const transform = isNumberLike(_val)
                ? { type: "number", value: Number(_val.slice(0, 16)) }
                : _val.startsWith("[")
                ? {
                    type: "array",
                    value: createDefaultValue(DataTypes["array"].type),
                  }
                : _val.startsWith("{")
                ? {
                    type: "dictionary",
                    value: createDefaultValue(DataTypes["dictionary"].type),
                  }
                : _val
                ? { type: "string", value: _val }
                : { type: "undefined", value: undefined };
              onChange?.(_val);
              handleChange({
                ...data,
                type: DataTypes[transform.type as DataType["kind"]].type,
                value: transform.value,
              });
              if (Array.isArray(transform.value)) {
                const firstItem = transform.value[0];
                if (firstItem?.data?.id) {
                  setNavigation({ navigation: { id: firstItem.data.id } });
                }
              } else if (isObject(transform.value, ["entries"])) {
                const firstEntry = transform.value.entries[0];
                if (firstEntry) {
                  setNavigation({
                    navigation: { id: firstEntry.value.data.id },
                  });
                }
              }
            }}
          />
        )
      }
    />
  );
};

export const Data = memo(DataComponent);
