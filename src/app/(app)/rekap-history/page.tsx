import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getAbsensiSetting } from "@/lib/data/dashboard";
import { getRekapHistoryPage, getSemuaKelasRekap } from "@/lib/data/rekap";
import { getListTapel } from "@/lib/data/history";
import Pagination from "@/components/ui/Pagination";

const PAGE_SIZE = 30;

export const metadata: Metadata = { title: "History Rekap" };
export const dynamic = "force-dynamic";

function badgeKelas(persen: number): string {
  if (persen < 75) return "bg-red-500/15 text-red-500";
  if (persen < 85) return "bg-amber-500/15 text-amber-500";
  return "bg-emerald-500/15 text-emerald-500";
}

export default async function RekapHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ tapel?: string; semester?: string; kelas?: string; page?: string }>;
}) {
  const session = await requireSession();
  const isAdmin = session.role === "admin";
  const guruKelas = session.kelas || "";

  const sp = await searchParams;
  const settingDefault = await getAbsensiSetting();
  const tapel = sp.tapel ?? settingDefault.tapel ?? "";
  const semester = sp.semester ?? settingDefault.semester ?? "";
  const kelasFilter = isAdmin ? sp.kelas ?? "" : guruKelas;
  const pageParam = Math.max(1, parseInt(sp.page || "1", 10) || 1);

  const [listTapel, semuaKelas, hasil] = await Promise.all([
    getListTapel(),
    getSemuaKelasRekap(),
    getRekapHistoryPage(tapel, semester, kelasFilter, pageParam, PAGE_SIZE),
  ]);
  if (tapel && !listTapel.includes(tapel)) listTapel.push(tapel);

  const { rows: pagedRows, totalHariEfektif, totalSiswa, totalPages, page } = hasil;
  const buildPageHref = (p: number) =>
    `/rekap-history?tapel=${encodeURIComponent(tapel)}&semester=${encodeURIComponent(semester)}&kelas=${encodeURIComponent(kelasFilter)}&page=${p}`;

  const exportQs = new URLSearchParams({ tapel, semester, kelas: kelasFilter });

  return (
    <div className="w-full px-4 pt-2 mb-14">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4 reveal">
        <div className="flex items-center gap-4">
          <Link
            href="/rekap"
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-indigo-600 hover:text-white transition-all shadow-sm no-underline"
          >
            <i className="fas fa-arrow-left" />
          </Link>
          <div>
            <h2 className="text-2xl font-extrabold text-gray-800 dark:text-white tracking-tight">History Absensi</h2>
            <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">Arsip data kehadiran per semester</p>
          </div>
        </div>

        <a
          href={`/api/rekap/history-export?${exportQs.toString()}`}
          className="flex-1 md:flex-none px-5 py-2.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 hover:bg-emerald-200 no-underline"
        >
          <i className="fas fa-file-csv text-base" /> Export CSV
        </a>
      </div>

      {/* FILTER */}
      <div className="section-card p-5 mb-6 shadow-sm reveal no-print">
        <form method="GET" className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Tahun Pelajaran</label>
            <select
              name="tapel"
              defaultValue={tapel}
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-bold text-gray-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {listTapel.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Semester</label>
            <select
              name="semester"
              defaultValue={semester}
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-bold text-gray-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ganjil">Semester Ganjil</option>
              <option value="genap">Semester Genap</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Kelas</label>
            {isAdmin ? (
              <select
                name="kelas"
                defaultValue={kelasFilter}
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-bold text-gray-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Semua Kelas</option>
                {semuaKelas.map((k) => (
                  <option key={k} value={k}>
                    Kelas {k}
                  </option>
                ))}
              </select>
            ) : (
              <div className="w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-bold text-gray-500 dark:text-gray-400">
                Kelas {guruKelas}
              </div>
            )}
          </div>
          <button
            type="submit"
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl text-sm transition-all shadow-md active:scale-95 flex items-center justify-center gap-2"
          >
            <i className="fas fa-search" /> Tampilkan Rekap
          </button>
        </form>
      </div>

      {/* TABEL */}
      <div className="section-card overflow-hidden shadow-sm reveal">
        <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/30">
          <h3 className="text-sm font-bold text-gray-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
            <i className="fas fa-file-invoice text-indigo-500" /> Akumulasi Kehadiran Semester {semester ? semester.charAt(0).toUpperCase() + semester.slice(1) : "-"}
          </h3>
          <span className="text-[10px] font-bold px-3 py-1 bg-white dark:bg-gray-700 text-gray-500 rounded-full border border-gray-200 dark:border-gray-600">
            Total: {totalHariEfektif} Hari Efektif
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 dark:bg-gray-800/50 text-[10px] uppercase font-bold text-gray-500 tracking-widest border-b border-gray-100 dark:border-gray-800">
              <tr>
                <th className="px-6 py-4 text-center w-12">No</th>
                <th className="px-6 py-4">Nama Siswa</th>
                <th className="px-6 py-4 text-center">Kelas</th>
                <th className="px-6 py-4 text-center bg-emerald-50/50 dark:bg-emerald-900/10 text-emerald-600">H</th>
                <th className="px-6 py-4 text-center bg-amber-50/50 dark:bg-amber-900/10 text-amber-600">T</th>
                <th className="px-6 py-4 text-center bg-indigo-50/50 dark:bg-indigo-900/10 text-indigo-600">I</th>
                <th className="px-6 py-4 text-center bg-purple-50/50 dark:bg-purple-900/10 text-purple-600">S</th>
                <th className="px-6 py-4 text-center bg-red-50/50 dark:bg-red-900/10 text-red-600">A</th>
                <th className="px-6 py-4 text-center border-l dark:border-gray-700 font-black">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
              {totalSiswa === 0 ? (
                <tr>
                  <td colSpan={9} className="p-10 text-center text-gray-400 font-medium italic">
                    Pilih filter dan klik cari untuk menampilkan data history.
                  </td>
                </tr>
              ) : (
                pagedRows.map((r, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                    <td className="px-6 py-3.5 text-center font-bold text-gray-400">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                    <td className="px-6 py-3.5">
                      <div className="font-bold text-gray-800 dark:text-gray-200">{r.nama}</div>
                      <div className="text-[10px] text-gray-400 font-mono">{r.nisn}</div>
                    </td>
                    <td className="px-6 py-3.5 text-center font-bold text-gray-500 uppercase">{r.kelas}</td>
                    <td className="px-6 py-3.5 text-center font-bold text-emerald-600">{r.hadir}</td>
                    <td className="px-6 py-3.5 text-center font-bold text-amber-600">{r.telat}</td>
                    <td className="px-6 py-3.5 text-center font-bold text-indigo-600">{r.izin}</td>
                    <td className="px-6 py-3.5 text-center font-bold text-purple-600">{r.sakit}</td>
                    <td className="px-6 py-3.5 text-center font-bold text-red-600">{r.alpha}</td>
                    <td className="px-6 py-3.5 text-center border-l dark:border-gray-700">
                      <span className={`px-2 py-1 rounded-md text-[11px] font-black ${badgeKelas(r.persen)}`}>{r.persen}%</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination page={page} totalPages={totalPages} buildHref={buildPageHref} />
      </div>
    </div>
  );
}
