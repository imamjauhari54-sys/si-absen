import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getUsersList, getAllMengajarMap } from "@/lib/data/users";
import { getKelasMasterList } from "@/lib/data/kelas";
import UserTable from "@/components/users/UserTable";
import TambahUserButton from "@/components/users/TambahUserButton";

export const metadata: Metadata = { title: "Manajemen Pengguna" };
export const dynamic = "force-dynamic";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await requireSession(["admin"]);

  const params = await searchParams;
  const search = (params.q ?? "").trim();

  const [list, semuaKelas, mengajarMap] = await Promise.all([getUsersList(search), getKelasMasterList(), getAllMengajarMap()]);

  const jumlahAdmin = list.filter((u) => u.role === "admin").length;
  const jumlahGuru = list.filter((u) => u.role === "guru").length;

  return (
    <div className="w-full px-4 pt-2 mb-14">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4 reveal">
        <div>
          <h2 className="text-2xl font-extrabold text-gray-800 dark:text-white tracking-tight">Manajemen Pengguna</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm font-medium">
            Kelola akun Admin dan Guru yang bisa login ke SI-ABSEN
          </p>
        </div>
        <TambahUserButton semuaKelas={semuaKelas} currentUserId={session.userId} />
      </div>

      {/* KPI RINGKAS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6 reveal">
        <div className="section-card p-4 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <i className="fas fa-users" />
          </div>
          <div>
            <div className="text-lg font-extrabold text-gray-800 dark:text-white leading-none">{list.length}</div>
            <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mt-1">
              Total Pengguna
            </div>
          </div>
        </div>
        <div className="section-card p-4 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <i className="fas fa-shield-halved" />
          </div>
          <div>
            <div className="text-lg font-extrabold text-gray-800 dark:text-white leading-none">{jumlahAdmin}</div>
            <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mt-1">Admin</div>
          </div>
        </div>
        <div className="section-card p-4 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <i className="fas fa-chalkboard-teacher" />
          </div>
          <div>
            <div className="text-lg font-extrabold text-gray-800 dark:text-white leading-none">{jumlahGuru}</div>
            <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mt-1">Guru</div>
          </div>
        </div>
      </div>

      {/* SEARCH */}
      <div className="section-card p-4 sm:p-5 mb-6 reveal shadow-sm">
        <form method="GET" className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <div className="relative flex-1 min-w-[240px]">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <i className="fas fa-search text-gray-400 text-sm" />
            </div>
            <input
              type="text"
              name="q"
              defaultValue={search}
              placeholder="Cari nama atau username..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 sm:flex-none h-10 px-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-sm transition active:scale-95 flex items-center justify-center gap-2"
            >
              <i className="fas fa-search" /> Cari
            </button>
            <Link
              href="/users"
              className="h-10 w-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl border border-gray-200 dark:border-gray-700 transition no-underline"
              title="Reset Pencarian"
            >
              <i className="fas fa-rotate-left text-sm" />
            </Link>
          </div>
        </form>
      </div>

      {/* TABEL */}
      <UserTable list={list} search={search} semuaKelas={semuaKelas} currentUserId={session.userId} mengajarMap={mengajarMap} />
    </div>
  );
}
