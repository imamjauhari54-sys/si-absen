"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import LiveClock from "./LiveClock";
import ThemeToggle from "./ThemeToggle";
import { useSidebar } from "./SidebarContext";

interface HeaderProps {
  namaSekolah: string;
  isAdmin: boolean;
  initialDark: boolean;
}

export default function Header({ namaSekolah, isAdmin, initialDark }: HeaderProps) {
  const pathname = usePathname();
  const { isCollapsed, setIsCollapsed, isMobileOpen, setIsMobileOpen } = useSidebar();

  const navItems = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/siswa", label: "Data Siswa" },
    { href: "/rekap", label: "Rekap Absensi" },
    { href: "/scan-absen", label: "Scan QR" },
    { href: "/setting", label: "Pengaturan" },
  ];

  const pageTitle =
    navItems.find((i) => pathname === i.href || pathname?.startsWith(i.href + "/"))?.label ??
    "SI-ABSEN";

  const handleToggle = () => {
    if (typeof window !== "undefined") {
      if (window.innerWidth >= 1024) {
        setIsCollapsed(!isCollapsed);
      } else {
        setIsMobileOpen(!isMobileOpen);
      }
    }
  };

  return (
    <header className="sticky top-0 z-20 bg-white/80 dark:bg-[#111827]/80 backdrop-blur-md border-b border-gray-200 dark:border-white/10 px-5 py-3 flex items-center justify-between transition-colors duration-300">
      <div className="flex items-center gap-3">
        {/* Toggle Button Hamburger */}
        <button
          onClick={handleToggle}
          className="w-10 h-10 rounded-xl bg-gray-50 hover:bg-gray-100 dark:bg-gray-800/50 dark:hover:bg-gray-800 border border-gray-200 dark:border-white/5 flex items-center justify-center text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white transition-all active:scale-95 shadow-sm cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          aria-label="Toggle Sidebar"
        >
          <i
            className={`fas fa-bars text-base transition-transform duration-300 ${
              isCollapsed ? "lg:rotate-90" : ""
            } ${isMobileOpen ? "rotate-90" : ""}`}
          />
        </button>

        {/* Page Breadcrumbs */}
        <div className="select-none">
          <div className="text-[0.65rem] text-gray-500 dark:text-gray-400 font-bold tracking-widest uppercase leading-tight">
            {namaSekolah}
          </div>
          <div className="text-sm sm:text-base font-extrabold text-gray-900 dark:text-white leading-none mt-0.5">
            {pageTitle}
          </div>
        </div>
      </div>

      {/* Right Side Widgets */}
      <div className="flex items-center gap-3">
        {isAdmin && (
          <Link
            href="/scan-absen"
            target="_blank"
            className="flex items-center gap-2 px-3 py-1.5 text-xs sm:text-sm font-bold text-emerald-600 bg-emerald-100 border border-emerald-200 rounded-lg hover:bg-emerald-200 dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:hover:bg-emerald-500/20 transition-colors no-underline shadow-sm"
          >
            <i className="fas fa-qrcode" />
            <span className="hidden sm:inline">SCAN QR</span>
          </Link>
        )}
        <LiveClock />
        <ThemeToggle initialDark={initialDark} />
      </div>
    </header>
  );
}
