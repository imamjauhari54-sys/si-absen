"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useSidebar } from "./SidebarContext";

interface NavItem {
  href: string;
  icon: string;
  label: string;
  badge?: string;
}

interface SidebarProps {
  isAdmin: boolean;
}

export default function Sidebar({ isAdmin }: SidebarProps) {
  const pathname = usePathname();
  const { isCollapsed, isMobileOpen, setIsMobileOpen } = useSidebar();

  const navItems: NavItem[] = [
    { href: "/dashboard", icon: "fa-house", label: "Dashboard" },
    { href: "/siswa", icon: "fa-users", label: "Data Siswa" },
    { href: "/rekap", icon: "fa-calendar-days", label: "Rekap Absensi" },
    ...(isAdmin
      ? [{ href: "/scan-absen", icon: "fa-qrcode", label: "Scan QR", badge: "SCAN" }]
      : []),
    { href: "/setting", icon: "fa-gear", label: "Pengaturan" },
  ];

  // Close drawer on ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isMobileOpen) {
        setIsMobileOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobileOpen, setIsMobileOpen]);

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden transition-opacity duration-300 animate-fade-in"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside
        id="sidebar"
        className={`fixed top-0 left-0 bottom-0 z-40 flex flex-col transition-all duration-300 ease-in-out border-r w-[280px] ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0 ${isCollapsed ? "lg:w-20" : "lg:w-[280px]"}`}
        style={{
          background: "var(--bg-card)",
          borderColor: "var(--border)",
        }}
      >
        {/* Branding Logo Section */}
        <div className="px-4 py-5 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-3 overflow-hidden select-none">
            <div
              className={`w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-400 dark:from-indigo-500 dark:to-purple-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 flex-shrink-0 transition-transform duration-300 ${
                isCollapsed ? "scale-90 rotate-[360deg]" : ""
              }`}
            >
              <i className="fa-solid fa-qrcode text-lg" />
            </div>
            <div
              className={`transition-all duration-300 whitespace-nowrap overflow-hidden flex flex-col ${
                isCollapsed ? "opacity-0 w-0 pointer-events-none" : "opacity-100 w-auto"
              }`}
            >
              <span className="text-base font-extrabold leading-none tracking-tight text-gray-900 dark:text-white">
                SI-ABSEN
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest mt-1 text-indigo-500 dark:text-indigo-400">
                Absensi Digital
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item relative group flex items-center gap-3 rounded-xl p-3 text-sm font-semibold transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  active ? "active" : ""
                }`}
                onClick={() => setIsMobileOpen(false)}
                aria-label={item.label}
              >
                <i
                  className={`fas ${item.icon} nav-icon text-base transition-transform duration-300 ${
                    isCollapsed ? "group-hover:scale-110 group-hover:rotate-12" : ""
                  }`}
                />
                <span
                  className={`flex-1 transition-all duration-300 whitespace-nowrap overflow-hidden ${
                    isCollapsed ? "opacity-0 w-0 pointer-events-none" : "opacity-100 w-auto"
                  }`}
                >
                  {item.label}
                </span>

                {item.badge && !isCollapsed && (
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-500 text-white flex-shrink-0">
                    {item.badge}
                  </span>
                )}

                {/* Collapsed Tooltip */}
                {isCollapsed && (
                  <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-gray-900 dark:bg-gray-800 text-white dark:text-gray-100 text-xs font-bold rounded-lg shadow-xl opacity-0 translate-x-[-10px] group-hover:opacity-100 group-hover:translate-x-0 pointer-events-none transition-all duration-200 z-50 whitespace-nowrap border border-gray-700/50">
                    {item.label}
                  </div>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Logout Section */}
        <div className="p-3 border-t" style={{ borderColor: "var(--border)" }}>
          <button
            id="btn-buka-modal-keluar"
            className="nav-item w-full text-red-500 hover:!bg-red-500/10 hover:!text-red-500 relative group flex items-center gap-3 rounded-xl p-3 text-sm font-semibold transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            aria-label="Keluar"
          >
            <i
              className={`fas fa-right-from-bracket nav-icon text-base transition-transform duration-300 ${
                isCollapsed ? "group-hover:translate-x-0.5 group-hover:scale-110" : ""
              }`}
            />
            <span
              className={`text-left transition-all duration-300 whitespace-nowrap overflow-hidden ${
                isCollapsed ? "opacity-0 w-0 pointer-events-none" : "opacity-100 w-auto"
              }`}
            >
              Keluar
            </span>

            {/* Collapsed Tooltip */}
            {isCollapsed && (
              <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-red-600 text-white text-xs font-bold rounded-lg shadow-xl opacity-0 translate-x-[-10px] group-hover:opacity-100 group-hover:translate-x-0 pointer-events-none transition-all duration-200 z-50 whitespace-nowrap">
                Keluar
              </div>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}
