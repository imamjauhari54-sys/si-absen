"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { loginAction, type LoginState } from "@/lib/auth/actions";

const initialState: LoginState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full py-4 rounded-2xl font-bold text-white bg-gradient-to-br from-teal-600 to-cyan-500 shadow-lg shadow-teal-600/20 hover:-translate-y-0.5 hover:shadow-xl transition-all disabled:opacity-70 disabled:translate-y-0 flex items-center justify-center gap-2 mt-2"
    >
      {pending ? (
        <>
          Memverifikasi... <i className="fa-solid fa-circle-notch fa-spin" />
        </>
      ) : (
        <>
          Masuk Sekarang <i className="fa-solid fa-arrow-right" />
        </>
      )}
    </button>
  );
}

export default function LoginForm() {
  const [state, formAction] = useActionState(loginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="text-left">
      {state?.error && (
        <div className="flex items-start gap-3 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-300 border border-rose-100 dark:border-rose-900/40 rounded-2xl p-4 text-sm font-semibold mb-5">
          <i className="fa-solid fa-circle-exclamation mt-0.5" />
          <span>{state.error}</span>
        </div>
      )}

      <div className="mb-5">
        <label className="block text-xs font-bold uppercase tracking-wide text-slate-800 dark:text-slate-200 mb-2 pl-1">
          Identitas Pengguna
        </label>
        <div className="relative">
          <i className="fa-solid fa-user absolute left-[18px] top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            name="username"
            required
            autoFocus
            autoComplete="username"
            placeholder="ID Pengguna"
            className="w-full pl-[50px] pr-4 py-[15px] rounded-2xl border-[1.5px] border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50 font-medium focus:outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/20 transition-all"
          />
        </div>
      </div>

      <div className="mb-2">
        <label className="block text-xs font-bold uppercase tracking-wide text-slate-800 dark:text-slate-200 mb-2 pl-1">
          Kata Sandi
        </label>
        <div className="relative">
          <i className="fa-solid fa-lock absolute left-[18px] top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type={showPassword ? "text" : "password"}
            name="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
            className="w-full pl-[50px] pr-11 py-[15px] rounded-2xl border-[1.5px] border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50 font-medium focus:outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/20 transition-all"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-[18px] top-1/2 -translate-y-1/2 text-slate-400"
            tabIndex={-1}
            aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
          >
            <i className={`fa-solid ${showPassword ? "fa-eye-slash" : "fa-eye"}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      <SubmitButton />
    </form>
  );
}
