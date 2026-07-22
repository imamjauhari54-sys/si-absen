import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getHariLiburMap } from "@/lib/data/hari-libur";
import { getRekapBulanan, getRekapHarian, getSemuaKelasRekap } from "@/lib/data/rekap";
import { isoWeekday, todayJakarta, addDaysJakarta } from "@/lib/utils/tanggal";
import RekapWidgets from "@/components/rekap/RekapWidgets";
import HarianTable from "@/components/rekap/HarianTable";
import BulananTable from "@/components/rekap/BulananTable";
import HariLiburModal from "@/components/rekap/HariLiburModal";
import PrintButton from "@/components/rekap/PrintButton";

export const metadata: Metadata = { title: "Rekap Absensi" };
export const dynamic = "force-dynamic";

const HARI_ID: Record<string, string> = {
  Sunday: "Minggu", Monday: "Senin", Tuesday: "Selasa", Wednesday: "Rabu",
  Thursday: "Kamis", Friday: "Jumat", Saturday: "Sabtu",
};
const BULAN_ID: Record<number, string> = {
  1: "Januari", 2: "Februari", 3: "Maret", 4: "April", 5: "Mei", 6: "Juni",
  7: "Juli", 8: "Agustus", 9: "September", 10: "Oktober", 11: "November", 12: "Desember",
};

function headerHarian(tgl: string): string {
  const d = new Date(`${tgl}T00:00:00Z`);
  const en = d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  return `${HARI_ID[en]}, ${String(d.getUTCDate()).padStart(2, "0")} ${BULAN_ID[d.getUTCMonth() + 1]} ${d.getUTCFullYear()}`;
}

