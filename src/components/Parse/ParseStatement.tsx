import { Context, IStatement } from "@/lib/types";
import { ParseData } from "./ParseData";
import { ParseOperation } from "./ParseOperation";
import { getStatementResult, isDataOfType } from "@/lib/utils";

export function ParseStatement({
  statement,
  showData,
  nest = 0,
  context,
}: {
  statement: IStatement;
  showData?: boolean;
  nest?: number;
  context: Context;
}) {
  if (showData) {
    const result = getStatementResult(statement, context);
    return isDataOfType(result, "operation") ? (
      <ParseOperation operation={result} nest={nest + 1} context={context} />
    ) : (
      <ParseData
        data={result}
        showData={showData}
        nest={nest + 1}
        context={context}
      />
    );
  }

  const dataNode = isDataOfType(statement.data, "operation") ? (
    <ParseOperation
      operation={statement.data}
      nest={nest + 1}
      context={context}
    />
  ) : (
    <ParseData
      data={statement.data}
      showData={showData}
      nest={nest + 1}
      context={context}
    />
  );

  return statement.operations.reduce(
    (prev, operation) => (
      <span key={operation.id}>
        <span className="text-type">_</span>
        {"."}
        <span className="text-method">{operation.value.name}</span>
        {"("}
        {prev}
        {operation.value.parameters.length ? ", " : ""}
        {operation.value.parameters.map((param, i, arr) => (
          <span key={param.id}>
            <ParseStatement
              nest={nest + 1}
              statement={param}
              context={context}
            />
            {i + 1 < arr.length && ", "}
          </span>
        ))}
        {")"}
      </span>
    ),
    dataNode
  );
}
