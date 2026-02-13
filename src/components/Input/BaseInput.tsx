import {
  NumberInput,
  NumberInputProps,
  TextInput,
  TextInputProps,
} from "@mantine/core";
import { useUncontrolled, useMediaQuery } from "@mantine/hooks";
import { forwardRef, memo, useState } from "react";
import { useUiConfigStore } from "@/lib/store";
import { MAX_SCREEN_WIDTH } from "@/lib/data";

export interface BaseInputProps<T extends string | number>
  extends Omit<
    TextInputProps & NumberInputProps,
    "value" | "onChange" | "type" | "defaultValue"
  > {
  value?: T;
  onChange?: (change: T) => void;
  defaultValue?: T;
  type?: "text" | "number";
  containerClassName?: string;
  options?: { withQuotes?: boolean; forceEnableKeyboard?: boolean };
}

function BaseInputInner<T extends string | number>(
  { value, type, onChange, defaultValue, options, ...props }: BaseInputProps<T>,
  ref: React.ForwardedRef<HTMLInputElement>
) {
  const smallScreen = useMediaQuery(`(max-width: ${MAX_SCREEN_WIDTH}px)`);
  const disableKeyboard = useUiConfigStore(
    (s) => s.disableKeyboard && !options?.forceEnableKeyboard && smallScreen
  );

  const MAX_WIDTH = 160;
  const [textWidth, setTextWidth] = useState(0);
  const [inputValue, setInputValue] = useUncontrolled({
    value,
    defaultValue,
    onChange,
  });

  const commonProps = {
    ...props,
    value: inputValue,
    classNames: {
      wrapper: "flex gap-1 items-center",
      input: [
        "number-input outline-0 bg-inherit border-none p-0",
        props.className,
        textWidth >= MAX_WIDTH ? "truncate" : "",
      ].join(" "),
    },
    readOnly: disableKeyboard,
    styles: { input: { width: textWidth, ...props.styles } },
    onClick: props.onClick,
  } as typeof props;

  return (
    <div
      className={`relative flex flex-col py-0 ${
        options?.withQuotes ? "px-[7px] input-quotes" : "px-0"
      } ${props.containerClassName}`}
    >
      <div
        className="self-start h-0 overflow-hidden whitespace-pre max-w-40"
        ref={(elem) => setTextWidth(elem?.clientWidth || 14)}
      >
        {inputValue}
      </div>
      {type === "number" ? (
        <NumberInput
          {...commonProps}
          ref={ref}
          onChange={(value) => setInputValue(value as T)}
          placeholder={"0"}
          withKeyboardEvents={false}
          hideControls
        />
      ) : (
        <TextInput
          {...commonProps}
          type="text"
          ref={ref}
          onChange={(e) => setInputValue(e.target.value as T)}
          placeholder={"..."}
        />
      )}
    </div>
  );
}

export const BaseInput = memo(forwardRef(BaseInputInner)) as <
  T extends string | number
>(
  props: BaseInputProps<T> & { ref?: React.ForwardedRef<HTMLInputElement> }
) => React.ReactElement | null;
