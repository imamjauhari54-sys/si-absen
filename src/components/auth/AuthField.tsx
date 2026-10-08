import type { InputHTMLAttributes, ReactNode } from "react";

/**
 * Field outlined dengan floating label (gaya Material).
 *
 * - Kosong & tidak fokus : label tampil sebagai placeholder di dalam kotak.
 * - Fokus / sudah terisi : label naik & menempel di garis border atas.
 *
 * Murni CSS (lihat `.auth-field-*` di auth.css) — tanpa state, jadi aman
 * dipakai di server maupun client component. Warna aksen mengikuti tema tab.
 */
type AuthFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id" | "placeholder" | "className"
> & {
  id: string;
  label: string;
  icon: ReactNode;
  /** Elemen di sisi kanan (mis. tombol lihat/sembunyikan password). */
  trailing?: ReactNode;
  invalid?: boolean;
};

export default function AuthField({
  id,
  label,
  icon,
  trailing,
  invalid,
  ...inputProps
}: AuthFieldProps) {
  return (
    <div className="auth-field">
      <input
        {...inputProps}
        id={id}
        placeholder=" " /* wajib: dipakai selector :placeholder-shown */
        aria-invalid={invalid || undefined}
        className={
          trailing
            ? "auth-field-input auth-field-input--trailing"
            : "auth-field-input"
        }
      />
      <label htmlFor={id} className="auth-field-label">
        {label}
      </label>
      <span className="auth-field-icon" aria-hidden="true">
        {icon}
      </span>
      {trailing && <span className="auth-field-trailing">{trailing}</span>}
    </div>
  );
}

/* ---------- Ikon outline (inline SVG, tanpa dependensi) ---------- */

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function UserIcon() {
  return (
    <Svg>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </Svg>
  );
}

export function LockIcon() {
  return (
    <Svg>
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </Svg>
  );
}

export function IdCardIcon() {
  return (
    <Svg>
      <path d="M16 10h2" />
      <path d="M16 14h2" />
      <path d="M6.17 15a3 3 0 0 1 5.66 0" />
      <circle cx="9" cy="11" r="2" />
      <rect x="2" y="5" width="20" height="14" rx="2" />
    </Svg>
  );
}

export function EyeIcon() {
  return (
    <Svg>
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  );
}

export function EyeOffIcon() {
  return (
    <Svg>
      <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
      <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
      <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
      <path d="m2 2 20 20" />
    </Svg>
  );
}
