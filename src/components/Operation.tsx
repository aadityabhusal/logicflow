import {
  Fragment,
  forwardRef,
  HTMLAttributes,
  useCallback,
  memo,
  useMemo,
} from "react";
import { IData, IStatement, OperationType } from "../lib/types";
import { updateStatements } from "@/lib/update";
import { createVariableName, getOperationResultType } from "../lib/utils";
import { Statement } from "./Statement";
import { AddStatement } from "./AddStatement";
import { getReservedNames } from "@/lib/execution/store";
import { Context } from "@/lib/execution/types";

interface OperationInputProps extends HTMLAttributes<HTMLDivElement> {
  operation: IData<OperationType>;
  handleChange: (data: IData<OperationType>, remove?: boolean) => void;
  context: Context;
}

const OperationComponent = (
  { operation, handleChange, context, ...props }: OperationInputProps,
  ref: React.Ref<HTMLDivElement>
) => {
  const expectedParameterType = useMemo(
    () =>
      context.expectedType?.kind === "operation"
        ? context.expectedType.parameters
        : undefined,
    [context.expectedType]
  );

  const handleStatement = useCallback(
    ({
      statement,
      context,
      remove,
      parameterLength = operation.value.parameters.length,
    }: {
      statement: IStatement;
      context: Context;
      remove?: boolean;
      parameterLength?: number;
    }) => {
      const updatedStatements = updateStatements({
        statements: [
          ...operation.value.parameters,
          ...operation.value.statements,
        ],
        context,
        changedStatement: statement,
        removeStatement: remove,
      });

      const updatedParameters = updatedStatements.slice(0, parameterLength);
      const updatedStatementsList = updatedStatements.slice(parameterLength);

      handleChange({
        ...operation,
        type: {
          ...operation.type,
          parameters: updatedParameters.map((param) => {
            return {
              name: param.name,
              type: param.data.type,
              isOptional: param.isOptional,
              isRest: param.isRest,
            };
          }),
          result: getOperationResultType(updatedStatementsList, context),
        },
        value: {
          ...operation.value,
          isAsync: updatedStatementsList.some((statement) =>
            statement.operations.some((op) => op.value.name === "await")
          ),
          parameters: updatedParameters,
          statements: updatedStatementsList,
        },
      });
    },
    [handleChange, operation]
  );

  const addStatement = useCallback(
    (statement: IStatement, position: "before" | "after", index: number) => {
      const _index = position === "before" ? index : index + 1;
      const statements = operation.value.statements
        .slice(0, _index)
        .concat(statement)
        .concat(operation.value.statements.slice(_index));
      handleChange({
        ...operation,
        type: {
          ...operation.type,
          result: getOperationResultType(statements, context),
        },
        value: { ...operation.value, statements },
      });
    },
    [handleChange, operation, context]
  );

  const addParameter = useCallback(
    (statement: IStatement, position: "before" | "after", index: number) => {
      const _index = position === "before" ? index : index + 1;
      const newParameter = {
        ...statement,
        name:
          statement.name ??
          createVariableName({
            prefix: "param",
            prev: [
              ...getReservedNames(context),
              ...operation.value.parameters,
              ...operation.value.statements,
            ]
              .map((r) => r.name)
              .filter(Boolean) as string[],
          }),
      };
      const updatedParameters = operation.value.parameters
        .slice(0, _index)
        .concat(newParameter)
        .concat(operation.value.parameters.slice(_index));
      const updatedParametersTypes = updatedParameters.map((param) => {
        return {
          name: param.name,
          type: param.data.type,
          isOptional: param.isOptional,
          isRest: param.isRest,
        };
      });

      handleChange({
        ...operation,
        type: { ...operation.type, parameters: updatedParametersTypes },
        value: { ...operation.value, parameters: updatedParameters },
      });
    },
    [context, handleChange, operation]
  );

  return (
    <div {...props} ref={ref}>
      <div className="flex items-start gap-1">
        <span>{"("}</span>
        {operation.value.parameters.map((parameter, i, paramList) => (
          <Fragment key={parameter.id}>
            <Statement
              statement={parameter}
              handleStatement={(statement, remove) => {
                handleStatement({
                  statement,
                  remove,
                  parameterLength: paramList.length + (remove ? -1 : 0),
                  context,
                });
              }}
              options={{
                enableVariable: true,
                disableDelete: expectedParameterType
                  ? !!paramList[i + 1] || !parameter.isOptional
                  : false,
                isParameter: true,
                isOptional: parameter.isOptional,
                isRest: parameter.isRest,
                disableNameToggle: (() => {
                  if (expectedParameterType) return true;
                  const prev = operation.type.parameters[i - 1];
                  const next = operation.type.parameters[i + 1];
                  if (next && !next.isOptional) return true;
                  if (prev && prev.isOptional) return true;
                  if (prev && prev.isRest) return true;
                  return false;
                })(),
              }}
              addStatement={(statement, position) => {
                addParameter(
                  { ...statement, isOptional: paramList[i - 1]?.isOptional },
                  position,
                  i
                );
              }}
            />
            {i + 1 < paramList.length && <span>,</span>}
          </Fragment>
        ))}
        {(expectedParameterType &&
          operation.value.parameters.length === expectedParameterType.length) ||
        operation.type.parameters.slice(-1)?.[0]?.isRest ? null : (
          <AddStatement
            id={`${operation.id}_parameter`}
            onSelect={(statement) => {
              const lastIndex = operation.value.parameters.length - 1;
              const isOptional =
                statement.isOptional ??
                operation.value.parameters[lastIndex]?.isOptional;
              addParameter({ ...statement, isOptional }, "after", lastIndex);
            }}
            iconProps={{ title: "Add parameter" }}
            config={{
              ...expectedParameterType?.[operation.value.parameters.length],
            }}
          />
        )}
        <span>{")"}</span>
      </div>
      <div className="pl-4 [&>div]:mb-1 w-fit">
        {operation.value.statements.map((statement, index) => (
          <Statement
            key={statement.id}
            statement={statement}
            options={{ enableVariable: true }}
            handleStatement={(statement, remove) =>
              handleStatement({
                statement,
                remove,
                context: context.getContext(statement.id),
              })
            }
            addStatement={(stmt, pos) => addStatement(stmt, pos, index)}
          />
        ))}
        <AddStatement
          id={`${operation.id}_statement`}
          onSelect={(statement) => {
            const lastStatement = operation.value.statements.length - 1;
            addStatement(statement, "after", lastStatement);
          }}
          iconProps={{ title: "Add statement" }}
        />
      </div>
    </div>
  );
};

export const Operation = memo(forwardRef(OperationComponent));
