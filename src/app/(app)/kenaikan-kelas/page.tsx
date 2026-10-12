import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { getAbsensiSetting } from "@/lib/data/dashboard";
import { getKelasMasterList } from "@/lib/data/kelas";
import { getKenaikanTerakhir, getSiswaAktifKenaikan } from "@/lib/data/kenaikan-kelas";
import { getDaftarTapel } from "@/lib/data/tapel";
import { todayJakarta } from "@/lib/utils/tanggal";
import { tapelDariTanggal, type Semester } from "@/lib/utils/tapel";
import KenaikanKelasWizard from "@/components/kenaikan/KenaikanKelasWizard";

export const metadata: Metadata = { title: "Kenaikan Kelas" };
export const dynamic = "force-dynamic";

export default async function KenaikanKelasPage() {
  await requireSession(["admin"]);

  const setting = await getAbsensiSetting();
  const tapel = setting.tapel ?? tapelDariTanggal(todayJakarta());
  const semester: Semester = setting.semester === "ganjil" ? "ganjil" : "genap";

  const [siswa, kelasMaster, daftarTapel, { siap, terakhir }] = await Promise.all([
    getSiswaAktifKenaikan(),
    getKelasMasterList(),
    getDaftarTapel(),
    getKenaikanTerakhir(tapel),
  ]);

  return (
    <div className="w-full max-w-4xl px-4 pt-2 mb-14">
      <div className="mb-6 reveal">
        <h2 className="text-2xl font-extrabold text-gray-800 dark:text-white tracking-tight">Kenaikan Kelas</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm font-medium">
          Mulai tahun ajaran baru: naikkan kelas, luluskan kelas akhir, dan pindahkan tahun pelajaran aktif sekaligus dalam satu langkah.
        </p>
      </div>

      {!siap ? (
        <div className="section-card p-6 shadow-sm border-l-4 border-l-amber-400">
          <div className="text-sm font-extrabold text-amber-600 dark:text-amber-400 mb-1">
            <i className="fas fa-triangle-exclamation mr-2" />
            Database belum siap
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Fitur ini membutuhkan migrasi <code>017_kenaikan_kelas.sql</code> (setelah 015 dan 016). Jalankan di Supabase SQL Editor, lalu muat ulang halaman ini.
          </p>
        </div>
      ) : (
        <KenaikanKelasWizard
          key={`${tapel}-${terakhir?.id ?? 0}-${siswa.length}`}
          tapelAktif={tapel}
          semesterAktif={semester}
          siswa={siswa}
          kelasMaster={kelasMaster}
          daftarTapel={daftarTapel}
          terakhir={terakhir}
        />
      )}
    </div>
  );
}
