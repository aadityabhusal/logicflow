import {
  Fragment,
  forwardRef,
  HTMLAttributes,
  ReactNode,
  useCallback,
  memo,
} from "react";
import { Context, IData, IStatement, OperationType } from "../lib/types";
import { updateStatements } from "@/lib/update";
import {
  createVariableName,
  createContextVariables,
  inferTypeFromValue,
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
        type: inferTypeFromValue({
          parameters: updatedParameters,
          statements: updatedStatementsList,
        }),
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
      handleChange({
        ...operation,
        value: {
          ...operation.value,
          statements: [
            ...operation.value.statements.slice(0, _index),
            statement,
            ...operation.value.statements.slice(_index),
          ],
        },
      });
    },
    [handleChange, operation]
  );

  const addParameter = useCallback(
    (statement: IStatement) => {
      const parameters = [...operation.value.parameters];
      const statements = [...operation.value.statements];
      const newParameter = {
        ...statement,
        name: createVariableName({
          prefix: "param",
          prev: [...parameters, ...context.variables.keys()],
        }),
      };
      const updatedParameters = [...parameters, newParameter];
      handleChange({
        ...operation,
        type: inferTypeFromValue({
          parameters: updatedParameters,
          statements: statements,
        }),
        value: {
          ...operation.value,
          parameters: updatedParameters,
        },
      });
    },
    [context.variables, handleChange, operation]
  );

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
              handleStatement={(statement, remove) =>
                handleStatement({
                  statement,
                  remove,
                  parameterLength: paramList.length + (remove ? -1 : 0),
                  context,
                })
              }
              options={{
                enableVariable: true,
                disableDelete: options?.disableDelete,
                disableOperationCall: true,
                disableNameToggle: true,
              }}
              context={{
                variables: new Map(),
                currentStatementId: parameter.id,
                ...(context.expectedType && {
                  expectedType: parameter.data.type,
                  forceExpectedType: true,
                }),
              }}
              addStatement={addParameter}
            />
            {i + 1 < paramList.length && <span>,</span>}
          </Fragment>
        ))}
        {!context.expectedType && (
          <AddStatement
            id={`${operation.id}_parameter`}
            onSelect={addParameter}
            iconProps={{ title: "Add parameter" }}
            context={{ variables: new Map() }}
          />
        )}
        <span>{")"}</span>
      </div>
      <div className="pl-4 [&>div]:mb-1 w-fit">
        {
          operation.value.statements.reduce(
            (acc, statement, i) => {
              const _context: Context = {
                currentStatementId: statement.id,
                variables: acc.variables,
                skipExecution: getSkipExecution({
                  context: { ...context, variables: acc.variables },
                  data: statement.data,
                }),
              };

              acc.variables = createContextVariables(
                [statement],
                acc.variables
              );

              acc.elements.push(
                <Statement
                  key={statement.id}
                  statement={statement}
                  options={{ enableVariable: true }}
                  handleStatement={(statement, remove) =>
                    handleStatement({ statement, remove, context: _context })
                  }
                  addStatement={(stmt, pos) => addStatement(stmt, pos, i)}
                  context={_context}
                />
              );

              return acc;
            },
            {
              elements: [] as ReactNode[],
              variables: createContextVariables(
                operation.value.parameters.toReversed(),
                context.variables
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
          context={{ variables: new Map() }}
        />
      </div>
    </div>
  );
};

export const Operation = memo(forwardRef(OperationComponent));
