import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { getKelasMasterDetail } from "@/lib/data/kelas";
import KelasTable from "@/components/kelas/KelasTable";
import PageTitle from "@/components/ui/PageTitle";

export const metadata: Metadata = { title: "Kelola Kelas" };
export const dynamic = "force-dynamic";

export default async function KelasPage() {
  await requireSession(["admin"]);
  const list = await getKelasMasterDetail();

  return (
    <div className="w-full px-4 pt-2 mb-14">
      <div className="mb-6 reveal">
        <PageTitle icon="fa-chalkboard" title="Kelola Kelas">
          Data master nama kelas — dipakai di form Data Siswa & Manajemen Pengguna supaya nama kelas selalu konsisten.
        </PageTitle>
      </div>

      <KelasTable list={list} />
    </div>
  );
}
