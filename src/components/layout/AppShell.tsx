"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import ThemeToggle from "./ThemeToggle";
import LiveClock from "./LiveClock";
import LogoutModal from "./LogoutModal";
import DevFooter from "./DevFooter";

interface NavItem {
  href: string;
  icon: string;
  label: string;
  badge?: string;
}

interface NavGroup {
  label: string;
  icon: string;
  children: NavItem[];
}

type NavEntry = NavItem | NavGroup;

function isNavGroup(entry: NavEntry): entry is NavGroup {
  return "children" in entry;
}

export default function AppShell({
  namaSekolah,
  isAdmin,
  guruNama,
  guruRole,
  guruFoto,
  initialDark,
  children,
}: {
  namaSekolah: string;
  isAdmin: boolean;
  guruNama: string;
  guruRole: string;
  guruFoto: string | null;
  initialDark: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile: default tertutup
  const [desktopOpen, setDesktopOpen] = useState(true); // desktop: default terbuka

  function toggleSidebar() {
    setSidebarOpen((v) => !v);
    setDesktopOpen((v) => !v);
  }

  const navItems: NavEntry[] = [
    { href: "/dashboard", icon: "fa-house", label: "Dashboard" },
    { href: "/siswa", icon: "fa-users", label: "Data Siswa" },
    { href: "/rekap", icon: "fa-calendar-days", label: "Rekap Absensi" },
    ...(isAdmin
      ? [
          { href: "/scan-absen", icon: "fa-qrcode", label: "Scan QR", badge: "SCAN" },
          {
            label: "Administrasi",
            icon: "fa-toolbox",
            children: [
              { href: "/users", icon: "fa-user-shield", label: "Manajemen Pengguna" },
              { href: "/kelas", icon: "fa-chalkboard", label: "Kelola Kelas" },
              { href: "/scan-devices", icon: "fa-tablet-screen-button", label: "Device Scanner" },
              { href: "/log-aktivitas", icon: "fa-clock-rotate-left", label: "Log Aktivitas" },
              { href: "/log-wa", icon: "fa-comment-slash", label: "Log Notifikasi WA" },
            ],
          },
        ]
      : []),
    { href: "/setting", icon: "fa-gear", label: "Pengaturan" },
  ];

  const semuaHalaman = navItems.flatMap((item) => (isNavGroup(item) ? item.children : [item]));
  const pageTitle =
    semuaHalaman.find((i) => pathname === i.href || pathname?.startsWith(i.href + "/"))?.label ?? "SI-ABSEN";

  const [manualOpenGroups, setManualOpenGroups] = useState<Record<string, boolean>>({});
  function toggleGroup(label: string) {
    setManualOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* SIDEBAR */}
      <aside
        id="sidebar"
        className={`fixed top-0 left-0 bottom-0 z-30 flex flex-col w-[220px] flex-shrink-0 transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } ${desktopOpen ? "md:translate-x-0" : "md:-translate-x-full"}`}
        style={{
          background: "var(--bg-card)",
          borderRight: "1px solid var(--border)",
        }}
      >
        <div className="px-4 py-5 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-600 to-cyan-500 flex items-center justify-center text-white shadow-md flex-shrink-0">
              <i className="fa-solid fa-qrcode text-sm" />
            </div>
            <div className="overflow-hidden">
              <div className="text-sm font-extrabold leading-tight truncate">SI-ABSEN</div>
              <div className="text-[10px] font-semibold uppercase tracking-widest truncate" style={{ color: "var(--text-muted)" }}>
                Absensi Digital
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map((item) => {
            if (isNavGroup(item)) {
              const groupActive = item.children.some(
                (c) => pathname === c.href || pathname?.startsWith(c.href + "/")
              );
              const expanded = groupActive || !!manualOpenGroups[item.label];
              return (
                <div key={item.label}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(item.label)}
                    className={`nav-item w-full ${groupActive ? "active" : ""}`}
                  >
                    <i className={`fas ${item.icon} nav-icon`} />
                    <span className="flex-1 text-left">{item.label}</span>
                    <i className={`fas fa-chevron-down text-[10px] transition-transform ${expanded ? "rotate-180" : ""}`} />
                  </button>
                  {expanded && (
                    <div className="ml-3 pl-3 border-l border-gray-200 dark:border-white/10 mt-1 space-y-1">
                      {item.children.map((child) => {
                        const active = pathname === child.href || pathname?.startsWith(child.href + "/");
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={`nav-item ${active ? "active" : ""}`}
                            onClick={() => setSidebarOpen(false)}
                          >
                            <i className={`fas ${child.icon} nav-icon`} />
                            <span className="flex-1">{child.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            const active = pathname === item.href || pathname?.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item ${active ? "active" : ""}`}
                onClick={() => setSidebarOpen(false)}
              >
                <i className={`fas ${item.icon} nav-icon`} />
                <span className="flex-1">{item.label}</span>
                {item.badge && (
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-500 text-white">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t flex items-center gap-2" style={{ borderColor: "var(--border)" }}>
          <Link
            href="/setting"
            onClick={() => setSidebarOpen(false)}
            className="flex-shrink-0 inline-flex"
            title={`${guruNama} (${guruRole})`}
          >
            {guruFoto ? (
              <img
                src={guruFoto}
                alt={guruNama}
                className="rounded-full object-cover hover:ring-2 hover:ring-teal-500/50 transition-all"
                style={{ width: "2.25rem", height: "2.25rem" }}
              />
            ) : (
              <div
                className="rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-black hover:ring-2 hover:ring-teal-500/50 transition-all"
                style={{ width: "2.25rem", height: "2.25rem" }}
              >
                {guruNama.charAt(0).toUpperCase()}
              </div>
            )}
          </Link>
          <button
            type="button"
            id="btn-buka-modal-keluar"
            className="nav-item flex-1 relative z-10 cursor-pointer text-red-500 hover:!bg-red-500/10 hover:!text-red-500"
          >
            <i className="fas fa-right-from-bracket nav-icon" />
            <span>Keluar</span>
          </button>
        </div>
      </aside>

      {/* OVERLAY MOBILE */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[29] md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* MAIN */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-[margin] duration-300 ${
          desktopOpen ? "md:ml-[220px]" : "md:ml-0"
        }`}
      >
        <header className="sticky top-0 z-20 bg-white/80 dark:bg-[#111827]/80 backdrop-blur-md border-b border-gray-200 dark:border-white/10 px-5 py-3 flex items-center justify-between transition-colors duration-300">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSidebar}
              className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white transition-colors"
              aria-label="Toggle sidebar"
            >
              <i className="fas fa-bars text-lg" />
            </button>
            <div>
              <div className="text-[0.65rem] text-gray-500 dark:text-gray-400 font-bold tracking-widest uppercase">
                {namaSekolah}
              </div>
              <div className="text-sm sm:text-base font-extrabold text-gray-900 dark:text-white">
                {pageTitle}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isAdmin && (
              <Link
                href="/scan-absen"
                target="_blank"
                className="flex items-center gap-2 px-3 py-1.5 text-xs sm:text-sm font-bold text-emerald-600 bg-emerald-100 border border-emerald-200 rounded-lg hover:bg-emerald-200 dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:hover:bg-emerald-500/20 transition-colors no-underline"
              >
                <i className="fas fa-qrcode" />
                <span className="hidden sm:inline">SCAN QR</span>
              </Link>
            )}
            <LiveClock />
            <ThemeToggle initialDark={initialDark} />
          </div>
        </header>

        <main style={{ flex: 1, padding: "1.5rem", overflowX: "hidden" }}>{children}</main>

        <footer className="px-5 py-4 text-center border-t" style={{ borderColor: "var(--border)" }}>
          <DevFooter className="inline-block" />
        </footer>
      </div>

      <LogoutModal nama={guruNama} role={guruRole} foto={guruFoto} />
    </div>
  );
}
