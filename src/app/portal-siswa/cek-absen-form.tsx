"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { cekAbsenAction, type CekAbsenState } from "@/lib/auth/student-actions";

const initialState: CekAbsenState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full py-4 rounded-2xl font-bold text-white bg-gradient-to-br from-indigo-600 to-purple-600 shadow-lg shadow-indigo-600/20 hover:-translate-y-0.5 hover:shadow-xl transition-all disabled:opacity-70 disabled:translate-y-0 flex items-center justify-center gap-2 mt-2"
    >
      {pending ? (
        <>
          Memeriksa... <i className="fa-solid fa-circle-notch fa-spin" />
        </>
      ) : (
        <>
          Lihat Absensi Saya <i className="fa-solid fa-arrow-right" />
        </>
      )}
    </button>
  );
}

export default function CekAbsenForm() {
  const [state, formAction] = useActionState(cekAbsenAction, initialState);

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
          Nomor Induk Siswa Nasional (NISN)
        </label>
        <div className="relative">
          <i className="fa-solid fa-id-card absolute left-[18px] top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            name="nisn"
            required
            autoFocus
            maxLength={20}
            placeholder="Contoh: 0091234567"
            className="w-full pl-[50px] pr-4 py-[15px] rounded-2xl border-[1.5px] border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50 font-medium tracking-wide focus:outline-none focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/20 transition-all"
          />
        </div>
        <p className="text-xs text-slate-400 mt-2 pl-1">
          NISN bisa dilihat di kartu pelajar atau rapor. Tanpa perlu password.
        </p>
      </div>

      <SubmitButton />
    </form>
  );
}
