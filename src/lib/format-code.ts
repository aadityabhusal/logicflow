import { IData, IStatement, OperationType } from "./types";
import { OperationListItem } from "./execution/types";
import { Context } from "./execution/types";
import {
  getUnionActiveType,
  isDataOfType,
  inferTypeFromValue,
  getStatementResult,
  getTypeSignature,
} from "./utils";
import { builtInOperations } from "./operations/built-in";
import { InstanceTypes } from "./data";
import type { Options } from "prettier";

export async function formatCode(code: string, options?: Options) {
  const [prettier, estree, babel] = await Promise.all([
    import("prettier/standalone"),
    import("prettier/plugins/estree"),
    import("prettier/plugins/babel"),
  ]);
  return prettier.format(code, {
    parser: "babel-ts",
    plugins: [estree, babel],
    ...options,
  });
}

type OperationSource = "instance" | "remeda" | "builtin" | "userDefined";

type CodeGenContext = Context & {
  showResult?: boolean;
  getOperation: (name: string) => OperationListItem | undefined;
  importedOperations: Set<string>;
  currentOperationName?: string;
};

export function createCodeGenContext(
  context: Context,
  options?: { showResult?: boolean; currentOperationName?: string }
): CodeGenContext {
  return {
    ...context,
    showResult: options?.showResult,
    currentOperationName: options?.currentOperationName,
    importedOperations: new Set(),
    getOperation: (name: string) =>
      builtInOperations.find((op) => op.name === name),
  };
}

export function generateData(data: IData, context: CodeGenContext): string {
  if (isDataOfType(data, "unknown") || isDataOfType(data, "never")) {
    const inferredType = inferTypeFromValue(data.value, context);
    return generateData({ ...data, type: inferredType }, context);
  } else if (isDataOfType(data, "array") || isDataOfType(data, "tuple")) {
    return `[${data.value.map((item) => generateStatement(item, context, true)).join(", ")}]`;
  } else if (isDataOfType(data, "object") || isDataOfType(data, "dictionary")) {
    return `{${data.value.entries.map((entry) => `${entry.key}: ${generateStatement(entry.value, context, true)}`).join(", ")}}`;
  } else if (isDataOfType(data, "error")) {
    return `new Error("${data.value.reason}")`;
  } else if (isDataOfType(data, "instance")) {
    return `new ${data.value.className}(${data.value.constructorArgs.map((arg) => generateStatement(arg, context, true)).join(", ")})`;
  } else if (isDataOfType(data, "operation")) {
    return generateCallback(data, { ...context, showResult: undefined });
  } else if (isDataOfType(data, "reference")) {
    if (data.type.isEnv) return `process.env.${data.value.name}`;
    const name = data.value.name;
    if (
      name &&
      name !== context.currentOperationName &&
      context.variables.has(name)
    ) {
      context.importedOperations.add(name);
    }
    return name;
  } else if (isDataOfType(data, "union")) {
    const activeType = getUnionActiveType(data.type);
    return generateData({ ...data, type: activeType }, context);
  } else if (data.value === undefined) {
    return "undefined";
  }
  return JSON.stringify(data.value);
}

function getOperationSource(
  operation: IData<OperationType>,
  context: CodeGenContext
): OperationSource {
  const opName = operation.value.name;
  if (!opName) return "userDefined";
  const opItem = context.getOperation(opName);
  if (opItem?.source?.name === "remeda") return "remeda";
  const firstParamType = operation.type.parameters[0]?.type;
  if (firstParamType?.kind === "instance") {
    const Constructor = InstanceTypes[firstParamType.className]?.Constructor;
    if (Constructor && typeof Constructor.prototype[opName] === "function") {
      return "instance";
    }
  }
  if (!opItem) return "userDefined";
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
    case "builtin": {
      const name = `${source === "remeda" ? "R" : "_"}.${operation.value.name}`;
      return `, ${name}${paramStr}`;
    }
    case "userDefined": {
      const name = operation.value.name;
      if (
        name &&
        name !== context.currentOperationName &&
        context.variables.has(name)
      ) {
        context.importedOperations.add(name);
      }
      return `, ${paramStr ? `(arg) => ${name}${paramStr}` : name}`;
    }
  }
}

function generateStatement(
  statement: IStatement,
  context: CodeGenContext,
  isParam?: boolean
): string {
  if (context.showResult) {
    return generateData(getStatementResult(statement, context), context);
  }
  const declaration = isParam ? "" : "const ";
  const name =
    statement.name !== undefined ? `${declaration}${statement.name} = ` : "";
  const data = generateData(statement.data, context);
  if (statement.operations.length === 0) return `${name}${data}`;
  const operations = statement.operations
    .map((op) => generateOperationCall(op, context))
    .join("");

  const hasAwait = statement.operations.some((op) => op.value.name === "await");
  const pipeFunc = hasAwait ? "await _.pipeAsync" : "R.pipe";

  return `${name}${pipeFunc}(${data}${operations})`;
}

function generateCallback(
  operation: IData<OperationType>,
  context: CodeGenContext
): string {
  // Only show internal logic for operations that were converted to raw values i.e. with instanceId
  if (operation.value.instanceId) {
    const storedType = context.getInstance(operation.value.instanceId)?.type;
    if (storedType) {
      const type = storedType?.kind === "operation" ? storedType : undefined;
      return `(${type ? type.parameters.map((p) => p.name).join(", ") : "...args"}) => {
    /* internal logic */ 
    /* @returns ${getTypeSignature(type?.result ?? { kind: "unknown" })} */
  }`;
    }
  }

  const asyncKeyword = operation.value.isAsync ? "async " : "";
  const statements = operation.value.statements.map((statement) =>
    generateStatement(statement, context)
  );
  const removeConst = (value: string) =>
    value.startsWith("const") ? value.replace(/^[^=]*=/, "") : value;

  return `${asyncKeyword}(${operation.value.parameters.map((p) => p.name).join(", ")}) => {
    ${statements.slice(0, -1).join(";\n")}
    return ${statements.length ? removeConst(statements[statements.length - 1]) : "undefined"};
  }`;
}

export function generateOperation(
  operation: IData<OperationType>,
  context: Context
): string {
  const operationName = operation.value.name ?? "op";
  const codeGenContext = createCodeGenContext(context, {
    currentOperationName: operationName,
  });
  const callback = generateCallback(operation, codeGenContext);
  const userImports = Array.from(codeGenContext.importedOperations)
    .map((name) => `import ${name} from './${name}.js';`)
    .join("\n");
  const imports = `import * as _ from '../built-in.js';\nimport * as R from 'remeda';\n${userImports}\n`;
  return `${imports}\nconst ${operationName} = ${callback};\nexport default ${operationName};`;
}
