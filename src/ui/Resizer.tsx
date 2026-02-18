import { useState, useEffect } from "react";

export function Resizer({
  setPanelSize,
  type = "width",
  direction = "positive",
  minSize,
  maxSize,
  className,
}: {
  type: "width" | "height";
  direction?: "positive" | "negative";
  minSize?: number;
  maxSize?: number;
  setPanelSize: (value: { width?: number; height?: number }) => void;
  className?: string;
}) {
  const [dragging, setDragging] = useState(false);

  function handleSize(clientPosition: number) {
    const dimension = type === "width" ? window.innerWidth : window.innerHeight;
    const value =
      direction === "positive" ? clientPosition : dimension - clientPosition;
    setPanelSize({
      [type]: Math.min(Math.max(value, minSize ?? 0), maxSize ?? Infinity),
    });
  }

  function onMouseMove(e: MouseEvent | TouchEvent) {
    if (dragging) {
      const clientX =
        e instanceof MouseEvent ? e.clientX : e.touches[0].clientX;
      const clientY =
        e instanceof MouseEvent ? e.clientY : e.touches[0].clientY;
      document.body.style.pointerEvents = "none";
      document.body.style.userSelect = "none";
      handleSize(type === "width" ? clientX : clientY);
    }
  }

  const onMouseUp = () => {
    document.body.style.pointerEvents = "";
    document.body.style.userSelect = "";
    setDragging(false);
  };

  useEffect(() => {
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("touchmove", onMouseMove, { passive: true });
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("touchend", onMouseUp, { passive: true });

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("touchmove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("touchend", onMouseUp);
    };
  });

  const containerStyles =
    type === "width"
      ? "h-full w-0.5 cursor-ew-resize"
      : "h-0.5 w-full cursor-ns-resize";

  const innerStyles =
    type === "width"
      ? "top-0 -right-0.5 w-1.5 h-full"
      : "left-0 -top-0.5 h-1.5 w-full";

  return (
    <div
      className={[
        "relative bg-dropdown-hover",
        containerStyles,
        className,
      ].join(" ")}
      onMouseDown={(e) => {
        setDragging(true);
        onMouseMove(e as unknown as MouseEvent);
      }}
      onTouchStart={(e) => {
        setDragging(true);
        onMouseMove(e as unknown as MouseEvent);
      }}
      onDoubleClick={() => {
        const dimension =
          type === "width" ? window.innerWidth : window.innerHeight;
        handleSize(dimension * (direction === "positive" ? 0.25 : 0.75));
      }}
      role="separator"
    >
      <div
        className={`absolute z-50 hover:bg-dropdown-hover ${
          dragging ? "bg-dropdown-hover" : "bg-transparent"
        } ${innerStyles}`}
      />
    </div>
  );
}
