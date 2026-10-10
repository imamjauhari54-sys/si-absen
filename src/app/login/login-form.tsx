"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { loginAction, type LoginState } from "@/lib/auth/actions";
import AuthField, {
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  UserIcon,
} from "@/components/auth/AuthField";

const initialState: LoginState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="auth-pill w-full px-6 py-2.5 md:py-3 rounded-full cursor-pointer disabled:cursor-not-allowed text-sm font-bold uppercase tracking-wide text-white hover:-translate-y-0.5 transition-all disabled:opacity-70 disabled:translate-y-0 flex items-center justify-center gap-2"
    >
      {pending ? (
        <>
          Memverifikasi <i className="fa-solid fa-circle-notch fa-spin" />
        </>
      ) : (
        <>Masuk</>
      )}
    </button>
  );
}

export default function LoginForm() {
  const [state, formAction] = useActionState(loginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);
  const hasError = !!state?.error;

  return (
    <form
      action={formAction}
      className="text-left w-full max-w-[420px] mx-auto flex flex-1 flex-col"
    >
      <div className="flex flex-col gap-4">
        <AuthField
          id="username"
          name="username"
          type="text"
          label="ID Pengguna"
          icon={<UserIcon />}
          required
          autoComplete="username"
          invalid={hasError}
        />

        <AuthField
          id="password"
          name="password"
          type={showPassword ? "text" : "password"}
          label="Kata Sandi"
          icon={<LockIcon />}
          required
          autoComplete="current-password"
          invalid={hasError}
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="auth-field-toggle"
              tabIndex={-1}
              aria-label={
                showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"
              }
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          }
        />
      </div>

      {state?.error && (
        <div
          role="alert"
          className="auth-enter-up mt-4 flex items-start gap-3 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-300 border border-rose-100 dark:border-rose-900/40 rounded-2xl px-4 py-3 text-[13px] font-semibold"
        >
          <i className="fa-solid fa-circle-exclamation mt-0.5" />
          <span>{state.error}</span>
        </div>
      )}

      {/* mt-auto: tombol selalu di posisi sama di semua tab */}
      <div className="mt-auto pt-4 flex flex-col gap-3">
        <SubmitButton />
        <span className="text-center text-xs font-semibold text-teal-600 dark:text-teal-400">
          Lupa kata sandi? Hubungi admin.
        </span>
      </div>
    </form>
  );
}
