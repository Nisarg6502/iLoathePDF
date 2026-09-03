import type { LabelHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "text-[14px] font-medium leading-none text-text select-none",
        "peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
