import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { getKelasMasterDetail } from "@/lib/data/kelas";
import KelasTable from "@/components/kelas/KelasTable";

export const metadata: Metadata = { title: "Kelola Kelas" };
export const dynamic = "force-dynamic";

export default async function KelasPage() {
  await requireSession(["admin"]);
  const list = await getKelasMasterDetail();

  return (
    <div className="w-full px-4 pt-2 mb-14">
      <div className="mb-6 reveal">
        <h2 className="text-2xl font-extrabold text-gray-800 dark:text-white tracking-tight">Kelola Kelas</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm font-medium">
          Data master nama kelas — dipakai di form Data Siswa & Manajemen Pengguna supaya nama kelas selalu konsisten.
        </p>
      </div>

      <KelasTable list={list} />
    </div>
  );
}
