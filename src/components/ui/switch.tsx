import { cn } from "../../lib/utils";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

export function Switch({
  checked,
  onCheckedChange,
  disabled,
  id,
  className,
  ...rest
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-5.5 w-9.5 shrink-0 items-center rounded-full border border-transparent p-0.5",
        "outline-none transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]",
        "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-accent" : "bg-surface-2 border-border",
        className,
      )}
      {...rest}
    >
      <span
        aria-hidden
        className={cn(
          "size-4 rounded-full bg-surface shadow-sm",
          "transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
          checked ? "translate-x-4" : "translate-x-0",
        )}
      />
    </button>
  );
}
