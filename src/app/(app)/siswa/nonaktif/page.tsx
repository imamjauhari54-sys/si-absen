import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getInactiveStudentsPage } from "@/lib/data/siswa";
import SiswaNonaktifTable from "@/components/siswa/SiswaNonaktifTable";
import Pagination from "@/components/ui/Pagination";

const PAGE_SIZE = 10;

export const metadata: Metadata = { title: "Siswa Nonaktif" };
export const dynamic = "force-dynamic";

export default async function SiswaNonaktifPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const session = await requireSession();
  if (session.role !== "admin") redirect("/siswa");

  const params = await searchParams;
  const search = (params.q ?? "").trim();
  const pageParam = Math.max(1, parseInt(params.page || "1", 10) || 1);

  const { list, total, totalPages, page } = await getInactiveStudentsPage(search, pageParam, PAGE_SIZE);
  const buildPageHref = (p: number) => `/siswa/nonaktif?q=${encodeURIComponent(search)}&page=${p}`;

  return (
    <div className="w-full px-4 pt-2 mb-14">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4 reveal">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/siswa"
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition no-underline"
              title="Kembali ke Data Siswa"
            >
              <i className="fas fa-arrow-left text-xs" />
            </Link>
            <h2 className="text-2xl font-extrabold text-gray-800 dark:text-white tracking-tight">Siswa Nonaktif</h2>
          </div>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm font-medium">
            Siswa berstatus <strong className="text-gray-700 dark:text-gray-200">lulus</strong> atau{" "}
            <strong className="text-gray-700 dark:text-gray-200">pindah</strong> — riwayat absensinya tetap tersimpan.
            Total <strong className="text-gray-700 dark:text-gray-200">{total}</strong> siswa.
          </p>
        </div>
      </div>

      <div className="section-card p-4 sm:p-5 mb-6 reveal shadow-sm">
        <form method="GET" className="relative">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <i className="fas fa-search text-gray-400 text-sm" />
          </div>
          <input
            type="text"
            name="q"
            defaultValue={search}
            placeholder="Cari nama atau NISN siswa nonaktif..."
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
          />
        </form>
      </div>

      <SiswaNonaktifTable list={list} />

      <Pagination page={page} totalPages={totalPages} buildHref={buildPageHref} />

      {total > 0 && (
        <div className="mt-1 px-1 text-xs text-gray-500 dark:text-gray-400">
          Menampilkan <strong className="text-gray-700 dark:text-gray-300">{list.length}</strong> dari{" "}
          <strong className="text-gray-700 dark:text-gray-300">{total}</strong> siswa nonaktif
          {search && (
            <>
              {" "}
              · Hasil pencarian &quot;<strong>{search}</strong>&quot;
            </>
          )}
        </div>
      )}
    </div>
  );
}
