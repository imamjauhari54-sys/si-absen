"use client";

import { forwardRef } from "react";

interface Props {
  id: string;
  value: string;
  onChange: (v: string) => void;
  label?: string;
  error?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

/** Kolom PIN 6 digit: tersamar, papan angka di HP, dan hanya menerima angka (tempel "12 34 56" pun dibersihkan). */
const PinInput = forwardRef<HTMLInputElement, Props>(function PinInput({ id, value, onChange, label = "PIN", error, disabled, autoFocus }, ref) {
  return (
    <div>
      <label htmlFor={id} className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        maxLength={6}
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : undefined}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        placeholder="••••••"
        className={`w-full sm:w-44 h-11 px-3 bg-gray-50 dark:bg-gray-800/50 border text-gray-800 dark:text-gray-100 rounded-xl text-base font-mono tracking-[0.4em] focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-60 ${
          error ? "border-rose-400" : "border-gray-200 dark:border-gray-700"
        }`}
      />
      {error && (
        <p id={`${id}-err`} className="mt-1 text-xs font-semibold text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </div>
  );
});

export default PinInput;
