import { IData, IStatement, DataType } from "../lib/types";
import { ArrayInput } from "./Input/ArrayInput";
import { ObjectInput } from "./Input/ObjectInput";
import { BooleanInput } from "./Input/BooleanInput";
import { Dropdown } from "./Dropdown";
import {
  createDefaultValue,
  getDataDropdownList,
  getTypeSignature,
  isDataOfType,
  isObject,
} from "../lib/utils";
import {
  ComponentProps,
  HTMLAttributes,
  memo,
  useCallback,
  useMemo,
} from "react";
import { BaseInput } from "./Input/BaseInput";
import { isNumberLike } from "@mantine/core";
import { DataTypes } from "../lib/data";
import { ConditionInput } from "./Input/ConditionInput";
import { UnionInput } from "./Input/UnionInput";
import { Operation } from "./Operation";
import { ErrorInput } from "./Input/ErrorInput";
import { DictionaryInput } from "./Input/Dictionary";
import { InstanceInput } from "./Input/InstanceInput";
import { useNavigationStore } from "@/lib/store";
import { Context } from "@/lib/execution/types";
import { OperationType } from "../lib/types";
import { EntityPath } from "@/lib/types";

interface IDropdownTargetProps extends Omit<
  HTMLAttributes<HTMLElement>,
  "onChange" | "defaultValue"
> {
  onChange?: (value: string) => void;
}

interface IProps {
  data: IData;
  disableDelete?: boolean;
  addOperationCall?: (data: IData) => void;
  handleChange(item: IStatement["data"], remove?: boolean): void;
  context: Context;
  basePath: EntityPath;
}

const DataComponent = ({
  data,
  disableDelete,
  addOperationCall,
  handleChange,
  context,
  basePath,
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

  const handleNumberChange = useCallback(
    (val: number) => {
      handleChange({ ...data, value: Number(val) });
    },
    [data, handleChange]
  );

  const handleDelete = useMemo(() => {
    if (disableDelete) return undefined;
    return () => handleChange(data, true);
  }, [disableDelete, handleChange, data]);

  const handleAddOperationCall = useCallback(
    (_data?: IData) => addOperationCall?.(_data ?? data),
    [addOperationCall, data]
  );

  const handleOperationChange = useCallback(
    (
      updater: (prev: IData<OperationType>) => IData<OperationType> | null,
      remove?: boolean
    ) => {
      if (remove) {
        handleChange(data, true);
        return;
      }
      const newOperation = updater(data as IData<OperationType>);
      if (newOperation) {
        handleChange(newOperation);
      }
    },
    [data, handleChange]
  );

  const nestedPath = useMemo(() => [...basePath, "data", "value"], [basePath]);

  return (
    <Dropdown
      id={data.id}
      data={data}
      items={dropdownItems}
      handleDelete={!disableDelete ? handleDelete : undefined}
      addOperationCall={addOperationCall ? handleAddOperationCall : undefined}
      handleChange={handleChange}
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
            handleChange={handleOperationChange}
            context={context}
            path={nestedPath}
          />
        ) : isDataOfType(data, "array") || isDataOfType(data, "tuple") ? (
          <ArrayInput
            data={data}
            handleData={handleChange}
            context={context}
            basePath={nestedPath}
            onClick={props.onClick}
          />
        ) : isDataOfType(data, "object") ? (
          <ObjectInput
            data={data}
            handleData={handleChange}
            context={context}
            basePath={nestedPath}
            onClick={props.onClick}
          />
        ) : isDataOfType(data, "dictionary") ? (
          <DictionaryInput
            data={data}
            handleData={handleChange}
            context={context}
            basePath={nestedPath}
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
            onChange={handleNumberChange}
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
              ...(props as ComponentProps<typeof BaseInput>).options,
            }}
          />
        ) : isDataOfType(data, "condition") ? (
          <ConditionInput
            data={data}
            handleData={handleChange}
            context={context}
            basePath={nestedPath}
            onClick={props.onClick}
          />
        ) : isDataOfType(data, "union") ? (
          <UnionInput
            data={data}
            handleData={handleChange}
            context={context}
            basePath={nestedPath}
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
            basePath={nestedPath}
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
