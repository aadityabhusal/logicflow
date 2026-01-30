import { Fragment } from "react";
import { ParseStatement } from "./ParseStatement";
import { Context, IData, OperationType } from "@/lib/types";

export function ParseOperation({
  operation,
  nest = 0,
  context,
}: {
  operation: IData<OperationType>;
  nest?: number;
  context: Context;
}) {
  function getTabs(level: number) {
    if (level <= 0) return "";
    return [...Array(level)].map((_) => "\t").join("");
  }
  return (
    <>
      <span>
        <span className="text-reserved">function</span>{" "}
        <span className="text-variable">{operation.value.name}</span>
        {`(`}
        {operation.value.parameters.map((parameter, i, arr) => (
          <Fragment key={parameter.id}>
            <span className="text-variable">{parameter.name}</span>
            {i + 1 < arr.length && <span>{","}</span>}
          </Fragment>
        ))}
        <span>{`) {\n`}</span>
      </span>
      <span>
        {operation.value.statements.map((statement, i, statements) => (
          <span key={statement.id}>
            {getTabs(nest + 1)}
            {i + 1 === statements.length ? (
              <span className="text-reserved">return </span>
            ) : (
              <ParseVariable name={statement.name} />
            )}
            <ParseStatement
              statement={statement}
              nest={nest}
              context={context}
            />
            {";\n"}
          </span>
        ))}
      </span>
      {getTabs(nest)}
      <span>{"}"}</span>
    </>
  );
}

export function ParseVariable({ name }: { name?: string }) {
  return !name ? null : (
    <>
      <span className="text-reserved">let</span>{" "}
      <span className="text-variable">{name}</span> <span>= </span>
    </>
  );
}
