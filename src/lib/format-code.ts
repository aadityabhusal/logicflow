import { IData, IStatement, OperationType, OperationListItem } from "./types";
import { getUnionActiveType, isDataOfType } from "./utils";
import { builtInOperations } from "./operations/built-in";

export async function formatCode(code: string) {
  const [prettier, estree, babel] = await Promise.all([
    import("prettier/standalone"),
    import("prettier/plugins/estree"),
    import("prettier/plugins/babel"),
  ]);
  return prettier.format(code, {
    parser: "babel-ts",
    plugins: [estree, babel],
  });
}

type OperationSource = "instance" | "remeda" | "builtin" | "userDefined";

interface CodeGenContext {
  getOperation: (name: string) => OperationListItem | undefined;
}

function createCodeGenContext(): CodeGenContext {
  return {
    getOperation: (name: string) =>
      builtInOperations.find((op) => op.name === name),
  };
}

function generateData(data: IData, context: CodeGenContext): string {
  if (isDataOfType(data, "array") || isDataOfType(data, "tuple")) {
    return `[${data.value.map((item) => generateStatement(item, context, true)).join(", ")}]`;
  } else if (isDataOfType(data, "object") || isDataOfType(data, "dictionary")) {
    return `{${data.value.entries.map((entry) => `${entry.key}: ${generateStatement(entry.value, context, true)}`).join(", ")}}`;
  } else if (isDataOfType(data, "error")) {
    return `new Error("${data.value.reason}")`;
  } else if (isDataOfType(data, "instance")) {
    return `new ${data.value.className}(${data.value.constructorArgs.map((arg) => generateStatement(arg, context, true)).join(", ")})`;
  } else if (isDataOfType(data, "operation")) {
    return generateCallback(data, context);
  } else if (isDataOfType(data, "reference")) {
    return data.value.name;
  } else if (isDataOfType(data, "union")) {
    return generateData(
      { ...data, type: getUnionActiveType(data.type) },
      context
    );
  }
  return JSON.stringify(data.value);
}

function getOperationSource(
  operation: IData<OperationType>,
  context: CodeGenContext
): OperationSource {
  const opName = operation.value.name;
  if (!opName) {
    return "userDefined";
  }

  const opItem = context.getOperation(opName);

  if (opItem?.source?.name === "remeda") {
    return "remeda";
  }

  const firstParamType = operation.type.parameters[0]?.type;
  if (firstParamType?.kind === "instance") {
    return "instance";
  }

  if (!opItem) {
    return "userDefined";
  }

  return "builtin";
}

function generateOperationCall(
  operation: IData<OperationType>,
  context: CodeGenContext
): string {
  const source = getOperationSource(operation, context);
  const params = operation.value.parameters
    .map((p) => generateStatement(p, context, true))
    .join(", ");
  const paramStr = operation.value.parameters.length ? `(${params})` : "";

  if (operation.value.name === "await") return "";
  if (operation.value.name === "call") return `, (arg) => arg(${params})`;

  switch (source) {
    case "instance":
      return `, (arg) => arg.${operation.value.name}(${params})`;
    case "remeda":
      return `, R.${operation.value.name}${paramStr}`;
    case "builtin": {
      const name = `_.${operation.value.name}`;
      return `, ${paramStr ? `(arg) => ${name}${paramStr}` : name}`;
    }
    case "userDefined": {
      const name = operation.value.name;
      return `, ${paramStr ? `(arg) => ${name}${paramStr}` : name}`;
    }
  }
}

function generateStatement(
  statement: IStatement,
  context: CodeGenContext,
  isParam?: boolean
): string {
  const declaration = isParam ? "" : "const ";
  const name =
    statement.name !== undefined ? `${declaration}${statement.name} = ` : "";
  const data = generateData(statement.data, context);
  if (statement.operations.length === 0) return `${name}${data}`;
  const operations = statement.operations
    .map((op) => generateOperationCall(op, context))
    .join("");

  // TODO: resolve statement data reference and see it its async
  const hasAsyncOp = statement.operations.some((op) => op.value.isAsync);
  const hasAwaitOp = statement.operations.some(
    (op) => op.value.name === "await"
  );

  const pipeFunc = hasAsyncOp ? "R.pipeAsync" : "R.pipe";
  const awaitPrefix = hasAwaitOp ? "await " : "";

  return `${name}${awaitPrefix}${pipeFunc}(${data}${operations})`;
}

function generateCallback(
  operation: IData<OperationType>,
  context: CodeGenContext
): string {
  const asyncKeyword = operation.value.isAsync ? "async " : "";
  const statements = operation.value.statements.map((statement) =>
    generateStatement(statement, context)
  );
  return `${asyncKeyword}(${operation.value.parameters.map((p) => p.name).join(", ")}) => {
    ${statements.slice(0, -1).join(";\n")}
    ${statements.length ? `return ${statements[statements.length - 1]}` : "return undefined;"}
  }`;
}

export function generateOperation(operation: IData<OperationType>): string {
  const context = createCodeGenContext();
  const imports = `import * as R from 'remeda';import * as _ from './built-in';`;
  return `${imports}const ${operation.value.name} = ${generateCallback(operation, context)};`;
}