export default async function RekapPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; tgl?: string; bulan?: string; kelas?: string }>;
}) {
  const session = await requireSession();
  const isAdmin = session.role === "admin";
  const guruKelas = session.kelas || "";

  const sp = await searchParams;
  const view = sp.view === "bulanan" ? "bulanan" : "harian";
  const today = todayJakarta();
  const tglFilter = sp.tgl || today;
  const bulanFilter = sp.bulan || today.slice(0, 7);
  const kelasFilter = isAdmin ? sp.kelas ?? "" : guruKelas;

  const prevTgl = addDaysJakarta(tglFilter, -1);
  const nextTgl = addDaysJakarta(tglFilter, 1);

  const liburMap = await getHariLiburMap();
  let hariIniLibur = false;
  let ketLibur = "";
  if (view === "harian") {
    if (liburMap.has(tglFilter)) {
      hariIniLibur = true;
      ketLibur = liburMap.get(tglFilter)!;
    } else if (isoWeekday(tglFilter) === 7) {
      hariIniLibur = true;
      ketLibur = "Libur Akhir Pekan (Minggu)";
    }
  }

  const semuaKelas = await getSemuaKelasRekap();

  const headerTitle =
    view === "harian" ? headerHarian(tglFilter) : `Bulan ${BULAN_ID[Number(bulanFilter.slice(5, 7))]} ${bulanFilter.slice(0, 4)}`;

  const exportQs = new URLSearchParams({
    view,
    ...(view === "harian" ? { tgl: tglFilter } : { bulan: bulanFilter }),
    kelas: kelasFilter,
  });

  return (
    <div className="w-full px-4 pt-2 mb-14">
      <style>{`@page { size: A4 ${view === "bulanan" ? "landscape" : "portrait"}; }`}</style>

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4 reveal no-print">
        <div>
          <h2 className="text-2xl font-extrabold text-gray-800 dark:text-white tracking-tight">
            Rekap Absensi
            <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-1">
              — {kelasFilter ? `Kelas ${kelasFilter}` : "Semua Kelas"}
            </span>
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm font-medium">
            Periode: <strong className="text-indigo-600 dark:text-indigo-400">{headerTitle}</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-gray-100 dark:bg-[#151a28] p-1 rounded-xl border border-gray-200 dark:border-gray-800 shadow-inner">
            <Link
              href={`/rekap?view=harian&tgl=${tglFilter}&kelas=${encodeURIComponent(kelasFilter)}`}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 no-underline ${
                view === "harian" ? "bg-indigo-600 text-white shadow-md" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              <i className="fas fa-calendar-day" /> Harian
            </Link>
            <Link
              href={`/rekap?view=bulanan&bulan=${bulanFilter}&kelas=${encodeURIComponent(kelasFilter)}`}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 no-underline ${
                view === "bulanan" ? "bg-indigo-600 text-white shadow-md" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              <i className="fas fa-calendar-alt" /> Bulanan
            </Link>
            <Link
              href="/rekap-history"
              className="px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-gray-200 no-underline"
            >
              <i className="fas fa-history text-[10px]" /> History
            </Link>
          </div>

          {!hariIniLibur && (
            <div className="flex gap-2">
              <a
                href={`/api/rekap/export?${exportQs.toString()}`}
                className="px-4 py-2 bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400 rounded-xl text-xs font-bold transition border border-emerald-200 dark:border-emerald-800 flex items-center gap-2 shadow-sm no-underline"
              >
                <i className="fas fa-file-csv" /> Export CSV
              </a>
              <PrintButton />
            </div>
          )}
        </div>
      </div>

      {/* FILTER */}
      <div className="section-card p-4 sm:p-5 mb-6 reveal shadow-sm no-print">
        <form method="GET" className="flex flex-col md:flex-row flex-wrap gap-4 md:items-end">
          <input type="hidden" name="view" value={view} />

          {view === "harian" ? (
            <div className="w-full md:w-auto">
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">Pilih Tanggal</label>
              <div className="flex items-center gap-2">
                <Link
                  href={`/rekap?view=harian&tgl=${prevTgl}&kelas=${encodeURIComponent(kelasFilter)}`}
                  className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-indigo-100 hover:text-indigo-600 dark:hover:bg-indigo-900/40 transition no-underline"
                >
                  <i className="fas fa-chevron-left text-xs" />
                </Link>
                <input
                  type="date"
                  name="tgl"
                  defaultValue={tglFilter}
                  className="flex-1 md:w-[155px] px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <Link
                  href={`/rekap?view=harian&tgl=${nextTgl}&kelas=${encodeURIComponent(kelasFilter)}`}
                  className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-indigo-100 hover:text-indigo-600 dark:hover:bg-indigo-900/40 transition no-underline"
                >
                  <i className="fas fa-chevron-right text-xs" />
                </Link>
                <Link
                  href={`/rekap?view=harian&tgl=${today}&kelas=${encodeURIComponent(kelasFilter)}`}
                  className="hidden md:flex px-4 h-10 items-center bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl text-xs font-bold transition border border-gray-200 dark:border-gray-700 no-underline"
                >
                  Hari Ini
                </Link>
              </div>
            </div>
          ) : (
            <div className="w-full md:w-auto">
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">Pilih Bulan</label>
              <input
                type="month"
                name="bulan"
                defaultValue={bulanFilter}
                className="w-full md:w-[200px] px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          )}

          {isAdmin ? (
            <div className="w-full md:w-auto md:flex-1 max-w-xs">
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">Filter Kelas</label>
              <select
                name="kelas"
                defaultValue={kelasFilter}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="">Semua Kelas</option>
                {semuaKelas.map((k) => (
                  <option key={k} value={k}>
                    Kelas {k}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="w-full md:w-auto">
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">Kelas Anda</label>
              <div className="flex items-center gap-2 px-4 h-10 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl">
                <i className="fas fa-chalkboard-teacher text-indigo-500 text-sm" />
                <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300">Kelas {guruKelas}</span>
                <input type="hidden" name="kelas" value={guruKelas} />
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 w-full md:w-auto">
            <button
              type="submit"
              className="flex-1 md:flex-none h-10 px-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-sm transition active:scale-95 flex items-center justify-center gap-2"
            >
              <i className="fas fa-search" /> Tampilkan
            </button>
            {isAdmin && <HariLiburModal />}
          </div>
        </form>
      </div>

      {/* VIEW HARIAN */}
      {view === "harian" ? (
        hariIniLibur ? (
          <div className="reveal section-card p-12 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 bg-amber-50 dark:bg-amber-900/20 rounded-2xl flex items-center justify-center mb-5 shadow-inner">
              <i className="fas fa-umbrella-beach text-3xl text-amber-400" />
            </div>
            <h3 className="text-xl font-extrabold text-gray-800 dark:text-white mb-2">Kegiatan Belajar Diliburkan</h3>
            <p className="text-gray-500 dark:text-gray-400 font-medium max-w-md text-sm">
              Tidak ada pencatatan absensi pada tanggal ini karena:
            </p>
            <p className="mt-2 font-bold text-indigo-600 dark:text-indigo-400 text-base">{ketLibur}</p>
            <Link
              href={`/rekap?view=harian&tgl=${prevTgl}&kelas=${encodeURIComponent(kelasFilter)}`}
              className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition shadow-sm no-underline"
            >
              <i className="fas fa-arrow-left" /> Hari Sebelumnya
            </Link>
          </div>
        ) : (
          <RekapHarianView tglFilter={tglFilter} kelasFilter={kelasFilter} />
        )
      ) : (
        <RekapBulananView bulanFilter={bulanFilter} kelasFilter={kelasFilter} liburMap={liburMap} />
      )}
    </div>
  );
}

async function RekapHarianView({ tglFilter, kelasFilter }: { tglFilter: string; kelasFilter: string }) {
  const { rows, stat } = await getRekapHarian(tglFilter, kelasFilter);
  return (
    <>
      <RekapWidgets stat={stat} total={rows.length} />
      <HarianTable key={tglFilter} rows={rows} tanggal={tglFilter} />
    </>
  );
}

async function RekapBulananView({
  bulanFilter,
  kelasFilter,
  liburMap,
}: {
  bulanFilter: string;
  kelasFilter: string;
  liburMap: Map<string, string>;
}) {
  const { rows, tglList } = await getRekapBulanan(bulanFilter, kelasFilter, liburMap);
  const liburKeterangan = Object.fromEntries(liburMap);
  return <BulananTable rows={rows} tglList={tglList} liburKeterangan={liburKeterangan} />;
}
