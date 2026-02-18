import { ReactNode } from "react";

export function NoteText(props: {
  italic?: boolean;
  center?: boolean;
  border?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={[
        "text-sm text-disabled p-1 flex-1",
        props.border ? "border-b" : "",
        props.className,
      ].join(" ")}
      style={{
        ...(props.center ? { textAlign: "center" } : {}),
        ...(props.italic ? { fontStyle: "italic" } : {}),
      }}
    >
      {props.children}
    </p>
  );
}
