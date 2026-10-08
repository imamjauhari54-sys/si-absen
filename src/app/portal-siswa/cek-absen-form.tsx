"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { cekAbsenAction, type CekAbsenState } from "@/lib/auth/student-actions";
import AuthField, { IdCardIcon } from "@/components/auth/AuthField";

const initialState: CekAbsenState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="auth-pill shrink-0 px-9 py-3 rounded-full text-sm font-bold uppercase tracking-wide text-white hover:-translate-y-0.5 transition-all disabled:opacity-70 disabled:translate-y-0 flex items-center justify-center gap-2"
    >
      {pending ? (
        <>
          Memeriksa <i className="fa-solid fa-circle-notch fa-spin" />
        </>
      ) : (
        <>Lihat Absensi</>
      )}
    </button>
  );
}

export default function CekAbsenForm() {
  const [state, formAction] = useActionState(cekAbsenAction, initialState);

  return (
    <form
      action={formAction}
      className="text-left w-full max-w-[420px] mx-auto flex flex-1 flex-col"
    >
      <div className="flex flex-col gap-2">
        <AuthField
          id="nisn"
          name="nisn"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={20}
          label="NISN"
          icon={<IdCardIcon />}
          required
          autoFocus
          invalid={!!state?.error}
        />
        <p className="text-xs text-slate-400 dark:text-slate-500 pl-1">
          Contoh: 0091234567
        </p>
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

      {/* mt-auto: tombol sejajar dengan tab Masuk */}
      <div className="mt-auto pt-4 flex items-center justify-between gap-4 flex-wrap">
        <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 max-w-[200px] leading-snug">
          NISN ada di kartu pelajar atau rapor. Tanpa password.
        </span>
        <SubmitButton />
      </div>
    </form>
  );
}
