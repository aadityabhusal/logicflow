import { forwardRef, HTMLAttributes, memo, useCallback, useMemo } from "react";
import { ConditionType, IData, IStatement } from "@/lib/types";
import {
  getStatementsResultType,
  isTypeCompatible,
  resolveUnionType,
} from "@/lib/utils";
import { Statement } from "../Statement";
import { AddStatement } from "../AddStatement";
import { Context } from "@/lib/execution/types";
import { EntityPath } from "@/lib/types";
import { getEntityLayout } from "@/lib/layout";

interface ConditionInputProps extends HTMLAttributes<HTMLDivElement> {
  data: IData<ConditionType>;
  handleData: (data: IData<ConditionType>) => void;
  context: Context;
  basePath: EntityPath;
  isTopLevelStatement?: boolean;
}

type BranchName = "trueBranch" | "falseBranch";

const ConditionInputComponent = (
  {
    data,
    handleData,
    context,
    basePath,
    isTopLevelStatement,
    ...props
  }: ConditionInputProps,
  ref: React.ForwardedRef<HTMLDivElement>
) => {
  const conditionPath = useMemo(() => [...basePath, "condition"], [basePath]);

  const branchPaths = useMemo(
    () => ({
      trueBranch: data.value.trueBranch.map((_, i) =>
        basePath.concat("trueBranch", i)
      ),
      falseBranch: data.value.falseBranch.map((_, i) =>
        basePath.concat("falseBranch", i)
      ),
    }),
    [basePath, data.value.trueBranch, data.value.falseBranch]
  );
  const multiline = getEntityLayout(data) === "multiline";

  const handleChange = useCallback(
    (overrides: Partial<typeof data.value>) => {
      const value = { ...data.value, ...overrides };
      const trueType = getStatementsResultType(value.trueBranch, context);
      const falseType = getStatementsResultType(value.falseBranch, context);
      const result = resolveUnionType(
        isTypeCompatible(trueType, falseType, context)
          ? [trueType]
          : [trueType, falseType]
      );
      handleData({ ...data, type: { kind: "condition", result }, value });
    },
    [data, handleData, context]
  );

  const handleConditionChange = useCallback(
    (val: IStatement) => handleChange({ condition: val }),
    [handleChange]
  );

  const handleBranchStatement = useCallback(
    (branch: BranchName, index: number, stmt: IStatement, remove?: boolean) => {
      const arr = [...data.value[branch]];
      if (remove) {
        if (arr.length <= 1) return;
        arr.splice(index, 1);
      } else {
        arr[index] = stmt;
      }
      handleChange({ [branch]: arr });
    },
    [data.value, handleChange]
  );

  const addBranchStatement = useCallback(
    (
      branch: BranchName,
      stmt: IStatement,
      position: "before" | "after",
      currentId?: string
    ) => {
      const arr = [...data.value[branch]];
      const idx = currentId ? arr.findIndex((s) => s.id === currentId) : -1;
      const at =
        idx === -1
          ? position === "after"
            ? arr.length
            : 0
          : idx + (position === "after" ? 1 : 0);
      arr.splice(at, 0, stmt);
      handleChange({ [branch]: arr });
    },
    [data.value, handleChange]
  );

  const renderBranch = (branch: BranchName, separator: string) => {
    const statements = data.value[branch];
    return (
      <>
        <span>{separator}</span>
        <div className={["border-l ml-2 pl-2 flex flex-col gap-1"].join(" ")}>
          {statements.map((stmt, i) => (
            <div key={stmt.id} className="flex items-start gap-1">
              <Statement
                statement={stmt}
                path={branchPaths[branch][i]}
                handleStatement={(s, r) =>
                  handleBranchStatement(branch, i, s, r)
                }
                enableVariable={isTopLevelStatement}
                addStatement={
                  isTopLevelStatement
                    ? (s, pos, id) => addBranchStatement(branch, s, pos, id)
                    : undefined
                }
                disableNameToggle={!isTopLevelStatement}
                disableDelete={statements.length <= 1}
              />
              {i + 1 < statements.length && (
                <span className="text-border">;</span>
              )}
            </div>
          ))}
          {isTopLevelStatement && (
            <AddStatement
              id={`${data.id}_${branch}`}
              onSelect={(stmt) => addBranchStatement(branch, stmt, "after")}
              iconProps={{
                title: `Add statement to ${branch === "trueBranch" ? "true" : "false"} branch`,
              }}
            />
          )}
        </div>
      </>
    );
  };

  return (
    <div
      {...props}
      ref={ref}
      className={[
        "flex items-start gap-1 [&>span]:text-method",
        multiline ? "flex-col" : "flex-row",
        props?.className,
      ].join(" ")}
    >
      <Statement
        statement={data.value.condition}
        path={conditionPath}
        handleStatement={handleConditionChange}
        disableNameToggle={true}
        disableDelete={true}
      />
      {renderBranch("trueBranch", "?")}
      {renderBranch("falseBranch", ":")}
    </div>
  );
};

export const ConditionInput = memo(forwardRef(ConditionInputComponent));
