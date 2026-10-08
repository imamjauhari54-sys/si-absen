import type { Metadata } from "next";
import { requireStudentSession } from "@/lib/auth/student-session";
import { logoutSiswaAction } from "@/lib/auth/student-actions";
import { getAbsensiSetting } from "@/lib/data/dashboard";
import {
  getChartTren6Bulan,
  getListTapel,
  getRiwayatAbsensi,
  getSiswaProfile,
  hitungStatHistory,
} from "@/lib/data/history";
import { getRekapBulananSiswa } from "@/lib/data/rekap";
import { getHariLiburMap } from "@/lib/data/hari-libur";
import { formatTglPanjang, todayJakarta } from "@/lib/utils/tanggal";
import HistoryWidgets from "@/components/history/HistoryWidgets";
import HistoryChart from "@/components/history/HistoryChart";
import RekapBulananSiswaCard from "@/components/history/RekapBulananSiswaCard";
import "@/components/history/history.css";
import "@/components/rekap/rekap.css";
import DevFooter from "@/components/layout/DevFooter";

export const metadata: Metadata = { title: "Absensi Saya" };
export const dynamic = "force-dynamic";

const AV_COLORS = "from-indigo-500 to-purple-600";

export default async function PortalSiswaDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tapel?: string; semester?: string; bulan?: string }>;
}) {
  // PENTING: siswaId SELALU diambil dari sesi (JWT ter-signed), TIDAK PERNAH
  // dari query param/URL. Kalau siswaId diambil dari URL, siswa A tinggal
  // ganti angka di address bar buat lihat data siswa B — jadi ini bukan cuma
  // soal style, tapi batas keamanan utama halaman ini.
  const session = await requireStudentSession();
  const siswaId = session.siswaId;

  const siswa = await getSiswaProfile(siswaId);
  // Kalau ternyata siswa dihapus/dinonaktifkan setelah sesi dibuat, jangan
  // tampilkan apa pun — paksa cek ulang dari awal.
  if (!siswa) {
    await logoutSiswaAction();
    return null;
  }

  const sp = await searchParams;
  const settingDefault = await getAbsensiSetting();
  const filter = {
    tapel: sp.tapel ?? settingDefault.tapel ?? "",
    semester: sp.semester ?? settingDefault.semester ?? "",
    bulan: sp.bulan ?? "",
  };
  // Rekap kalender bulanan pakai bulan yang sama dengan filter di atas kalau
  // diisi; kalau kosong, default ke bulan berjalan (bukan ikut filter tapel,
  // supaya siswa selalu lihat bulan ini duluan tanpa perlu pilih apa-apa).
  const bulanRekap = filter.bulan || todayJakarta().slice(0, 7);

  const [rows, listTapel, chartData, liburMap] = await Promise.all([
    getRiwayatAbsensi(siswaId, filter),
    getListTapel(),
    getChartTren6Bulan(siswaId),
    getHariLiburMap(),
  ]);
  const rekapBulanan = await getRekapBulananSiswa(siswaId, bulanRekap, liburMap);
  const liburKeterangan = Object.fromEntries(liburMap);
  if (filter.tapel && !listTapel.includes(filter.tapel)) listTapel.push(filter.tapel);

  const stat = hitungStatHistory(rows);
  const total = rows.length;
  const hadirEff = stat.hadir + stat.terlambat;
  const pctHadir = total > 0 ? Math.round((hadirEff / total) * 100) : 0;
  const pctColor = pctHadir >= 85 ? "text-emerald-500" : pctHadir >= 75 ? "text-amber-500" : "text-red-500";
  const isL = (siswa.jenis_kelamin ?? "").toLowerCase() === "l";

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B0F1A]">
      {/* TOPBAR SEDERHANA — tanpa sidebar, khusus portal siswa */}
      <div className="sticky top-0 z-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-gray-200 dark:border-white/10 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white bg-gradient-to-br from-indigo-600 to-purple-600">
            <i className="fa-solid fa-user-graduate text-sm" />
          </div>
          <div>
            <div className="text-sm font-extrabold text-gray-800 dark:text-white leading-tight">Portal Siswa</div>
            <div className="text-[11px] text-gray-400 leading-tight">Absensi Saya (read-only)</div>
          </div>
        </div>
        <form action={logoutSiswaAction}>
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-rose-50 dark:bg-gray-800 dark:hover:bg-rose-900/20 text-gray-600 hover:text-rose-600 dark:text-gray-300 dark:hover:text-rose-400 rounded-xl text-xs font-bold transition"
          >
            <i className="fas fa-right-from-bracket" /> Keluar
          </button>
        </form>
      </div>

      <div className="w-full max-w-5xl mx-auto px-4 pt-6 pb-14">
        {/* PROFIL SISWA */}
        <div className="section-card p-5 mb-6 reveal shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <div className={`avatar-xl bg-gradient-to-br ${AV_COLORS} shadow-lg`}>
              {siswa.foto ? (
                <img src={siswa.foto} className="w-full h-full object-cover" alt={siswa.name} />
              ) : (
                siswa.name.charAt(0).toUpperCase()
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-xl font-extrabold text-gray-800 dark:text-white">{siswa.name}</h3>
              <div className="flex flex-wrap gap-2 mt-2">
                <span className="inline-flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800 px-3 py-1 rounded-full text-xs font-bold">
                  <i className="fas fa-chalkboard-teacher text-[10px]" /> Kelas {siswa.class}
                </span>
                {siswa.nisn && (
                  <span className="inline-flex items-center gap-1.5 bg-gray-100 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300 px-3 py-1 rounded-full text-xs font-bold font-mono">
                    <i className="fas fa-id-card text-[10px]" /> NISN: {siswa.nisn}
                  </span>
                )}
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                    isL ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400" : "bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400"
                  }`}
                >
                  <i className={`fas ${isL ? "fa-mars" : "fa-venus"} text-[10px]`} /> {isL ? "Laki-laki" : "Perempuan"}
                </span>
              </div>
            </div>
            <div className="flex-shrink-0 text-center bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-2xl px-6 py-4 min-w-[100px]">
              <div className={`text-4xl font-black ${pctColor}`}>{pctHadir}%</div>
              <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mt-1">Kehadiran</div>
              <div className="text-[10px] text-gray-400 mt-0.5">
                {hadirEff}/{total} hari
              </div>
            </div>
          </div>
        </div>

        {/* FILTER */}
        <div className="section-card p-4 sm:p-5 mb-6 reveal shadow-sm">
          <form method="GET" className="flex flex-col md:flex-row flex-wrap gap-4 md:items-end">
            <div className="w-full md:w-auto">
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
                Tahun Pelajaran
              </label>
              <select
                name="tapel"
                defaultValue={filter.tapel}
                className="w-full md:w-[160px] px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                {listTapel.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-full md:w-auto">
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
                Semester
              </label>
              <select
                name="semester"
                defaultValue={filter.semester}
                className="w-full md:w-[160px] px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="ganjil">Semester Ganjil</option>
                <option value="genap">Semester Genap</option>
              </select>
            </div>
            <div className="w-full md:w-auto">
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
                Filter Bulan <span className="normal-case font-normal opacity-70">(opsional)</span>
              </label>
              <input
                type="month"
                name="bulan"
                defaultValue={filter.bulan}
                className="w-full md:w-[180px] px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="h-10 px-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-sm transition active:scale-95 flex items-center gap-2"
              >
                <i className="fas fa-search" /> Tampilkan
              </button>
              <a
                href="/portal-siswa/dashboard"
                className="h-10 w-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl border border-gray-200 dark:border-gray-700 transition no-underline"
                title="Reset Filter"
              >
                <i className="fas fa-rotate-left text-sm" />
              </a>
            </div>
          </form>
        </div>

        {/* WIDGET STATISTIK */}
        <HistoryWidgets stat={stat} total={total} />

        {/* REKAP BULANAN (kalender) */}
        <RekapBulananSiswaCard data={rekapBulanan} bulanYYYYMM={bulanRekap} liburKeterangan={liburKeterangan} />

        {/* GRAFIK + TABEL */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="section-card p-5 reveal shadow-sm lg:col-span-1 flex flex-col">
            <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <i className="fas fa-chart-bar text-indigo-500" /> Tren per Bulan
            </h3>
            <HistoryChart data={chartData} />
          </div>

          <div className="section-card shadow-sm overflow-hidden reveal lg:col-span-2">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-white/[0.05] flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/20">
              <h3 className="text-sm font-bold text-gray-800 dark:text-white flex items-center gap-2">
                <i className="fas fa-list text-indigo-500" /> Riwayat Kehadiran
                <span className="text-xs font-normal text-gray-500 dark:text-gray-400">({total} hari tercatat)</span>
              </h3>
            </div>
            <div className="overflow-x-auto" style={{ maxHeight: 420, overflowY: "auto" }}>
              <table className="w-full text-sm text-left border-collapse">
                <thead className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 text-[10px] uppercase tracking-wider font-extrabold border-b border-gray-200 dark:border-gray-700/50 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 text-center w-10">No</th>
                    <th className="px-4 py-3">Tanggal</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-center">Jam Masuk</th>
                    <th className="px-4 py-3 text-center">Jam Pulang</th>
                    <th className="px-4 py-3">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center text-gray-400 font-medium">
                        <i className="fas fa-inbox text-3xl mb-3 block opacity-50" />
                        Tidak ada data untuk filter ini.
                      </td>
                    </tr>
                  ) : (
                    rows.map((d, idx) => (
                      <tr key={idx} className="tbl-row text-gray-700 dark:text-gray-300">
                        <td className="px-4 py-3 text-center text-xs font-bold text-gray-400">{idx + 1}</td>
                        <td className="px-4 py-3 text-xs font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">
                          {formatTglPanjang(d.tanggal)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`badge-${d.status} px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase tracking-wide`}>
                            {d.status.charAt(0).toUpperCase() + d.status.slice(1)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-xs font-bold text-gray-500 dark:text-gray-400">
                          {d.jam_masuk ? d.jam_masuk.slice(0, 5) : "—"}
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-xs font-bold text-gray-500 dark:text-gray-400">
                          {d.jam_pulang ? d.jam_pulang.slice(0, 5) : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                          {d.keterangan ? d.keterangan : <span className="opacity-40">—</span>}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="text-center mt-2">
          <DevFooter className="inline-block" />
        </div>
      </div>
    </div>
  );
}
