import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import {
  cekHariLibur,
  getAbsensiSetting,
  getBelumAbsen,
  getRecentScans,
  getStatistikHariIni,
  getTren7Hari,
} from "@/lib/data/dashboard";
import { cekAlphaBerturut } from "@/lib/utils/absen";
import { hitungWaGagal24Jam } from "@/lib/data/wa-log";
import { todayJakarta, todayLabel } from "@/lib/utils/tanggal";

import KpiWidgets from "@/components/dashboard/KpiWidgets";
import RingChart from "@/components/dashboard/RingChart";
import TrenChart from "@/components/dashboard/TrenChart";
import JadwalCard from "@/components/dashboard/JadwalCard";
import AktivitasTerkini from "@/components/dashboard/AktivitasTerkini";
import BelumAbsen from "@/components/dashboard/BelumAbsen";
import AlphaBerturutAlert from "@/components/dashboard/AlphaBerturutAlert";
import WaGagalBanner from "@/components/dashboard/WaGagalBanner";
import AlphaModal from "@/components/dashboard/AlphaModal";
import LogAktivitasModal from "@/components/dashboard/LogAktivitasModal";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic"; // data absensi berubah tiap saat, jangan di-cache

const MIN_HARI_ALERT = 3;

export default async function DashboardPage() {
  const session = await requireSession();
  const isAdmin = session.role === "admin";
  const kelas = session.kelas || "";
  const today = todayJakarta();

  const [setting, { isLibur, pesanLibur }, { totalSiswa, stat }] = await Promise.all([
    getAbsensiSetting(),
    cekHariLibur(today),
    getStatistikHariIni(today, kelas, isAdmin),
  ]);

  const [tren, recent, { belum, belumRecord }, alphaBerturut, waGagal24Jam] = await Promise.all([
    getTren7Hari(today, kelas, isAdmin, totalSiswa),
    getRecentScans(today, kelas, isAdmin),
    getBelumAbsen(today, kelas, isAdmin),
    isAdmin ? cekAlphaBerturut("", MIN_HARI_ALERT) : Promise.resolve([]),
    isAdmin ? hitungWaGagal24Jam() : Promise.resolve(0),
  ]);

  const hadirTotal = stat.hadir + stat.terlambat;
  const pctHadir = totalSiswa > 0 ? Math.round((hadirTotal / totalSiswa) * 100) : 0;

  const jamMasukStd = (setting.jam_masuk ?? "07:00:00").slice(0, 5);
  const batasTerlambat = (setting.batas_terlambat ?? "07:15:00").slice(0, 5);
  const jamPulangStd = (setting.jam_pulang_mulai ?? "11:30:00").slice(0, 5);

  return (
    <div className="w-full mb-14 px-4 pt-2">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4 reveal">
        <div>
          <h2 className="text-2xl font-extrabold text-gray-800 dark:text-white tracking-tight">
            Dashboard Kehadiran
            <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-1">
              — {isAdmin ? "Semua Kelas" : `Kelas ${kelas}`}
            </span>
          </h2>
          <div className="text-gray-500 dark:text-gray-400 mt-1 text-sm flex flex-wrap items-center gap-x-1">
            <span>
              Halo, <strong className="text-gray-700 dark:text-gray-200">{session.nama.split(" ")[0]}</strong> 👋
            </span>
            <span className="ml-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse inline-block" />
              {todayLabel(today)}
            </span>
            {isAdmin && <LogAktivitasModal />}
          </div>
        </div>

        <div className="flex items-stretch border border-gray-200 dark:border-[#2a2d4b] rounded-xl overflow-hidden shadow-sm bg-white dark:bg-[#1e2235]">
          <div className="px-5 py-3 flex flex-col justify-center items-center border-r border-gray-200 dark:border-[#2a2d4b]">
            <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1">
              Tahun Pelajaran
            </span>
            <span className="text-lg font-extrabold text-gray-800 dark:text-white leading-none">
              {setting.tapel}
            </span>
          </div>
          <div className="px-5 py-2.5 flex flex-col justify-center items-center bg-indigo-50 dark:bg-[#282a4a]">
            <span className="text-[10px] font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-widest mb-1">
              Semester
            </span>
            <span className="text-sm font-extrabold text-indigo-700 dark:text-indigo-200 uppercase leading-none">
              {setting.semester}
            </span>
          </div>
        </div>
      </div>

      {/* KPI WIDGETS */}
      <KpiWidgets totalSiswa={totalSiswa} stat={stat} batasTerlambat={batasTerlambat} />

      {/* BANNER + MODAL PROSES ALPHA (ADMIN ONLY) */}
      {isAdmin && (
        <AlphaModal belumRecord={belumRecord} guruNama={session.nama} guruFoto={session.foto} isLibur={isLibur} />
      )}

      {/* ALERT ALPHA BERTURUT-TURUT (ADMIN ONLY) */}
      {isAdmin && <AlphaBerturutAlert daftar={alphaBerturut} minHari={MIN_HARI_ALERT} />}

      {/* BANNER NOTIFIKASI WA GAGAL (ADMIN ONLY) */}
      {isAdmin && <WaGagalBanner jumlah={waGagal24Jam} />}

      {/* CHART & JADWAL */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
        <RingChart totalSiswa={totalSiswa} stat={stat} />
        <TrenChart tren={tren} totalSiswa={totalSiswa} />
        <JadwalCard jamMasuk={jamMasukStd} batasTerlambat={batasTerlambat} jamPulang={jamPulangStd} />
      </div>

      {/* AKTIVITAS & BELUM ABSEN */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AktivitasTerkini isLibur={isLibur} pesanLibur={pesanLibur} recent={recent} today={today} />
        <BelumAbsen belum={belum} belumRecord={belumRecord} pctHadir={pctHadir} today={today} />
      </div>
    </div>
  );
}
