import type { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options?: SelectOption[];
}

/**
 * A native <select> in a themed shell. Native keeps keyboard behaviour,
 * screen-reader support and the OS popup for free -- which is exactly right
 * for a desktop app.
 */
export function Select({ className, options, children, ...props }: SelectProps) {
  return (
    <div className="relative">
      <select
        className={cn(
          "h-9.5 w-full appearance-none rounded-lg border border-border bg-surface",
          "pl-3 pr-9 text-sm text-text outline-none",
          "transition-[border-color,box-shadow] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]",
          "hover:border-muted/40",
          "focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {options
          ? options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))
          : children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted"
      />
    </div>
  );
}
