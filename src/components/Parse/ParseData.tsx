import { Fragment } from "react";
import { theme } from "@/lib/theme";
import { ArrayType, ConditionType, IData, ObjectType } from "@/lib/types";
import { ParseStatement } from "./ParseStatement";
import {
  getConditionResult,
  inferTypeFromValue,
  isDataOfType,
} from "@/lib/utils";

export function ParseData({
  data,
  showData,
  nest = 0,
}: {
  data: IData;
  showData?: boolean;
  nest?: number;
}) {
  if (!showData && isDataOfType(data, "reference")) {
    return <span className="text-variable">{data.value.name}</span>;
  }
  if (isDataOfType(data, "array")) {
    return <ParseArray data={data} showData={showData} nest={nest} />;
  }
  if (isDataOfType(data, "object")) {
    return <ParseObject data={data} showData={showData} nest={nest} />;
  }
  if (isDataOfType(data, "condition")) {
    return (
      <ParseData
        data={getConditionResult(data.value)}
        showData={showData}
        nest={nest}
      />
    );
  }
  if (isDataOfType(data, "union")) {
    return (
      <ParseData
        data={{ ...data, type: inferTypeFromValue(data.value) }}
        showData={showData}
        nest={nest}
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
}: {
  data: IData<ObjectType>;
  showData?: boolean;
  nest?: number;
}) {
  const val = Array.from(data.value);
  return (
    <span className="gap-1">
      <span className="text-method">{"{"}</span>
      {val.map(([key, val], i, arr) => (
        <Fragment key={val.id}>
          <span className="text-property">{key}</span>
          {": "}
          <ParseStatement statement={val} showData={showData} nest={nest} />
          {i + 1 < arr.length && ", "}
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
}: {
  data: IData<ArrayType>;
  showData?: boolean;
  nest?: number;
}) {
  return (
    <span className="gap-1">
      <span className="text-method">{"["}</span>
      {data.value.map((item, i, arr) => (
        <Fragment key={item.id}>
          <ParseStatement statement={item} showData={showData} nest={nest} />
          {i + 1 < arr.length && ", "}
        </Fragment>
      ))}
      <span className="text-method">{"]"}</span>
    </span>
  );
}

function _ParseCondition({
  data,
  showData,
  nest = 0,
}: {
  data: IData<ConditionType>;
  showData?: boolean;
  nest?: number;
}) {
  return (
    <span className="gap-1">
      <ParseStatement
        statement={data.value.condition}
        showData={showData}
        nest={nest}
      />
      <span>{"?"}</span>
      <ParseStatement
        statement={data.value.true}
        showData={showData}
        nest={nest}
      />
      <span>{":"}</span>
      <ParseStatement
        statement={data.value.false}
        showData={showData}
        nest={nest}
      />
    </span>
  );
}
