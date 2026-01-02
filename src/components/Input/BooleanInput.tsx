import { forwardRef, HTMLAttributes, memo } from "react";
import { BooleanType, IData } from "../../lib/types";
import { getHotkeyHandler } from "@mantine/hooks";

export interface IBooleanInput extends HTMLAttributes<HTMLInputElement> {
  data: IData<BooleanType>;
  handleData: (data: IData<BooleanType>) => void;
  className?: string;
}
const BooleanInputComponent = (
  { data, handleData, className, ...props }: IBooleanInput,
  ref: React.ForwardedRef<HTMLInputElement>
) => {
  return (
    <div className="relative w-9 h-5">
      <input
        {...props}
        ref={ref}
        type="checkbox"
        checked={data.value as boolean}
        className={`peer appearance-none size-full bg-border rounded-full checked:bg-reserved transition-colors ${className}`}
        onChange={(e) => handleData({ ...data, value: e.target.checked })}
        onClick={props.onClick}
        onKeyDown={getHotkeyHandler([
          ["Enter", () => handleData({ ...data, value: !data.value })],
        ])}
      />
      <span className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4 pointer-events-none" />
    </div>
  );
};

export const BooleanInput = memo(forwardRef(BooleanInputComponent));
