"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import AuthLogo from "./AuthLogo";
import LoginForm from "@/app/login/login-form";
import CekAbsenForm from "@/app/portal-siswa/cek-absen-form";
import { checkExistingSessions } from "./session-check";
import type { AuthTab } from "./types";

const PATH: Record<AuthTab, string> = {
  masuk: "/login",
  siswa: "/portal-siswa",
};

/** Judul tab browser (sama dengan metadata di masing-masing page). */
const DOC_TITLE: Record<AuthTab, string> = {
  masuk: "Masuk",
  siswa: "Cek Absensi Siswa",
};

const PANE: Record<AuthTab, { title: string; sub: string }> = {
  masuk: { title: "Masuk", sub: "Masuk untuk mengelola absensi" },
  siswa: { title: "Portal Siswa", sub: "Masukkan NISN untuk cek kehadiran" },
};

/** Teks di pintu: menawarkan sisi SEBALIKNYA dari form yang sedang tampil. */
const DOOR: Record<AuthTab, { blurb: string; cta: string }> = {
  masuk: {
    blurb: "Siswa atau orang tua? Cek kehadiran cukup dengan NISN.",
    cta: "Portal Siswa",
  },
  siswa: {
    blurb: "Admin atau guru? Masuk untuk mengelola absensi.",
    cta: "Masuk Admin / Guru",
  },
};

/** Tujuan kalau browser ini sudah punya sesi di sisi tersebut. */
const DASHBOARD: Record<AuthTab, string> = {
  masuk: "/dashboard",
  siswa: "/portal-siswa/dashboard",
};

const other = (t: AuthTab): AuthTab => (t === "masuk" ? "siswa" : "masuk");

function tabFromPath(p: string | null): AuthTab | null {
  if (!p) return null;
  if (p.startsWith("/portal-siswa")) return "siswa";
  if (p.startsWith("/login")) return "masuk";
  return null;
}

function DoorArt({ tab }: { tab: AuthTab }) {
  const id = `authDoorBase-${tab}`;
  return (
    <svg
      className="auth-art"
      viewBox="0 0 360 450"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "var(--s2)" }} />
          <stop offset="1" style={{ stopColor: "var(--accent)" }} />
        </linearGradient>
      </defs>
      <rect width="360" height="450" fill={`url(#${id})`} />
      <polygon points="0,0 290,0 0,290" style={{ fill: "var(--s3)" }} opacity="0.55" />
      <polygon points="0,200 220,0 360,0 360,40 0,380" fill="#fff" opacity="0.1" />
      <polygon points="0,340 360,20 360,200 0,520" fill="#fff" opacity="0.12" />
      <polygon points="0,400 360,80 360,190 0,500" style={{ fill: "var(--s3)" }} opacity="0.35" />
      <polygon points="0,450 360,130 360,450" fill="#fff" opacity="0.1" />
    </svg>
  );
}

function Chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function DoorLayer({
  tab,
  visible,
  namaSekolah,
  onSwitch,
}: {
  tab: AuthTab;
  visible: boolean;
  namaSekolah: string;
  onSwitch: () => void;
}) {
  const d = DOOR[tab];
  return (
    <div
      className={`auth-door-layer auth-theme-${tab}`}
      data-visible={visible}
      inert={!visible}
      aria-hidden={!visible}
    >
      <DoorArt tab={tab} />
      <div className="auth-door-content">
        <AuthLogo variant={tab} tone="glass" />
        <h2 className="auth-door-title">SI-ABSEN</h2>
        <p className="auth-door-school">{namaSekolah}</p>
        <p className="auth-door-blurb">{d.blurb}</p>
        <button type="button" className="auth-door-btn" onClick={onSwitch}>
          {d.cta}
        </button>
      </div>
    </div>
  );
}

function Pane({
  tab,
  active,
  footer,
  children,
}: {
  tab: AuthTab;
  active: boolean;
  footer: ReactNode;
  children: ReactNode;
}) {
  const p = PANE[tab];
  return (
    <section
      className={`auth-pane auth-pane--${tab} auth-theme-${tab}`}
      data-pane={tab}
      data-active={active}
      inert={!active}
      aria-hidden={!active}
      aria-label={p.title}
    >
      <div className="auth-pane-inner">
        <header className="auth-pane-head">
          <h1 className="auth-title">{p.title}</h1>
          <p>{p.sub}</p>
        </header>
        <div className="auth-pane-body">{children}</div>
        <footer className="auth-pane-foot">{footer}</footer>
      </div>
    </section>
  );
}

