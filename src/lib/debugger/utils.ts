import { IData, IStatement, OperationType, ProjectFile } from "@/lib/types";
import { createOperationFromFile, isDataOfType } from "@/lib/utils";

function indexStatements(
  statements: IStatement[],
  fileId: string,
  index: Map<string, string>
) {
  statements.forEach((statement) => indexStatement(statement, fileId, index));
}

function indexStatement(
  statement: IStatement,
  fileId: string,
  index: Map<string, string>
) {
  index.set(statement.id, fileId);
  index.set(statement.data.id, fileId);
  statement.operations.forEach((operation) => {
    index.set(operation.id, fileId);
    indexStatements(operation.value.parameters, fileId, index);
  });

  const data = statement.data;
  if (isDataOfType(data, "array") || isDataOfType(data, "tuple")) {
    data.value.forEach((item) => indexStatement(item, fileId, index));
  } else if (isDataOfType(data, "object") || isDataOfType(data, "dictionary")) {
    data.value.entries.forEach((entry) =>
      indexStatement(entry.value, fileId, index)
    );
  } else if (isDataOfType(data, "operation")) {
    indexOperation(data, fileId, index);
  } else if (isDataOfType(data, "condition")) {
    indexStatement(data.value.condition, fileId, index);
    indexStatements(data.value.trueBranch, fileId, index);
    indexStatements(data.value.falseBranch, fileId, index);
  } else if (isDataOfType(data, "instance")) {
    indexStatements(data.value.constructorArgs, fileId, index);
  }
}

export function indexOperation(
  operation: IData<OperationType>,
  fileId: string,
  index = new Map<string, string>()
) {
  index.set(operation.id, fileId);
  indexStatements(operation.value.parameters, fileId, index);
  indexStatements(operation.value.statements, fileId, index);
  return index;
}

export function createProjectEntityFileIndex(files: ProjectFile[]) {
  const index = new Map<string, string>();
  for (const file of files) {
    const operation = createOperationFromFile(file);
    if (!operation) continue;
    indexOperation(operation, file.id, index);
  }
  return index;
}
