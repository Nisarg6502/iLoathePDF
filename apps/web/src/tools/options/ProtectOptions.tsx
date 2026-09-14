import { useState } from "react";
import type { OptionsPanelProps } from "@/tools/ToolConfig";

export function ProtectOptions({ options, onChange, disabled }: OptionsPanelProps) {
  const [showPassword, setShowPassword] = useState(false);
  const mode = (options.mode as string) ?? "protect";
  const password = (options.password as string) ?? "";
  const confirmPassword = (options.confirmPassword as string) ?? "";
  const mismatch = mode === "protect" && confirmPassword.length > 0 && password !== confirmPassword;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1.5">
        {(["protect", "unlock"] as const).map((m) => (
          <label
            key={m}
            className={`flex-1 cursor-pointer rounded-lg border p-2.5 text-center ${mode === m ? "border-accent bg-accent-soft" : "border-border bg-surface-2"}`}
          >
            <input
              type="radio"
              name="protect-mode"
              className="sr-only"
              checked={mode === m}
              disabled={disabled}
              onChange={() => onChange({ ...options, mode: m, password: "", confirmPassword: "" })}
            />
            <div className="text-[12.5px] font-semibold capitalize">{m}</div>
          </label>
        ))}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-semibold">
          {mode === "protect" ? "Set password" : "Enter password"}
        </span>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            disabled={disabled}
            value={password}
            onChange={(e) => onChange({ ...options, password: e.target.value })}
            placeholder="At least 4 characters"
            className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 pr-14 text-sm"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[11.5px] text-muted hover:text-text"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </label>

      {mode === "protect" && (
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold">Confirm password</span>
          <input
            type={showPassword ? "text" : "password"}
            disabled={disabled}
            value={confirmPassword}
            onChange={(e) => onChange({ ...options, confirmPassword: e.target.value })}
            placeholder="Repeat the password"
            className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm"
          />
          {mismatch && <span className="text-[11.5px] text-danger">Passwords do not match.</span>}
        </label>
      )}

      <div className="rounded-lg bg-accent-soft p-3 text-[11.5px] leading-relaxed text-on-accent">
        {mode === "protect"
          ? "Anyone opening this PDF will need the password you set here."
          : "Enter the PDF's current password to remove it."}
      </div>
    </div>
  );
}
