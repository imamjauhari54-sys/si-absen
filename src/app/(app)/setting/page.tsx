import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getAbsensiSetting } from "@/lib/data/dashboard";
import { getSettingValue } from "@/lib/data/settings";
import { getDistinctBulanAbsensi } from "@/lib/data/rekap";
import JadwalForm from "@/components/setting/JadwalForm";
import ResetDataModal from "@/components/setting/ResetDataModal";
import InfoSekolahForm from "@/components/setting/InfoSekolahForm";

export const metadata: Metadata = { title: "Pengaturan" };
export const dynamic = "force-dynamic";

const QUICK_LINKS = [
  { href: "/dashboard", icon: "fa-chart-pie", label: "Dashboard", txt: "text-blue-500", bg: "bg-blue-100 dark:bg-blue-900/30" },
  { href: "/siswa", icon: "fa-users", label: "Data Siswa & ID Card", txt: "text-emerald-500", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  { href: "/rekap", icon: "fa-calendar-days", label: "Rekap Kehadiran", txt: "text-amber-500", bg: "bg-amber-100 dark:bg-amber-900/30" },
  { href: "/scan-absen", icon: "fa-qrcode", label: "Buka Scanner", txt: "text-purple-500", bg: "bg-purple-100 dark:bg-purple-900/30", blank: true },
];

const QUICK_LINK_ADMIN = {
  href: "/users",
  icon: "fa-user-shield",
  label: "Manajemen Pengguna",
  txt: "text-indigo-500",
  bg: "bg-indigo-100 dark:bg-indigo-900/30",
  blank: false,
};

export default async function SettingPage() {
  const session = await requireSession();
  const isAdmin = session.role === "admin";

  const [setting, namaSekolah, alamat, daftarBulan] = await Promise.all([
    getAbsensiSetting(),
    getSettingValue("nama_sekolah", "SI-ABSEN"),
    getSettingValue("alamat_sekolah", ""),
    isAdmin ? getDistinctBulanAbsensi() : Promise.resolve([]),
  ]);

  const jamMasuk = (setting.jam_masuk ?? "07:00:00").slice(0, 5);
  const batasTerlambat = (setting.batas_terlambat ?? "07:15:00").slice(0, 5);
  const jamPulang = (setting.jam_pulang_mulai ?? "11:30:00").slice(0, 5);
  const tapel = setting.tapel ?? "2025/2026";
  const semester = setting.semester === "ganjil" ? "ganjil" : "genap";

  return (
    <div className="w-full px-4 pt-2 mb-14">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4 reveal">
        <div>
          <h2 className="text-2xl font-extrabold text-gray-800 dark:text-white tracking-tight">Pengaturan Sistem</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm font-medium">Konfigurasi jam operasional sekolah dan parameter absensi</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* KIRI: FORM + ZONA BAHAYA */}
        <div className="lg:col-span-2 reveal">
          <JadwalForm jamMasuk={jamMasuk} batasTerlambat={batasTerlambat} jamPulang={jamPulang} tapel={tapel} semester={semester} />
          {isAdmin && <ResetDataModal daftarBulan={daftarBulan} />}
        </div>

        {/* KANAN: SIDEBAR INFO */}
        <div className="space-y-6">
          <InfoSekolahForm namaSekolah={namaSekolah} alamat={alamat} tapel={tapel} semester={semester} isAdmin={isAdmin} />

          <div className="section-card p-5 shadow-sm reveal">
            <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <i className="fas fa-bolt text-amber-500" /> Akses Cepat
            </h3>
            <div className="space-y-2">
              {(isAdmin ? [...QUICK_LINKS, QUICK_LINK_ADMIN] : QUICK_LINKS).map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  target={l.blank ? "_blank" : undefined}
                  className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 dark:bg-gray-800/50 dark:hover:bg-gray-700 border border-gray-100 dark:border-gray-700/50 transition group no-underline"
                >
                  <div className={`w-8 h-8 rounded-lg ${l.bg} ${l.txt} flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110`}>
                    <i className={`fas ${l.icon} text-xs`} />
                  </div>
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-200">{l.label}</span>
                  <i className="fas fa-chevron-right ml-auto text-[10px] text-gray-400 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
