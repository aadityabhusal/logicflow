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
  getActualOperationName,
  getUnionActiveType,
  isDataOfType,
  inferTypeFromValue,
  getStatementResult,
  getTypeSignature,
  isBlockCondition,
  isValidIdentifier,
  isObject,
} from "./utils";
import { builtInOperationsByName } from "./operations/built-in";
import {
  PACKAGE_REGISTRY,
  SOURCE_PACKAGE_MAP,
  getAllInstanceTypes,
} from "./packages/registry";
import { PACKAGE_CATALOG } from "./packages/catalog";
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

type OperationSource = {
  type: "instance" | "remeda" | "external" | "builtin" | "userDefined";
  packageName?: string;
  packageCallTarget?: "import" | "member";
  callStyle?: "method" | "function";
};

type CodeGenContext = Context & {
  showResult?: boolean;
  getOperation: (name: string) => OperationListItem | undefined;
  importedOperations: Set<string>;
  usedPackages: Set<string>;
  currentOperationName?: string;
};

export function createCodeGenContext(
  context: Context,
  options?: {
    showResult?: boolean;
    currentOperationName?: string;
  }
): CodeGenContext {
  return {
    ...context,
    showResult: options?.showResult,
    currentOperationName: options?.currentOperationName,
    importedOperations: new Set(),
    usedPackages: new Set(),
    getOperation: (name: string) => builtInOperationsByName.get(name)?.[0],
  };
}
function getPackageImportName(
  packageName: string,
  context?: CodeGenContext
): string {
  return (
    context?.packageAliases?.[packageName] ??
    PACKAGE_REGISTRY[packageName]?.importName ??
    packageName
  );
}

function stripPackagePrefix(name: string, packageName: string): string {
  const prefix = packageName + ".";
  return name.startsWith(prefix) ? name.slice(prefix.length) : name;
}

const VARIABLE_REGEX = /^const\s+[a-zA-Z_$][a-zA-Z0-9_$]*\s*=\s*/;

