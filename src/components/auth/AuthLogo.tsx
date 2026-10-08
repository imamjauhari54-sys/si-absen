import type { AuthTab } from "./AuthShell";

/**
 * Logo badge per tab: kotak membulat bergradien (ikut warna tema tab)
 * dengan glyph putih. Masuk = motif QR code, Siswa = topi toga.
 * SVG inline — tidak butuh Font Awesome.
 */
export default function AuthLogo({ variant }: { variant: AuthTab }) {
  return (
    <svg
      className="auth-logo-badge mx-auto"
      width="56"
      height="56"
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="authLogoGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "var(--c-from)" }} />
          <stop offset="1" style={{ stopColor: "var(--c-to)" }} />
        </linearGradient>
      </defs>

      <rect x="2" y="2" width="60" height="60" rx="18" fill="url(#authLogoGrad)" />
      {/* kilau halus di sisi atas */}
      <path
        d="M20 2h24a18 18 0 0 1 18 18v4C50 20 22 20 2 26v-6A18 18 0 0 1 20 2z"
        fill="#fff"
        opacity="0.14"
      />

      {variant === "masuk" ? (
        <g stroke="#fff" strokeWidth="2.6">
          {/* tiga penanda sudut QR */}
          <rect x="16" y="16" width="13" height="13" rx="3.5" />
          <rect x="35" y="16" width="13" height="13" rx="3.5" />
          <rect x="16" y="35" width="13" height="13" rx="3.5" />
          <g fill="#fff" stroke="none">
            <rect x="20.5" y="20.5" width="4" height="4" rx="1" />
            <rect x="39.5" y="20.5" width="4" height="4" rx="1" />
            <rect x="20.5" y="39.5" width="4" height="4" rx="1" />
            {/* modul data */}
            <rect x="35" y="35" width="5" height="5" rx="1.2" />
            <rect x="43" y="35" width="5" height="5" rx="1.2" />
            <rect x="39" y="39.5" width="5" height="5" rx="1.2" />
            <rect x="35" y="43" width="5" height="5" rx="1.2" />
            <rect x="43" y="43" width="5" height="5" rx="1.2" />
          </g>
        </g>
      ) : (
        <g
          transform="translate(14 14) scale(1.5)"
          stroke="#fff"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" />
          <path d="M22 10v6" />
          <path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" />
        </g>
      )}
    </svg>
  );
}
