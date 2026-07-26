import Link from "next/link";
import type { Student } from "@/types";

export default function BelumAbsen({
  belum,
  belumRecord,
  pctHadir,
  today,
}: {
  belum: Student[];
  belumRecord: number;
  pctHadir: number;
  today: string;
}) {
  return (
    <div className="section-card shadow-sm flex flex-col reveal">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-white/[0.05] flex justify-between items-center bg-red-50/50 dark:bg-red-900/10 rounded-t-xl">
        <div>
          <h3 className="text-sm font-bold text-gray-800 dark:text-white flex items-center gap-2">
            <i className="fas fa-exclamation-circle text-red-500" /> Perlu Perhatian
          </h3>
          <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-0.5">Siswa Belum Absen</p>
        </div>
        {belumRecord > 0 && (
          <span className="bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 px-2.5 py-1 rounded-lg text-xs font-bold shadow-sm">
            {belumRecord} Siswa
          </span>
        )}
      </div>

      <div className="p-4 flex-1">
        {belum.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 opacity-80">
            <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-500 rounded-full flex items-center justify-center text-3xl mb-4">
              🎉
            </div>
            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">Hebat! Semua siswa sudah absen</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Tingkat kehadiran {pctHadir}% hari ini.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {belum.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center gap-3 p-3 bg-red-50/30 hover:bg-red-50 dark:bg-red-900/10 dark:hover:bg-red-900/20 border border-red-100/50 dark:border-red-900/30 rounded-xl transition-colors"
                >
                  <div className="w-9 h-9 rounded-full flex-shrink-0 overflow-hidden bg-red-100 dark:bg-red-900/50 flex items-center justify-center text-red-500 font-bold text-xs">
                    {b.foto ? (
                      <img src={b.foto} className="w-full h-full object-cover" alt={b.name} />
                    ) : (
                      b.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">{b.name}</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">Kelas {b.class}</p>
                  </div>
                </div>
              ))}
            </div>

            {belumRecord > 8 && (
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700/50 text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  +{belumRecord - 8} siswa lainnya belum absen.
                  <Link
                    href={`/rekap?view=harian&tgl=${today}`}
                    className="text-indigo-600 dark:text-indigo-400 font-bold ml-1 hover:underline"
                  >
                    Kelola di Rekap
                  </Link>
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