function toReturnStatement(code: string): string {
  return `return ${code.replace(VARIABLE_REGEX, "")}`;
}

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
    return `{${data.value.entries.map((entry) => `${isValidIdentifier(entry.key) ? entry.key : JSON.stringify(entry.key)}: ${generateStatement(entry.value, context, true)}`).join(", ")}}`;
  } else if (isDataOfType(data, "error")) {
    return `new Error(${JSON.stringify(data.value.reason)})`;
  } else if (isDataOfType(data, "instance")) {
    const config = getAllInstanceTypes()[data.value.className];
    if (config?.importInfo) {
      context.usedPackages.add(config.importInfo.packageName);
      const importName = getPackageImportName(
        config.importInfo.packageName,
        context
      );
      if (config.referenceExpression) {
        const member = config.referenceExpression.slice(
          config.referenceExpression.indexOf(".") + 1
        );
        return `${importName}.${member}`;
      }
      const constructorArgs = data.value.constructorArgs
        .map((arg) => generateStatement(arg, context, true))
        .join(", ");
      const bareClassName = stripPackagePrefix(
        data.value.className,
        config.importInfo.packageName
      );
      return `new ${importName}.${bareClassName}(${constructorArgs})`;
    }
    const constructorArgs = data.value.constructorArgs
      .map((arg) => generateStatement(arg, context, true))
      .join(", ");
    return `new ${data.value.className}(${constructorArgs})`;
  } else if (isDataOfType(data, "operation")) {
    const builtInRef = generateBuiltInOperationRef(data, context);
    if (builtInRef) return builtInRef;
    return generateCallback(data, { ...context, showResult: undefined });
  } else if (isDataOfType(data, "condition")) {
    const condVal = data.value as DataValue<ConditionType>;
    const condValExpr = generateConditionExpr(condVal, context);
    return generateTernaryExpr(condValExpr, condVal, context);
  } else if (isDataOfType(data, "reference")) {
    if (data.type.isEnv) {
      return isValidIdentifier(data.value.name)
        ? `process.env.${data.value.name}`
        : `process.env[${JSON.stringify(data.value.name)}]`;
    }
    const name = data.value.name;
    const variable = context.variables.get(name);
    if (
      name &&
      name !== context.currentOperationName &&
      variable &&
      isDataOfType(variable.data, "operation")
    ) {
      const builtInRef = generateBuiltInOperationRef(variable.data, context);
      if (builtInRef) return builtInRef;
      context.importedOperations.add(name);
    }
    if (!variable && name !== context.currentOperationName) {
      const packageRef = generatePackageOperationRef(name, context);
      if (packageRef) return packageRef;
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
  if (!opName) return { type: "userDefined" };

  const opItem = context.getOperation(opName);
  const source = { ...opItem?.source, ...operation.value.source };
  const sourceName = source.name;
  if (sourceName === "remeda") return { type: "remeda" };
  if (sourceName && sourceName in SOURCE_PACKAGE_MAP) {
    const pkgName = SOURCE_PACKAGE_MAP[sourceName];
    context.usedPackages.add(pkgName);
    const firstParamType = operation.type.parameters[0]?.type;
    return {
      type: "external",
      packageName: pkgName,
      packageCallTarget: source.packageCallTarget ?? "member",
      callStyle:
        source.callStyle ??
        (firstParamType?.kind === "instance" ? "method" : "function"),
    };
  }
  const firstParamType = operation.type.parameters[0]?.type;
  if (firstParamType?.kind === "instance") {
    const Constructor =
      getAllInstanceTypes()[firstParamType.className]?.Constructor;
    if (Constructor && typeof Constructor.prototype[opName] === "function") {
      return { type: "instance" };
    }
  }
  if (!opItem) return { type: "userDefined" };
  return { type: "builtin" };
}

function getPackageFuncName(
  packageName: string,
  operationName: string,
  callTarget: "import" | "member",
  context?: CodeGenContext
) {
  const importName = getPackageImportName(packageName, context);
  if (callTarget === "import") return importName;
  const bareName = stripPackagePrefix(operationName, packageName);
  return `${importName}.${bareName}`;
}

function generateBuiltInOperationRef(
  operation: IData<OperationType>,
  context: CodeGenContext
) {
  if (!operation.id?.startsWith("builtin:")) return undefined;

  const name = operation.value.name ?? "";
  const packageRef = generatePackageOperationRef(name, context);
  if (packageRef) return packageRef;

  const actualName = getActualOperationName(name);
  const sourceName =
    operation.value.source?.name ?? context.getOperation(name)?.source?.name;
  if (sourceName === "remeda") return `R.${actualName}`;
  return `_.${actualName}`;
}

function generatePackageOperationRef(name: string, context: CodeGenContext) {
  const dotIndex = name.indexOf(".");
  if (dotIndex === -1) return undefined;

  const packageName = name.slice(0, dotIndex);
  if (!(packageName in PACKAGE_CATALOG)) return undefined;

  context.usedPackages.add(packageName);
  return getPackageFuncName(packageName, name, "member", context);
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
  const actualName = getActualOperationName(operation.value.name ?? "");

  if (operation.value.name === "await") return ", _.await";
  if (operation.value.name === "call") return `, (arg) => arg(${params})`;

  switch (source.type) {
    case "instance":
      return `, (arg) => arg.${actualName}(${params})`;
    case "external": {
      if (source.callStyle !== "function") {
        return `, (arg) => arg.${actualName}(${params})`;
      }
      const fnName = getPackageFuncName(
        source.packageName ?? "",
        operation.value.name ?? "",
        source.packageCallTarget ?? "member",
        context
      );
      if (!params) return `, ${fnName}`;
      return `, (arg) => ${fnName}(arg, ${params})`;
    }
    case "remeda":
      return `, R.${actualName}${paramStr}`;
    case "builtin": {
      const name = `_.${actualName}`;
      return `, ${name}${paramStr}`;
    }
    case "userDefined": {
      if (
        actualName &&
        actualName !== context.currentOperationName &&
        context.variables.has(actualName)
      ) {
        context.importedOperations.add(actualName);
      }
      return `, ${paramStr ? `(arg) => ${actualName}${paramStr}` : actualName}`;
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
    return toReturnStatement(result);
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
    return toReturnStatement(result);
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
    /* @returns ${getTypeSignature(type?.result ?? { kind: "unknown" }, context)} */
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
      return toReturnStatement(stmtCode);
    }
    return stmtCode;
  });

  return `${asyncKeyword}(${operation.value.parameters.map((p) => p.name).join(", ")}) => {
    ${bodyLines.join(";\n")}
  }`;
}

function generateImports(codegenContext?: CodeGenContext): string {
  return [...(codegenContext?.usedPackages ?? [])]
    .map((pkg) => {
      const npmName = PACKAGE_CATALOG[pkg]?.packageName ?? pkg;
      const importKind = PACKAGE_CATALOG[pkg]?.importKind ?? "default";
      const name = getPackageImportName(pkg, codegenContext);
      if (PACKAGE_CATALOG[pkg]?.packageType === "virtual") {
        return `import * as ${name} from './lib/${pkg}.js';`;
      }
      if (importKind === "named") {
        const importName = PACKAGE_REGISTRY[pkg]?.importName ?? pkg;
        const _name = name !== importName ? `${importName} as ${name}` : name;
        return `import { ${_name} } from '${npmName}';`;
      }
      if (importKind === "namespace")
        return `import * as ${name} from '${npmName}';`;
      return `import ${name} from '${npmName}';`;
    })
    .join("\n");
}

export function generateOperation(
  operation: IData<OperationType>,
  context: Context
): string {
  const currentOperationName = operation.value.name ?? "op";
  const codeGenContext = createCodeGenContext(context, {
    currentOperationName,
  });
  const callback = generateCallback(operation, codeGenContext);
  const userImports = Array.from(codeGenContext.importedOperations)
    .map((name) => `import ${name} from './${name}.js';`)
    .join("\n");
  const packageImports = generateImports(codeGenContext);
  const imports = `import * as _ from './lib/built-in.js';\nimport * as R from 'remeda';\n${packageImports}${userImports}\n`;
  return `${imports}\nconst ${currentOperationName} = ${callback};\nexport default ${currentOperationName};`;
}
