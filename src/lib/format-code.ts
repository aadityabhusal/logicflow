import {
  IData,
  IStatement,
  OperationType,
  ConditionType,
  DataValue,
} from "./types";
import { OperationListItem } from "./execution/types";
import { Context } from "./execution/types";
import {
  getUnionActiveType,
  isDataOfType,
  inferTypeFromValue,
  getStatementResult,
  getTypeSignature,
  isBlockCondition,
  isObject,
} from "./utils";
import { builtInOperations } from "./operations/built-in";
import { InstanceTypes, PACKAGE_REGISTRY, SOURCE_PACKAGE_MAP } from "./data";
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

type OperationSource =
  | "instance"
  | "remeda"
  | "external"
  | "builtin"
  | "userDefined";

type CodeGenContext = Context & {
  showResult?: boolean;
  getOperation: (name: string) => OperationListItem | undefined;
  importedOperations: Set<string>;
  usedPackages: Set<string>;
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
    usedPackages: new Set(),
    getOperation: (name: string) =>
      builtInOperations.find((op) => op.name === name),
  };
}

const VARIABLE_REGEX = /^const\s+\w+\s*=\s*/;

export function generateData(data: IData, context: CodeGenContext): string {
  if (isDataOfType(data, "unknown") || isDataOfType(data, "never")) {
    const inferredType = inferTypeFromValue(data.value, context);
    return generateData({ ...data, type: inferredType }, context);
  } else if (
    (isDataOfType(data, "array") || isDataOfType(data, "tuple")) &&
    Array.isArray(data.value)
  ) {
    return `[${data.value.map((item) => generateStatement(item, context, true)).join(", ")}]`;
  } else if (
    (isDataOfType(data, "object") || isDataOfType(data, "dictionary")) &&
    isObject(data.value, ["entries"])
  ) {
    return `{${data.value.entries.map((entry) => `${entry.key}: ${generateStatement(entry.value, context, true)}`).join(", ")}}`;
  } else if (isDataOfType(data, "error")) {
    return `new Error("${data.value.reason}")`;
  } else if (isDataOfType(data, "instance")) {
    const instanceConfig = InstanceTypes[data.value.className];
    const constructorArgs = data.value.constructorArgs
      .map((arg) => generateStatement(arg, context, true))
      .join(", ");
    if (instanceConfig?.importInfo) {
      context.usedPackages.add(instanceConfig.importInfo.packageName);
      return `${instanceConfig.importInfo.packageName}(${constructorArgs})`;
    }
    return `new ${data.value.className}(${constructorArgs})`;
  } else if (isDataOfType(data, "operation")) {
    return generateCallback(data, { ...context, showResult: undefined });
  } else if (isDataOfType(data, "condition")) {
    const condVal = data.value as DataValue<ConditionType>;
    const condValExpr = generateConditionExpr(condVal, context);
    return generateTernaryExpr(condValExpr, condVal, context);
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
    const activeType = getUnionActiveType(data.type, {
      value: data.value,
      context,
    });
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

  const valueSourceName = operation.value.source?.name;
  if (valueSourceName === "remeda") return "remeda";
  if (valueSourceName && valueSourceName in SOURCE_PACKAGE_MAP) {
    context.usedPackages.add(SOURCE_PACKAGE_MAP[valueSourceName]);
    return "external";
  }

  const opItem = context.getOperation(opName);
  if (opItem?.source?.name === "remeda") return "remeda";
  const itemSourceName = opItem?.source?.name;
  if (itemSourceName && itemSourceName in SOURCE_PACKAGE_MAP) {
    context.usedPackages.add(SOURCE_PACKAGE_MAP[itemSourceName]);
    return "external";
  }
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
    case "external":
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
  if (isDataOfType(statement.data, "condition")) {
    return generateConditionStatement(statement, context);
  }

  const declaration = isParam ? "" : "const ";
  const name =
    statement.name !== undefined ? `${declaration}${statement.name} = ` : "";
  const data = generateData(statement.data, context);
  const result =
    statement.operations.length === 0
      ? `${name}${data}`
      : (() => {
          const operations = statement.operations
            .map((op) => generateOperationCall(op, context))
            .join("");
          const hasAwait = statement.operations.some(
            (op) => op.value.name === "await"
          );
          const pipeFunc = hasAwait ? "await _.pipeAsync" : "R.pipe";
          return `${name}${pipeFunc}(${data}${operations})`;
        })();

  if (statement.controlFlow === "return") {
    return `return ${result.startsWith("const ") ? result.replace(VARIABLE_REGEX, "") : result}`;
  }
  return result;
}

function generateConditionExpr(
  condVal: DataValue<ConditionType>,
  context: CodeGenContext
): string {
  const condStmt = { ...condVal.condition, controlFlow: undefined };
  return generateStatement(condStmt, context, true);
}

function generateTernaryExpr(
  condition: string,
  condVal: DataValue<ConditionType>,
  context: CodeGenContext
): string {
  const branchExpr = (branch: IStatement[]) => {
    const branchStmt = { ...branch[0], controlFlow: undefined };
    return branch.length > 0
      ? generateStatement(branchStmt, context, true)
      : "undefined";
  };
  return `${condition} ? ${branchExpr(condVal.trueBranch)} : ${branchExpr(condVal.falseBranch)}`;
}

function generateConditionStatement(stmt: IStatement, context: CodeGenContext) {
  const conditionVal = stmt.data.value as DataValue<ConditionType>;
  const { trueBranch, falseBranch } = conditionVal;
  const condition = generateConditionExpr(conditionVal, context);

  if (isBlockCondition(conditionVal)) {
    const trueLines = trueBranch.map((s) => generateStatement(s, context));
    const falseLines = falseBranch.map((s) => generateStatement(s, context));
    return `if (${condition}) {\n${trueLines.join("\n")}\n}${
      falseBranch.length > 0 ? ` else {\n${falseLines.join("\n")}\n}` : ""
    }`;
  }

  const ternary = generateTernaryExpr(condition, conditionVal, context);
  const result =
    stmt.name !== undefined ? `const ${stmt.name} = ${ternary}` : ternary;

  if (stmt.controlFlow === "return") {
    return `return ${
      result.startsWith("const ") ? result.replace(VARIABLE_REGEX, "") : result
    }`;
  }
  return result;
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

  const bodyLines = statements.map((stmtCode, i) => {
    const stmt = operation.value.statements[i];
    if (stmt.controlFlow === "return") return stmtCode;
    if (
      i === statements.length - 1 &&
      !stmtCode.startsWith("if") &&
      !stmtCode.startsWith("return")
    ) {
      return `return ${stmtCode}`;
    }
    return stmtCode;
  });

  return `${asyncKeyword}(${operation.value.parameters.map((p) => p.name).join(", ")}) => {
    ${bodyLines.join(";\n")}
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
  const packageImports = Array.from(codeGenContext.usedPackages)
    .filter((pkg) => pkg in PACKAGE_REGISTRY)
    .map((pkg) => PACKAGE_REGISTRY[pkg].importStatement)
    .join(";\n");
  const imports = `import * as _ from '../built-in.js';\nimport * as R from 'remeda';\n${packageImports ? packageImports + ";\n" : ""}${userImports}\n`;
  return `${imports}\nconst ${operationName} = ${callback};\nexport default ${operationName};`;
}