export default function AuthExperience({
  initial,
  namaSekolah,
  footer,
}: {
  initial: AuthTab;
  namaSekolah: string;
  footer: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [active, setActive] = useState<AuthTab>(initial);
  const rootRef = useRef<HTMLDivElement>(null);
  const sessions = useRef({ masuk: false, siswa: false });
  const focusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Sinkron kalau URL berubah dari luar (tombol back/forward).
  // Disesuaikan saat render, bukan di useEffect, supaya tidak memicu render berantai.
  const [prevPath, setPrevPath] = useState(pathname);
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    const t = tabFromPath(pathname);
    if (t) setActive(t);
  }

  // Judul tab browser ikut berganti (tanpa menyentuh suffix template).
  useEffect(() => {
    document.title = document.title.replace(DOC_TITLE[other(active)], DOC_TITLE[active]);
  }, [active]);

  useEffect(() => () => clearTimeout(focusTimer.current), []);

  // Cek sekali di awal: kalau sisi sebelah sudah punya sesi aktif, klik tabnya
  // langsung diarahkan ke dashboard (tanpa harus refresh dulu).
  useEffect(() => {
    checkExistingSessions()
      .then((r) => {
        sessions.current = r;
      })
      .catch(() => {});
  }, []);

  const go = useCallback(
    (tab: AuthTab) => {
      if (tab === active) return;
      if (sessions.current[tab]) {
        router.push(DASHBOARD[tab]);
        return;
      }
      setActive(tab);
      window.history.pushState(null, "", PATH[tab]);

      // Fokus ke field pertama setelah pintu selesai bergeser (desktop saja,
      // supaya keyboard HP tidak langsung muncul).
      clearTimeout(focusTimer.current);
      if (window.matchMedia("(pointer: fine)").matches) {
        focusTimer.current = setTimeout(() => {
          rootRef.current
            ?.querySelector<HTMLInputElement>(`[data-pane="${tab}"] input`)
            ?.focus({ preventScroll: true });
        }, 700);
      }
    },
    [active, router],
  );

  const blob = (on: boolean) =>
    `transition-opacity duration-700 ${on ? "opacity-100" : "opacity-0"}`;

  return (
    <main className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-[#F8FAFC] dark:bg-[#0F172A] relative overflow-hidden">
      {/* Latar blob: dua set, saling cross-fade */}
      <div className={`fixed -top-12 -left-12 w-[500px] h-[500px] rounded-full bg-teal-500/15 blur-[80px] -z-10 ${blob(active === "masuk")}`} />
      <div className={`fixed -bottom-12 -right-12 w-[600px] h-[600px] rounded-full bg-cyan-500/10 blur-[100px] -z-10 ${blob(active === "masuk")}`} />
      <div className={`fixed -top-12 -left-12 w-[500px] h-[500px] rounded-full bg-indigo-500/15 blur-[80px] -z-10 ${blob(active === "siswa")}`} />
      <div className={`fixed -bottom-12 -right-12 w-[600px] h-[600px] rounded-full bg-purple-500/10 blur-[100px] -z-10 ${blob(active === "siswa")}`} />

      <div
        ref={rootRef}
        className="auth-card w-full max-w-[340px] md:max-w-[720px] rounded-[20px] overflow-hidden shadow-2xl shadow-slate-900/20 dark:shadow-black/50"
        data-active={active}
      >
        {/* ===== Pintu geser ===== */}
        <div className="auth-door">
          <DoorLayer
            tab="masuk"
            visible={active === "masuk"}
            namaSekolah={namaSekolah}
            onSwitch={() => go("siswa")}
          />
          <DoorLayer
            tab="siswa"
            visible={active === "siswa"}
            namaSekolah={namaSekolah}
            onSwitch={() => go("masuk")}
          />
        </div>

        {/* Tombol bulat di tepi pintu (desktop) */}
        <button
          type="button"
          className="auth-knob"
          onClick={() => go(other(active))}
          aria-label={
            active === "masuk" ? "Pindah ke Portal Siswa" : "Pindah ke Masuk Admin / Guru"
          }
        >
          <Chevron />
        </button>

        {/* ===== Dua panel form (selalu ter-mount, pintu menutup salah satunya) ===== */}
        <div className="auth-panes">
          <Pane tab="masuk" active={active === "masuk"} footer={footer}>
            <LoginForm />
          </Pane>
          <Pane tab="siswa" active={active === "siswa"} footer={footer}>
            <CekAbsenForm />
          </Pane>
        </div>
      </div>
    </main>
  );
}
