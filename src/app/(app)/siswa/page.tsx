import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getSettingValue } from "@/lib/data/settings";
import { getStudentsPage } from "@/lib/data/siswa";
import { getKelasMasterList } from "@/lib/data/kelas";
import KpiSiswa from "@/components/siswa/KpiSiswa";
import SiswaTable from "@/components/siswa/SiswaTable";
import TambahSiswaButton from "@/components/siswa/TambahSiswaButton";
import ImportSiswaButton from "@/components/siswa/ImportSiswaButton";
import Pagination from "@/components/ui/Pagination";

const PAGE_SIZE = 20;

export const metadata: Metadata = { title: "Data Siswa" };
export const dynamic = "force-dynamic";

export default async function SiswaPage({
  searchParams,
}: {
  searchParams: Promise<{ kelas?: string; q?: string; page?: string }>;
}) {
  const session = await requireSession();
  const isAdmin = session.role === "admin";
  const guruKelas = session.kelas || "";

  const params = await searchParams;
  const kelasFilter = isAdmin ? params.kelas ?? "" : guruKelas;
  const search = (params.q ?? "").trim();
  const pageParam = Math.max(1, parseInt(params.page || "1", 10) || 1);

  const [namaSekolah, alamat, hasil, kelasMaster] = await Promise.all([
    getSettingValue("nama_sekolah", "SI-ABSEN"),
    getSettingValue("alamat_sekolah", ""),
    getStudentsPage(kelasFilter, search, pageParam, PAGE_SIZE),
    getKelasMasterList(),
  ]);

  const { list: pagedList, semuaKelas, stats: stat, totalPages, page } = hasil;
  const buildPageHref = (p: number) =>
    `/siswa?kelas=${encodeURIComponent(kelasFilter)}&q=${encodeURIComponent(search)}&page=${p}`;

  const cetakSemuaHref = `/cetak-idcard?kelas=${encodeURIComponent(kelasFilter)}&q=${encodeURIComponent(search)}`;

  return (
    <div className="w-full px-4 pt-2 mb-14">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4 reveal">
        <div>
          <h2 className="text-2xl font-extrabold text-gray-800 dark:text-white tracking-tight">
            Data Siswa
            <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-1">
              — {kelasFilter ? `Kelas ${kelasFilter}` : "Semua Kelas"}
            </span>
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm font-medium">
            Total <strong className="text-gray-700 dark:text-gray-200">{stat.total}</strong> siswa ·{" "}
            <strong className="text-emerald-500">{stat.berqr}</strong> Token QR aktif
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          {isAdmin && <TambahSiswaButton semuaKelas={kelasMaster} />}
          {isAdmin && <ImportSiswaButton />}
          {isAdmin && (
            <Link
              href="/siswa/nonaktif"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl text-sm font-bold border border-gray-200 dark:border-gray-700 transition-all active:scale-95 no-underline"
            >
              <i className="fas fa-user-slash" />
              Siswa Nonaktif
            </Link>
          )}
          <Link
            href={cetakSemuaHref}
            target="_blank"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all active:scale-95 no-underline"
          >
            <i className="fas fa-print" />
            Cetak Semua ID Card
            <span className="bg-white/20 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">A4 · 9/hal</span>
          </Link>
        </div>
      </div>

      {/* KPI */}
      <KpiSiswa stat={stat} />

      {/* FILTER & SEARCH */}
      <div className="section-card p-4 sm:p-5 mb-6 reveal shadow-sm">
        <form method="GET" className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <div className="relative flex-1 min-w-[240px]">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <i className="fas fa-search text-gray-400 text-sm" />
              </div>
              <input
                type="text"
                name="q"
                defaultValue={search}
                placeholder="Cari nama atau NISN siswa..."
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
              />
            </div>

            {isAdmin && kelasFilter && <input type="hidden" name="kelas" value={kelasFilter} />}

            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 sm:flex-none h-10 px-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-sm transition active:scale-95 flex items-center justify-center gap-2"
              >
                <i className="fas fa-search" /> Cari
              </button>
              <Link
                href={isAdmin ? "/siswa" : `/siswa?kelas=${encodeURIComponent(guruKelas)}`}
                className="h-10 w-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl border border-gray-200 dark:border-gray-700 transition no-underline"
                title="Reset Pencarian"
              >
                <i className="fas fa-rotate-left text-sm" />
              </Link>
            </div>
          </div>

          {isAdmin ? (
            <div>
              <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">
                Filter Kelas
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/siswa?kelas=&q=${encodeURIComponent(search)}`} className={`kelas-pill ${kelasFilter === "" ? "active" : ""}`}>
                  Semua Kelas
                </Link>
                {semuaKelas.map((k) => (
                  <Link
                    key={k}
                    href={`/siswa?kelas=${encodeURIComponent(k)}&q=${encodeURIComponent(search)}`}
                    className={`kelas-pill ${kelasFilter === k ? "active" : ""}`}
                  >
                    Kelas {k}
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Kelas Anda:</div>
              <div className="flex items-center gap-2 px-4 h-9 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl">
                <i className="fas fa-chalkboard-teacher text-indigo-500 text-sm" />
                <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300">Kelas {guruKelas}</span>
              </div>
            </div>
          )}
        </form>
      </div>

      {/* TABEL + MODAL PREVIEW */}
      <SiswaTable list={pagedList} search={search} namaSekolah={namaSekolah} alamat={alamat} isAdmin={isAdmin} semuaKelas={kelasMaster} />

      <Pagination page={page} totalPages={totalPages} buildHref={buildPageHref} />

      {/* FOOTER RINGKASAN */}
      {stat.total > 0 && (
        <div className="mt-3 px-1 flex flex-wrap justify-between items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span>
            Menampilkan <strong className="text-gray-700 dark:text-gray-300">{pagedList.length}</strong> dari{" "}
            <strong className="text-gray-700 dark:text-gray-300">{stat.total}</strong> siswa
            {search && (
              <>
                {" "}
                · Hasil pencarian &quot;<strong>{search}</strong>&quot;
              </>
            )}
          </span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <i className="fas fa-mars text-blue-400" /> <span>{stat.laki} L</span>
            </span>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <span className="flex items-center gap-1.5">
              <i className="fas fa-venus text-pink-400" /> <span>{stat.pr} P</span>
            </span>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <span className="flex items-center gap-1.5">
              <i className="fas fa-qrcode text-emerald-400" /> <span>{stat.berqr} QR aktif</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
