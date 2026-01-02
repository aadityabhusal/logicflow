import { IStatement } from "@/lib/types";
import { ParseData } from "./ParseData";
import { ParseOperation } from "./ParseOperation";
import { getStatementResult, isDataOfType } from "@/lib/utils";

export function ParseStatement({
  statement,
  showData,
  nest = 0,
}: {
  statement: IStatement;
  showData?: boolean;
  nest?: number;
}) {
  if (showData) {
    const result = getStatementResult(statement);
    return isDataOfType(result, "operation") ? (
      <ParseOperation operation={result} nest={nest + 1} />
    ) : (
      <ParseData data={result} showData={showData} nest={nest + 1} />
    );
  }

  const dataNode = isDataOfType(statement.data, "operation") ? (
    <ParseOperation operation={statement.data} nest={nest + 1} />
  ) : (
    <ParseData data={statement.data} showData={showData} nest={nest + 1} />
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
            <ParseStatement nest={nest + 1} statement={param} />
            {i + 1 < arr.length && ", "}
          </span>
        ))}
        {")"}
      </span>
    ),
    dataNode
  );
}
