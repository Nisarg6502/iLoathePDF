import { createContext, useContext, useId, type ReactNode } from "react";
import { cn } from "../../lib/utils";

interface RadioGroupContextValue {
  name: string;
  value: string;
  onValueChange: (value: string) => void;
}

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null);

export interface RadioGroupProps {
  value: string;
  onValueChange: (value: string) => void;
  name?: string;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}

export function RadioGroup({
  value,
  onValueChange,
  name,
  className,
  children,
  ...rest
}: RadioGroupProps) {
  const auto = useId();
  return (
    <RadioGroupContext.Provider value={{ name: name ?? auto, value, onValueChange }}>
      <div role="radiogroup" className={cn("grid gap-2", className)} {...rest}>
        {children}
      </div>
    </RadioGroupContext.Provider>
  );
}

export interface RadioGroupItemProps {
  value: string;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  className?: string;
}

/**
 * A selectable card. The native input stays in the DOM (sr-only) so keyboard
 * arrow-key navigation and screen readers behave exactly as expected.
 */
export function RadioGroupItem({ value, label, hint, disabled, className }: RadioGroupItemProps) {
  const ctx = useContext(RadioGroupContext);
  if (!ctx) throw new Error("RadioGroupItem must be used inside a RadioGroup");
  const checked = ctx.value === value;

  return (
    <label
      className={cn(
        "group relative flex cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-2.5",
        "transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]",
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-bg",
        checked
          ? "border-accent bg-accent-soft/60"
          : "border-border bg-surface hover:border-muted/40 hover:bg-surface-2",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <input
        type="radio"
        className="sr-only"
        name={ctx.name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => ctx.onValueChange(value)}
      />
      <span
        aria-hidden
        className={cn(
          "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border",
          "transition-[border-color,background-color] duration-150",
          checked ? "border-accent bg-accent" : "border-border bg-surface",
        )}
      >
        <span
          className={cn(
            "size-1.5 rounded-full bg-accent-fg transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]",
            checked ? "scale-100" : "scale-0",
          )}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-medium leading-5 text-text">{label}</span>
        {hint ? (
          <span className="mt-0.5 block text-xs leading-relaxed text-muted">{hint}</span>
        ) : null}
      </span>
    </label>
  );
}
