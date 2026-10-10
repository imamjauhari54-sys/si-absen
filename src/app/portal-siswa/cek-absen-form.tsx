"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { cekAbsenAction, type CekAbsenState } from "@/lib/auth/student-actions";
import AuthField, { IdCardIcon } from "@/components/auth/AuthField";

/** `nisn` diisi di client supaya kolom tidak kosong setelah gagal. */
type CekAbsenView = CekAbsenState & { nisn?: string };

const initialState: CekAbsenView = { error: null };

async function submitCek(prev: CekAbsenView, formData: FormData): Promise<CekAbsenView> {
  const nisn = String(formData.get("nisn") ?? "");
  const result = (await cekAbsenAction(prev, formData)) as CekAbsenView;
  return { ...result, nisn };
}

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
          Memeriksa <i className="fa-solid fa-circle-notch fa-spin" />
        </>
      ) : (
        <>Lihat Absensi</>
      )}
    </button>
  );
}

export default function CekAbsenForm() {
  const [state, formAction] = useActionState(submitCek, initialState);

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
          defaultValue={state?.nisn}
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
      <div className="mt-auto pt-4 flex flex-col gap-3">
        <SubmitButton />
        <span className="text-center text-xs font-semibold text-indigo-600 dark:text-indigo-400">
          NISN ada di kartu pelajar atau rapor. Tanpa password.
        </span>
      </div>
    </form>
  );
}
