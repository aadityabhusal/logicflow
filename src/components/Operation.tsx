import {
  Fragment,
  forwardRef,
  HTMLAttributes,
  ReactNode,
  useCallback,
  memo,
  useMemo,
} from "react";
import { Context, IData, IStatement, OperationType } from "../lib/types";
import { updateStatements } from "@/lib/update";
import {
  createVariableName,
  createContextVariables,
  getOperationResultType,
} from "../lib/utils";
import { Statement } from "./Statement";
import { AddStatement } from "./AddStatement";
import { getSkipExecution } from "@/lib/operation";

export interface OperationInputProps extends HTMLAttributes<HTMLDivElement> {
  operation: IData<OperationType>;
  handleChange: (data: IData<OperationType>, remove?: boolean) => void;
  context: Context;
  options?: {
    disableDelete?: boolean;
    disableDropdown?: boolean;
    isTopLevel?: boolean;
  };
}

const OperationComponent = (
  { operation, handleChange, context, options, ...props }: OperationInputProps,
  ref: React.ForwardedRef<HTMLDivElement>
) => {
  const reservedNames = useMemo(
    () =>
      new Set(
        operation.value.parameters
          .concat(operation.value.statements)
          .reduce((acc, s) => {
            if (s.name) acc.push(s.name);
            return acc;
          }, [] as string[])
          .concat(Array.from(context.reservedNames ?? []))
      ),
    [
      context.reservedNames,
      operation.value.parameters,
      operation.value.statements,
    ]
  );

  const handleStatement = useCallback(
    ({
      statement,
      context,
      index,
      remove,
      parameterLength = operation.value.parameters.length,
    }: {
      statement: IStatement;
      context: Context;
      index: number;
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
        operation,
      });

      const updatedParameters = updatedStatements.slice(0, parameterLength);
      const updatedStatementsList = updatedStatements.slice(parameterLength);

      handleChange({
        ...operation,
        type: {
          ...operation.type,
          parameters: updatedParameters.map((param, i) => {
            const idx = i >= index && remove ? i + 1 : i;
            return {
              name: param.name,
              type: param.data.type,
              isOptional: operation.type.parameters[idx]?.isOptional,
            };
          }),
          result: getOperationResultType(updatedStatementsList),
        },
        value: {
          ...operation.value,
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
        type: { ...operation.type, result: getOperationResultType(statements) },
        value: { ...operation.value, statements },
      });
    },
    [handleChange, operation]
  );

  const addParameter = useCallback(
    (statement: IStatement, position: "before" | "after", index: number) => {
      const _index = position === "before" ? index : index + 1;
      const newParameter = {
        ...statement,
        name: createVariableName({
          prefix: "param",
          prev: Array.from(context.reservedNames ?? []),
        }),
      };
      const updatedParameters = operation.value.parameters
        .slice(0, _index)
        .concat(newParameter)
        .concat(operation.value.parameters.slice(_index));
      const updatedParametersTypes = updatedParameters.map((param, i) => {
        const idx = i >= _index ? i - 1 : i;
        return {
          name: param.name,
          type: param.data.type,
          isOptional: operation.type.parameters[idx]?.isOptional,
        };
      });

      handleChange({
        ...operation,
        type: { ...operation.type, parameters: updatedParametersTypes },
        value: { ...operation.value, parameters: updatedParameters },
      });
    },
    [context.reservedNames, handleChange, operation]
  );

  function handleOptionalParameter(index: number) {
    const parameterTypes = [...operation.type.parameters];
    parameterTypes[index] = {
      ...parameterTypes[index],
      isOptional: !parameterTypes[index]?.isOptional,
    };
    handleChange({
      ...operation,
      type: { ...operation.type, parameters: parameterTypes },
    });
  }

  return (
    <div
      {...props}
      ref={ref}
      className={["max-w-max", props?.className].join(" ")}
    >
      <div className="flex items-start gap-1">
        <span>{"("}</span>
        {operation.value.parameters.map((parameter, i, paramList) => (
          <Fragment key={parameter.id}>
            <Statement
              statement={parameter}
              handleStatement={(statement, remove) => {
                if (!statement.name) {
                  handleOptionalParameter(i);
                } else {
                  handleStatement({
                    statement,
                    remove,
                    index: i,
                    parameterLength: paramList.length + (remove ? -1 : 0),
                    context,
                  });
                }
              }}
              options={{
                enableVariable: true,
                disableDelete: options?.disableDelete,
                isParameter: true,
                isOptional: operation.type.parameters[i]?.isOptional,
                disableNameToggle: (() => {
                  const prev = operation.type.parameters[i - 1];
                  const next = operation.type.parameters[i + 1];
                  if (next && !next.isOptional) return true;
                  if (prev && prev.isOptional) return true;
                  return false;
                })(),
              }}
              context={{
                variables: new Map(),
                reservedNames,
                currentStatementId: parameter.id,
                ...(context.expectedType?.kind === "operation" && {
                  expectedType: context.expectedType.parameters[i]?.type,
                  enforceExpectedType: true,
                }),
              }}
              addStatement={(...props) => addParameter(...props, i)}
            />
            {i + 1 < paramList.length && <span>,</span>}
          </Fragment>
        ))}
        {!context.expectedType && (
          <AddStatement
            id={`${operation.id}_parameter`}
            onSelect={(statement) => {
              const lastParameter = operation.value.parameters.length - 1;
              addParameter(statement, "after", lastParameter);
            }}
            iconProps={{ title: "Add parameter" }}
          />
        )}
        <span>{")"}</span>
      </div>
      <div className="pl-4 [&>div]:mb-1 w-fit">
        {
          operation.value.statements.reduce(
            (acc, statement, index) => {
              const _context: Context = {
                currentStatementId: statement.id,
                reservedNames,
                variables: acc.variables,
                skipExecution: getSkipExecution({
                  context: { ...context, variables: acc.variables },
                  data: statement.data,
                }),
              };

              acc.variables = createContextVariables(
                [statement],
                acc.variables,
                operation
              );

              acc.elements.push(
                <Statement
                  key={statement.id}
                  statement={statement}
                  options={{ enableVariable: true }}
                  handleStatement={(statement, remove) =>
                    handleStatement({
                      statement,
                      remove,
                      index,
                      context: _context,
                    })
                  }
                  addStatement={(stmt, pos) => addStatement(stmt, pos, index)}
                  context={_context}
                />
              );

              return acc;
            },
            {
              elements: [] as ReactNode[],
              variables: createContextVariables(
                operation.value.parameters.toReversed(),
                context.variables,
                operation
              ),
            }
          ).elements
        }
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
