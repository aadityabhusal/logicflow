import { forwardRef, HTMLAttributes, memo } from "react";
import { ConditionType, Context, IData, IStatement } from "@/lib/types";
import {
  getStatementResult,
  isTypeCompatible,
  resolveUnionType,
} from "@/lib/utils";
import { Statement } from "../Statement";

export interface ConditionInputProps extends HTMLAttributes<HTMLDivElement> {
  data: IData<ConditionType>;
  handleData: (data: IData<ConditionType>) => void;
  context: Context;
}

const ConditionInputComponent = (
  { data, handleData, context, ...props }: ConditionInputProps,
  ref: React.ForwardedRef<HTMLDivElement>
) => {
  function handleUpdate(key: "condition" | "true" | "false", val: IStatement) {
    const value = { ...data.value, [key]: val };
    const trueType = getStatementResult(value.true, context.getResult).type;
    const falseType = getStatementResult(value.false, context.getResult).type;
    const unionType = resolveUnionType(
      isTypeCompatible(trueType, falseType) ? [trueType] : [trueType, falseType]
    );
    handleData({
      ...data,
      type: { kind: "condition", result: unionType },
      value,
    });
  }

  return (
    <div
      {...props}
      ref={ref}
      className={[
        "flex items-start gap-1 [&>span]:text-method",
        props?.className,
      ].join(" ")}
    >
      <Statement
        statement={data.value.condition}
        handleStatement={(val) => handleUpdate("condition", val)}
        context={context}
        options={{ disableDelete: true }}
      />
      <span>{"?"}</span>
      <Statement
        statement={data.value.true}
        handleStatement={(val) => handleUpdate("true", val)}
        options={{ disableDelete: true }}
        context={context}
      />
      <span>{":"}</span>
      <Statement
        statement={data.value.false}
        handleStatement={(val) => handleUpdate("false", val)}
        context={context}
        options={{ disableDelete: true }}
      />
    </div>
  );
};

export const ConditionInput = memo(forwardRef(ConditionInputComponent));
