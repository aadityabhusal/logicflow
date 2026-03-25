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
import { useProjectStore } from "@/lib/store";
import isEqual from "react-fast-compare";
import { EntityPath } from "@/lib/types";

interface OperationInputProps extends HTMLAttributes<HTMLDivElement> {
  operation: IData<OperationType>;
  handleChange: (
    updater: (prev: IData<OperationType>) => IData<OperationType> | null,
    remove?: boolean
  ) => void;
  context: Context;
  path: EntityPath;
}

const OperationComponent = (
  { operation, handleChange, context, path, ...props }: OperationInputProps,
  ref: React.Ref<HTMLDivElement>
) => {
  const updateStatementByPath = useProjectStore((s) => s.updateStatementByPath);
  const fileId = useProjectStore((s) => s.currentFileId);
  const expectedParameterType = useMemo(
    () =>
      context.expectedType?.kind === "operation"
        ? context.expectedType.parameters
        : undefined,
    [context.expectedType]
  );

  const reservedNamesStr = useMemo(
    () =>
      operation.value.parameters
        .concat(operation.value.statements)
        .filter((s) => s.name)
        .map((s) => s.name!)
        .join(","),
    [operation.value.parameters, operation.value.statements]
  );

  const reservedNames = useMemo(
    () =>
      getReservedNames(context.variables).concat(
        reservedNamesStr.split(",").map((name) => ({ kind: "variable", name }))
      ),
    [context.variables, reservedNamesStr]
  );

  const parameterPaths = useMemo(() => {
    const arr = Array.from({ length: operation.value.parameters.length });
    return arr.map((_, i) => [...path, "parameters", i]);
  }, [path, operation.value.parameters.length]);

  const statementPaths = useMemo(() => {
    const arr = Array.from({ length: operation.value.statements.length });
    return arr.map((_, i) => [...path, "statements", i]);
  }, [path, operation.value.statements.length]);

  const handleStatementUpdate = useCallback(
    ({
      statement,
      path: statementPath,
      context,
      remove,
      isParameter,
    }: {
      statement: IStatement;
      path: EntityPath;
      context: Context;
      remove?: boolean;
      isParameter: boolean;
    }) => {
      handleChange((prevOp) => {
        const parameterLength = prevOp.value.parameters.length;
        const allCurrent = [
          ...prevOp.value.parameters,
          ...prevOp.value.statements,
        ];
        const updatedStatements = updateStatements({
          statements: allCurrent,
          context,
          changedStatement: statement,
          removeStatement: remove,
        });

        const adjustedParameterLength = isParameter
          ? remove
            ? parameterLength - 1
            : parameterLength
          : parameterLength;
        const updatedParameters = updatedStatements.slice(
          0,
          adjustedParameterLength
        );
        const updatedStatementsList = updatedStatements.slice(
          adjustedParameterLength
        );
        const newResultType = getOperationResultType(
          updatedStatementsList,
          context
        );

        const originalStatement = allCurrent.find((s) => s.id === statement.id);
        const isNameChange = originalStatement?.name !== statement.name;
        const resultTypeChanged = !isEqual(newResultType, prevOp.type.result);

        if (!isNameChange && !resultTypeChanged && !remove && fileId) {
          const updatedStatement = updatedStatements.find(
            (s) => s.id === statement.id
          );
          if (updatedStatement) {
            updateStatementByPath(fileId, statementPath, updatedStatement);
            return null;
          }
        }

        return {
          ...prevOp,
          type: {
            ...prevOp.type,
            parameters: updatedParameters.map((param) => ({
              name: param.name,
              type: param.data.type,
              isOptional: param.isOptional,
              isRest: param.isRest,
            })),
            result: newResultType,
          },
          value: {
            ...prevOp.value,
            isAsync: updatedStatementsList.some((s) =>
              s.operations.some((op) => op.value.name === "await")
            ),
            parameters: updatedParameters,
            statements: updatedStatementsList,
          },
        };
      });
    },
    [handleChange, updateStatementByPath, fileId]
  );

  const handleParameterStatement = useCallback(
    (statement: IStatement, remove?: boolean, path?: EntityPath) => {
      handleStatementUpdate({
        statement,
        path: path ?? [],
        context,
        remove,
        isParameter: true,
      });
    },
    [handleStatementUpdate, context]
  );

  const handleStatement = useCallback(
    (statement: IStatement, remove?: boolean, path?: EntityPath) => {
      handleStatementUpdate({
        statement,
        path: path ?? [],
        remove,
        context: context.getContext(statement.id),
        isParameter: false,
      });
    },
    [handleStatementUpdate, context]
  );

  const addStatement = useCallback(
    (statement: IStatement, position: "before" | "after", id?: string) => {
      handleChange((prevOperation) => {
        const statements = prevOperation.value.statements;
        const index = statements.findIndex((s) => s.id === id);
        const insertIndex =
          index === -1 ? (position === "after" ? statements.length : 0) : index;
        const newStatements = statements
          .slice(0, insertIndex)
          .concat(statement)
          .concat(statements.slice(insertIndex));
        return {
          ...prevOperation,
          type: {
            ...prevOperation.type,
            result: getOperationResultType(newStatements, context),
          },
          value: { ...prevOperation.value, statements: newStatements },
        };
      });
    },
    [handleChange, context]
  );

  const addParameter = useCallback(
    (statement: IStatement, position: "before" | "after", id?: string) => {
      handleChange((prevOp) => {
        const parameters = prevOp.value.parameters;
        const index = parameters.findIndex((p) => p.id === id);
        const insertIndex =
          index === -1 ? (position === "after" ? parameters.length : 0) : index;
        const newParameter = {
          ...statement,
          isOptional:
            statement.isOptional ?? parameters[insertIndex - 1]?.isOptional,
          name:
            statement.name ??
            createVariableName({
              prefix: "param",
              prev: reservedNames.map((r) => r.name).filter(Boolean),
            }),
        };
        const updatedParameters = parameters
          .slice(0, insertIndex)
          .concat(newParameter)
          .concat(parameters.slice(insertIndex));
        const updatedParametersTypes = updatedParameters.map((param) => ({
          name: param.name,
          type: param.data.type,
          isOptional: param.isOptional,
          isRest: param.isRest,
        }));

        return {
          ...prevOp,
          type: { ...prevOp.type, parameters: updatedParametersTypes },
          value: { ...prevOp.value, parameters: updatedParameters },
        };
      });
    },
    [handleChange, reservedNames]
  );

  return (
    <div {...props} ref={ref}>
      <div className="flex items-start gap-1">
        <span>{"("}</span>
        {operation.value.parameters.map((parameter, i, paramList) => (
          <Fragment key={parameter.id}>
            <Statement
              statement={parameter}
              path={parameterPaths[i]}
              handleStatement={handleParameterStatement}
              enableVariable={true}
              disableDelete={
                expectedParameterType
                  ? !!paramList[i + 1] || !parameter.isOptional
                  : false
              }
              isParameter={true}
              isOptional={parameter.isOptional}
              isRest={parameter.isRest}
              disableNameToggle={(() => {
                if (expectedParameterType) return true;
                const prev = operation.type.parameters[i - 1];
                const next = operation.type.parameters[i + 1];
                if (next && !next.isOptional) return true;
                if (prev && prev.isOptional) return true;
                if (prev && prev.isRest) return true;
                return false;
              })()}
              addStatement={addParameter}
              reservedNames={reservedNames}
            />
            {i + 1 < paramList.length && <span>,</span>}
          </Fragment>
        ))}
        {(expectedParameterType &&
          operation.value.parameters.length === expectedParameterType.length) ||
        operation.type.parameters.slice(-1)?.[0]?.isRest ? null : (
          <AddStatement
            id={`${operation.id}_parameter`}
            onSelect={(statement) => addParameter(statement, "after")}
            iconProps={{ title: "Add parameter" }}
            config={{
              ...expectedParameterType?.[operation.value.parameters.length],
            }}
          />
        )}
        <span>{")"}</span>
      </div>
      <div className="pl-4 [&>div]:mb-1 w-fit">
        {operation.value.statements.map((statement, i) => (
          <Statement
            key={statement.id}
            statement={statement}
            path={statementPaths[i]}
            enableVariable={true}
            handleStatement={handleStatement}
            addStatement={addStatement}
            reservedNames={reservedNames}
          />
        ))}
        <AddStatement
          id={`${operation.id}_statement`}
          onSelect={(statement) => addStatement(statement, "after")}
          iconProps={{ title: "Add statement" }}
        />
      </div>
    </div>
  );
};

export const Operation = memo(forwardRef(OperationComponent));
