import type { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

export const buttonVariants = cva(
  [
    "relative inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "rounded-lg font-medium select-none outline-none",
    "transition-[background-color,border-color,color,box-shadow,transform] duration-150",
    "ease-[cubic-bezier(0.23,1,0.32,1)]",
    "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
    "disabled:pointer-events-none disabled:opacity-45",
    "active:scale-[0.97]",
    "[&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-accent-fg shadow-sm hover:brightness-[1.07] active:brightness-[0.97]",
        secondary:
          "bg-surface text-text border border-border shadow-sm hover:bg-surface-2 hover:border-muted/35",
        ghost: "text-muted hover:bg-surface-2 hover:text-text",
        subtle: "bg-surface-2 text-text hover:bg-border/60",
        danger:
          "bg-transparent text-muted hover:bg-danger/12 hover:text-danger",
        link: "text-accent underline-offset-4 hover:underline px-0",
      },
      size: {
        sm: "h-8 px-3 text-[14px] [&_svg]:size-3.5",
        md: "h-9.5 px-4 text-sm [&_svg]:size-4",
        lg: "h-11 px-6 text-[16px] [&_svg]:size-[18px]",
        icon: "size-9 [&_svg]:size-[18px]",
        iconSm: "size-7 rounded-md [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
