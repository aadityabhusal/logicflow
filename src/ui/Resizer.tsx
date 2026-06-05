import { useState, useEffect, useRef } from "react";

export function Resizer({
  setPanelSize,
  type = "width",
  direction = "positive",
  minSize,
  maxSize,
  className,
  hitAreaClassName,
}: {
  type: "width" | "height";
  direction?: "positive" | "negative";
  minSize?: number;
  maxSize?: number;
  setPanelSize: (value: { width?: number; height?: number }) => void;
  className?: string;
  hitAreaClassName?: string;
}) {
  const [dragging, setDragging] = useState(false);
  const dragOffsetRef = useRef(0);

  function handleSize(clientPosition: number) {
    const dimension = type === "width" ? window.innerWidth : window.innerHeight;
    const value =
      (direction === "positive" ? clientPosition : dimension - clientPosition) +
      dragOffsetRef.current;
    setPanelSize({
      [type]: Math.min(Math.max(value, minSize ?? 0), maxSize ?? Infinity),
    });
  }

  function startDragging(clientPos: number, rect: DOMRect) {
    const edgePos =
      type === "width"
        ? rect[direction === "positive" ? "right" : "left"]
        : rect[direction === "positive" ? "bottom" : "top"];
    dragOffsetRef.current =
      direction === "positive" ? edgePos - clientPos : clientPos - edgePos;
    setDragging(true);
    handleSize(clientPos);
  }

  function onMouseMove(e: MouseEvent | TouchEvent) {
    if (dragging) {
      if ("touches" in e) {
        e.preventDefault();
        if (!e.touches[0]) return;
      }

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
    dragOffsetRef.current = 0;
    setDragging(false);
  };

  useEffect(() => {
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("touchmove", onMouseMove, { passive: false });
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
    hitAreaClassName ??
    (type === "width"
      ? "top-0 -right-0.5 w-1.5 h-full"
      : "left-0 -top-0.5 h-1.5 w-full");

  const hitAreaFeedbackStyles = hitAreaClassName
    ? "bg-transparent"
    : `hover:bg-dropdown-hover ${
        dragging ? "bg-dropdown-hover" : "bg-transparent"
      }`;

  return (
    <div
      className={[
        "relative touch-none bg-dropdown-hover",
        containerStyles,
        className,
      ].join(" ")}
      onMouseDown={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        startDragging(type === "width" ? e.clientX : e.clientY, rect);
      }}
      onTouchStart={(e) => {
        e.preventDefault();
        const touch = e.touches[0];
        if (touch) {
          const rect = e.currentTarget.getBoundingClientRect();
          startDragging(type === "width" ? touch.clientX : touch.clientY, rect);
        }
      }}
      onDoubleClick={() => {
        const dimension =
          type === "width" ? window.innerWidth : window.innerHeight;
        handleSize(dimension * (direction === "positive" ? 0.25 : 0.75));
      }}
      role="separator"
    >
      <div
        className={`absolute z-50 touch-none ${hitAreaFeedbackStyles} ${innerStyles}`}
      />
    </div>
  );
}
