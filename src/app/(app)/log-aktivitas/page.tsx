import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { getLogAktivitas } from "@/lib/data/log-aktivitas";

export const metadata: Metadata = { title: "Log Aktivitas" };
export const dynamic = "force-dynamic";

const AKSI_ICON: Record<string, { icon: string; warna: string }> = {
  tambah_user: { icon: "fa-user-plus", warna: "text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20" },
  edit_user: { icon: "fa-user-pen", warna: "text-violet-500 bg-violet-50 dark:bg-violet-900/20" },
  hapus_user: { icon: "fa-user-xmark", warna: "text-red-500 bg-red-50 dark:bg-red-900/20" },
  tambah_siswa: { icon: "fa-user-plus", warna: "text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20" },
  edit_siswa: { icon: "fa-user-pen", warna: "text-violet-500 bg-violet-50 dark:bg-violet-900/20" },
  hapus_siswa: { icon: "fa-user-xmark", warna: "text-red-500 bg-red-50 dark:bg-red-900/20" },
  tambah_kelas: { icon: "fa-plus", warna: "text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20" },
  edit_kelas: { icon: "fa-pen", warna: "text-violet-500 bg-violet-50 dark:bg-violet-900/20" },
  hapus_kelas: { icon: "fa-trash", warna: "text-red-500 bg-red-50 dark:bg-red-900/20" },
  import_siswa: { icon: "fa-file-import", warna: "text-blue-500 bg-blue-50 dark:bg-blue-900/20" },
};

export default async function LogAktivitasPage() {
  await requireSession(["admin"]);
  const logs = await getLogAktivitas(100);

  return (
    <div className="w-full px-4 pt-2 mb-14">
      <div className="mb-6 reveal">
        <h2 className="text-2xl font-extrabold text-gray-800 dark:text-white tracking-tight">Log Aktivitas</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm font-medium">
          Riwayat perubahan pengguna, siswa, dan data kelas oleh admin (100 aktivitas terakhir).
        </p>
      </div>

      <div className="section-card shadow-sm overflow-hidden reveal">
        {logs.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <div className="flex flex-col items-center justify-center opacity-60">
              <i className="fas fa-clock-rotate-left text-4xl text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-sm font-bold text-gray-500 dark:text-gray-400">Belum ada aktivitas tercatat</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {logs.map((log) => {
              const style = AKSI_ICON[log.aksi] ?? { icon: "fa-circle-info", warna: "text-gray-500 bg-gray-100 dark:bg-gray-800" };
              return (
                <div key={log.id} className="px-5 py-4 flex gap-3 items-start">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${style.warna}`}
                  >
                    <i className={`fas ${style.icon} text-xs`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug">{log.keterangan}</p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 flex items-center gap-1.5">
                      <span className="font-bold">{log.namaAdmin}</span>
                      <span>·</span>
                      <span>{log.createdAt}</span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
