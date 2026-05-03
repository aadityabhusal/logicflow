import { Fragment } from "react";
import { theme } from "@/lib/theme";
import {
  ArrayType,
  ConditionType,
  DictionaryType,
  IData,
  ObjectType,
  TupleType,
} from "@/lib/types";
import { Context } from "@/lib/execution/types";
import { ParseStatement } from "./ParseStatement";
import { createData, inferTypeFromValue, isDataOfType } from "@/lib/utils";

export function ParseData({
  data,
  showData,
  nest = 0,
  context,
}: {
  data: IData;
  showData?: boolean;
  nest?: number;
  context: Context;
}) {
  if (!showData && isDataOfType(data, "reference")) {
    return <span className="text-variable">{data.value.name}</span>;
  }
  if (isDataOfType(data, "array") || isDataOfType(data, "tuple")) {
    return (
      <ParseArray
        data={data}
        showData={showData}
        nest={nest}
        context={context}
      />
    );
  }
  if (isDataOfType(data, "object") || isDataOfType(data, "dictionary")) {
    return (
      <ParseObject
        data={data}
        showData={showData}
        nest={nest}
        context={context}
      />
    );
  }
  if (isDataOfType(data, "condition")) {
    return (
      <ParseCondition
        data={data}
        showData={showData}
        nest={nest}
        context={context}
      />
    );
  }
  if (isDataOfType(data, "union")) {
    return (
      <ParseData
        data={{
          ...data,
          type: inferTypeFromValue(data.value, context),
        }}
        showData={showData}
        nest={nest}
        context={context}
      />
    );
  }
  if (isDataOfType(data, "error")) {
    return (
      <span style={{ whiteSpace: "pre", color: theme.color.error }}>
        {data.value.reason}
      </span>
    );
  }
  if (isDataOfType(data, "instance")) {
    return <span className="text-instance">{data.value.className}</span>;
  }
  return (
    <span
      style={{
        whiteSpace: "pre",
        color: theme.color[data.type.kind as keyof typeof theme.color],
      }}
    >
      {isDataOfType(data, "string") ? `"${data.value}"` : `${data.value}`}
    </span>
  );
}

function ParseObject({
  data,
  showData,
  nest = 0,
  context,
}: {
  data: IData<ObjectType | DictionaryType>;
  showData?: boolean;
  nest?: number;
  context: Context;
}) {
  return (
    <span className="gap-1">
      <span className="text-method">{"{"}</span>
      {data.value.entries.map((entry, i) => (
        <Fragment key={entry.value.id}>
          <span className="text-property">{entry.key}</span>
          {": "}
          <ParseStatement
            statement={entry.value}
            showData={showData}
            nest={nest}
            context={context}
          />
          {i + 1 < data.value.entries.length && ", "}
        </Fragment>
      ))}
      <span className="text-method">{"}"}</span>
    </span>
  );
}

function ParseArray({
  data,
  showData,
  nest = 0,
  context,
}: {
  data: IData<ArrayType | TupleType>;
  showData?: boolean;
  nest?: number;
  context: Context;
}) {
  return (
    <span className="gap-1">
      <span className="text-method">{"["}</span>
      {data.value.map((item, i, arr) => (
        <Fragment key={item.id}>
          <ParseStatement
            statement={item}
            showData={showData}
            nest={nest}
            context={context}
          />
          {i + 1 < arr.length && ", "}
        </Fragment>
      ))}
      <span className="text-method">{"]"}</span>
    </span>
  );
}

function ParseCondition({
  data,
  showData,
  nest = 0,
  context,
}: {
  data: IData<ConditionType>;
  showData?: boolean;
  nest?: number;
  context: Context;
}) {
  const condVal = data.value;
  const tabs = "  ".repeat(nest);

  if (condVal.trueBranch.length <= 1 && condVal.falseBranch.length <= 1) {
    return (
      <span className="gap-1">
        <ParseStatement
          statement={condVal.condition}
          showData={showData}
          nest={nest}
          context={context}
        />
        <span>{" ? "}</span>
        <ParseStatement
          statement={
            condVal.trueBranch.length > 0
              ? condVal.trueBranch[0]
              : { id: "", data: createData(), operations: [] }
          }
          showData={showData}
          nest={nest}
          context={context}
        />
        <span>{" : "}</span>
        <ParseStatement
          statement={
            condVal.falseBranch.length > 0
              ? condVal.falseBranch[0]
              : { id: "", data: createData(), operations: [] }
          }
          showData={showData}
          nest={nest}
          context={context}
        />
      </span>
    );
  }

  return (
    <div>
      <span>
        <span className="text-reserved">if</span>
        {" ("}
        <ParseStatement
          statement={condVal.condition}
          showData={showData}
          nest={nest}
          context={context}
        />
        {") {\n"}
      </span>
      {condVal.trueBranch.map((stmt) => (
        <span key={stmt.id}>
          {tabs}
          {"  "}
          <ParseStatement
            statement={stmt}
            showData={showData}
            nest={nest + 1}
            context={context}
          />
          {";\n"}
        </span>
      ))}
      <span>
        {tabs}
        {"} else {\n"}
      </span>
      {condVal.falseBranch.map((stmt) => (
        <span key={stmt.id}>
          {tabs}
          {"  "}
          <ParseStatement
            statement={stmt}
            showData={showData}
            nest={nest + 1}
            context={context}
          />
          {";\n"}
        </span>
      ))}
      <span>
        {tabs}
        {"}"}
      </span>
    </div>
  );
}
