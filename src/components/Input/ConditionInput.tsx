import { forwardRef, HTMLAttributes, memo, useCallback, useMemo } from "react";
import { ConditionType, IData, IStatement } from "@/lib/types";
import {
  getStatementResult,
  isTypeCompatible,
  resolveUnionType,
} from "@/lib/utils";
import { Statement } from "../Statement";
import { Context } from "@/lib/execution/types";
import { EntityPath } from "@/lib/types";
import { getEntityLayout } from "@/lib/layout";

interface ConditionInputProps extends HTMLAttributes<HTMLDivElement> {
  data: IData<ConditionType>;
  handleData: (data: IData<ConditionType>) => void;
  context: Context;
  basePath: EntityPath;
}

const ConditionInputComponent = (
  { data, handleData, context, basePath, ...props }: ConditionInputProps,
  ref: React.ForwardedRef<HTMLDivElement>
) => {
  const conditionPath = useMemo(() => [...basePath, "condition"], [basePath]);
  const truePath = useMemo(() => [...basePath, "true"], [basePath]);
  const falsePath = useMemo(() => [...basePath, "false"], [basePath]);

  const handleUpdate = useCallback(
    (key: "condition" | "true" | "false", val: IStatement) => {
      const value = { ...data.value, [key]: val };
      const trueType = getStatementResult(value.true, context).type;
      const falseType = getStatementResult(value.false, context).type;
      const unionType = resolveUnionType(
        isTypeCompatible(trueType, falseType, context)
          ? [trueType]
          : [trueType, falseType]
      );
      handleData({
        ...data,
        type: { kind: "condition", result: unionType },
        value,
      });
    },
    [context, data, handleData]
  );

  const handleConditionChange = useCallback(
    (val: IStatement) => handleUpdate("condition", val),
    [handleUpdate]
  );

  const handleTrueChange = useCallback(
    (val: IStatement) => handleUpdate("true", val),
    [handleUpdate]
  );

  const handleFalseChange = useCallback(
    (val: IStatement) => handleUpdate("false", val),
    [handleUpdate]
  );

  const isMultiline = getEntityLayout(data) === "multiline";

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
      <Statement
        statement={data.value.condition}
        path={conditionPath}
        handleStatement={handleConditionChange}
        disableDelete={true}
      />
      <span>{"?"}</span>
      <Statement
        statement={data.value.true}
        path={truePath}
        handleStatement={handleTrueChange}
        disableDelete={true}
      />
      <span>{":"}</span>
      <Statement
        statement={data.value.false}
        path={falsePath}
        handleStatement={handleFalseChange}
        disableDelete={true}
      />
    </div>
  );
};

export const ConditionInput = memo(forwardRef(ConditionInputComponent));
