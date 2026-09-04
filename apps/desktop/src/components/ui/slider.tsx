import type { CSSProperties, InputHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export interface SliderProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> {
  value: number;
  min: number;
  max: number;
  step?: number;
  onValueChange: (value: number) => void;
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onValueChange,
  className,
  style,
  ...props
}: SliderProps) {
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      className={cn("ihp-slider", className)}
      style={{ ["--ihp-fill" as keyof CSSProperties]: `${pct}%`, ...style } as CSSProperties}
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onValueChange(Number(e.currentTarget.value))}
      {...props}
    />
  );
}
