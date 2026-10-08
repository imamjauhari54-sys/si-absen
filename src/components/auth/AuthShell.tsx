import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";
import DevFooter from "@/components/layout/DevFooter";
import AuthLogo from "./AuthLogo";
import "./auth.css";

export type AuthTab = "masuk" | "siswa";

const TABS: { key: AuthTab; href: string; label: string }[] = [
  { key: "masuk", href: "/login", label: "Masuk" },
  { key: "siswa", href: "/portal-siswa", label: "Siswa" },
];

const CONTENT: Record<
  AuthTab,
  { title: string; blobA: string; blobB: string }
> = {
  masuk: {
    title: "Masuk",
    blobA: "bg-teal-500/15",
    blobB: "bg-cyan-500/10",
  },
  siswa: {
    title: "Portal Siswa",
    blobA: "bg-indigo-500/15",
    blobB: "bg-purple-500/10",
  },
};

/**
 * Kerangka visual halaman Masuk & Siswa (satu desain, dua tema warna).
 * Server component — murni tampilan; logika login/guard tetap di page & action.
 */
export default async function AuthShell({
  active,
  children,
}: {
  active: AuthTab;
  children: React.ReactNode;
}) {
  const { data } = await supabaseAdmin
    .from("settings")
    .select("value")
    .eq("key", "nama_sekolah")
    .maybeSingle();
  const namaSekolah = data?.value || "NAMA SEKOLAH BELUM DIATUR";
  const c = CONTENT[active];

  return (
    <main className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-[#F8FAFC] dark:bg-[#0F172A] relative overflow-hidden">
      <div className={`fixed -top-12 -left-12 w-[500px] h-[500px] rounded-full ${c.blobA} blur-[80px] -z-10`} />
      <div className={`fixed -bottom-12 -right-12 w-[600px] h-[600px] rounded-full ${c.blobB} blur-[100px] -z-10`} />

      <div
        className={`auth-card auth-theme-${active} w-full max-w-[760px] md:min-h-[450px] flex flex-col md:flex-row rounded-[20px] overflow-hidden shadow-2xl shadow-slate-900/20 dark:shadow-black/50`}
      >
        {/* ===== Panel kiri: dekorasi + tab ===== */}
        <aside className="auth-side">
          <svg
            className="auth-art"
            viewBox="0 0 250 500"
            preserveAspectRatio="xMidYMid slice"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="authBase" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" style={{ stopColor: "var(--s2)" }} />
                <stop offset="1" style={{ stopColor: "var(--accent)" }} />
              </linearGradient>
            </defs>
            <rect width="250" height="500" fill="url(#authBase)" />
            <polygon points="0,0 200,0 0,200" style={{ fill: "var(--s3)" }} opacity="0.55" />
            <polygon points="0,150 150,0 250,0 250,30 0,280" fill="#fff" opacity="0.1" />
            <polygon points="0,260 250,10 250,150 0,400" fill="#fff" opacity="0.12" />
            <polygon points="0,330 250,80 250,190 0,440" style={{ fill: "var(--s3)" }} opacity="0.35" />
            <polygon points="0,420 250,170 250,500 0,500" fill="#fff" opacity="0.14" />
          </svg>

          <nav className="auth-tabs" aria-label="Pilih jenis masuk">
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={t.href}
                className="auth-tab"
                aria-current={t.key === active ? "page" : undefined}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        </aside>

        {/* ===== Panel kanan: form ===== */}
        <section className="flex-1 flex flex-col bg-[var(--auth-card)]">
          <div className="auth-fade flex-1 flex flex-col px-7 sm:px-12 pt-7 pb-5">
            <div className="text-center mb-5">
              <AuthLogo variant={active} />
              <h1 className="auth-title text-2xl font-extrabold uppercase tracking-wide mt-3">
                {c.title}
              </h1>
            </div>

            <div className="flex flex-1 flex-col min-h-[250px]">{children}</div>
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-7 sm:px-12 py-3 border-t border-[var(--auth-line)] shadow-[0_-8px_14px_-12px_rgba(0,0,0,0.25)]">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{namaSekolah}</span>
            <DevFooter />
          </footer>
        </section>
      </div>
    </main>
  );
}
