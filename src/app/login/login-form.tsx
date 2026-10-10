"use client";

import { useActionState, useEffect, useState } from "react";
import type { KeyboardEvent } from "react";
import { useFormStatus } from "react-dom";
import { loginAction, type LoginState } from "@/lib/auth/actions";
import AuthField, {
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  UserIcon,
} from "@/components/auth/AuthField";

/**
 * Hasil login untuk tampilan.
 * - username   : diisi di sini (client) supaya kolom tidak kosong setelah gagal.
 * - retryAfter : (opsional, detik) sisa waktu lockout dari server.
 * - remaining  : (opsional) sisa percobaan sebelum lockout dari server.
 * Dua field terakhir hanya tampil kalau loginAction mengembalikannya.
 */
type LoginView = LoginState & {
  username?: string;
  retryAfter?: number;
  remaining?: number;
};

const initialState: LoginView = { error: null };

async function submitLogin(prev: LoginView, formData: FormData): Promise<LoginView> {
  const username = String(formData.get("username") ?? "");
  const result = (await loginAction(prev, formData)) as LoginView;
  return { ...result, username };
}

const mmss = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

function SubmitButton({ lockedFor }: { lockedFor: number }) {
  const { pending } = useFormStatus();
  const locked = lockedFor > 0;
  return (
    <button
      type="submit"
      disabled={pending || locked}
      className="auth-pill w-full px-6 py-2.5 md:py-3 rounded-full cursor-pointer disabled:cursor-not-allowed text-sm font-bold uppercase tracking-wide text-white hover:-translate-y-0.5 transition-all disabled:opacity-70 disabled:translate-y-0 flex items-center justify-center gap-2"
    >
      {pending ? (
        <>
          Memverifikasi <i className="fa-solid fa-circle-notch fa-spin" />
        </>
      ) : locked ? (
        <>
          <i className="fa-solid fa-lock" /> Coba lagi {mmss(lockedFor)}
        </>
      ) : (
        <>Masuk</>
      )}
    </button>
  );
}

export default function LoginForm() {
  const [state, formAction] = useActionState(submitLogin, initialState);
  const [showPassword, setShowPassword] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [lockedFor, setLockedFor] = useState(0);
  const [prevState, setPrevState] = useState(state);
  const hasError = !!state?.error;

  // Hasil login baru datang -> reset hitung mundur dari retryAfter server.
  // (Disesuaikan saat render, bukan di useEffect, supaya tidak memicu render berantai.)
  if (state !== prevState) {
    setPrevState(state);
    const s = state?.retryAfter ?? 0;
    setLockedFor(s > 0 ? Math.ceil(s) : 0);
  }

  // Detik berikutnya (setState di dalam callback timer = aman).
  useEffect(() => {
    if (lockedFor <= 0) return;
    const t = setTimeout(() => setLockedFor((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [lockedFor]);

  const checkCaps = (e: KeyboardEvent<HTMLInputElement>) =>
    setCapsOn(e.getModifierState("CapsLock"));

  const showRemaining =
    lockedFor <= 0 && typeof state?.remaining === "number" && state.remaining > 0;

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
          defaultValue={state?.username}
          invalid={hasError}
        />

        <div className="flex flex-col gap-1.5">
          <AuthField
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            label="Kata Sandi"
            icon={<LockIcon />}
            required
            autoComplete="current-password"
            invalid={hasError}
            onKeyDown={checkCaps}
            onKeyUp={checkCaps}
            onBlur={() => setCapsOn(false)}
            trailing={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="auth-field-toggle cursor-pointer"
                tabIndex={-1}
                aria-label={
                  showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"
                }
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            }
          />
          {capsOn && (
            <p
              role="status"
              className="auth-enter-up flex items-center gap-1.5 pl-1 text-xs font-semibold text-amber-600 dark:text-amber-400"
            >
              <i className="fa-solid fa-triangle-exclamation" /> Caps Lock sedang aktif
            </p>
          )}
        </div>
      </div>

      {state?.error && (
        <div
          role="alert"
          className="auth-enter-up mt-4 flex items-start gap-3 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-300 border border-rose-100 dark:border-rose-900/40 rounded-2xl px-4 py-3 text-[13px] font-semibold"
        >
          <i className="fa-solid fa-circle-exclamation mt-0.5" />
          <span>
            {state.error}
            {lockedFor > 0 && (
              <span className="block font-bold">
                Coba lagi dalam {mmss(lockedFor)}.
              </span>
            )}
            {showRemaining && (
              <span className="block font-bold">
                Sisa percobaan: {state.remaining}
              </span>
            )}
          </span>
        </div>
      )}

      {/* mt-auto: tombol selalu di posisi sama di semua tab */}
      <div className="mt-auto pt-4 flex flex-col gap-3">
        <SubmitButton lockedFor={lockedFor} />
        <span className="text-center text-xs font-semibold text-teal-600 dark:text-teal-400">
          Lupa kata sandi? Hubungi admin.
        </span>
      </div>
    </form>
  );
}
