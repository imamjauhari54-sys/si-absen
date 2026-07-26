import Link from "next/link";
import type { RecentScan } from "@/types";

const STATUS_CFG: Record<string, [string, string]> = {
  hadir: ["bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", "Hadir"],
  terlambat: ["bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", "Terlambat"],
  izin: ["bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400", "Izin"],
  sakit: ["bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400", "Sakit"],
};

export default function AktivitasTerkini({
  isLibur,
  pesanLibur,
  recent,
  today,
}: {
  isLibur: boolean;
  pesanLibur: string;
  recent: RecentScan[];
  today: string;
}) {
  return (
    <div className="section-card shadow-sm flex flex-col reveal overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-white/[0.05] flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/20">
        <div>
          <h3 className="text-sm font-bold text-gray-800 dark:text-white flex items-center gap-2">
            <i className="fas fa-history text-indigo-500" /> Aktivitas Terkini
          </h3>
          <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-0.5">Log Kehadiran &amp; Izin</p>
        </div>
        {!isLibur && (
          <Link
            href={`/rekap?view=harian&tgl=${today}`}
            className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2.5 py-1.5 rounded-lg hover:bg-indigo-100 transition-all uppercase tracking-wider no-underline"
          >
            Lihat Semua
          </Link>
        )}
      </div>

      <div className="flex-1 min-h-[350px]">
        {isLibur ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-16 h-16 bg-amber-50 dark:bg-amber-900/20 rounded-2xl flex items-center justify-center mb-4 shadow-inner">
              <i className="fas fa-umbrella-beach text-2xl text-amber-400" />
            </div>
            <h4 className="text-sm font-bold text-gray-800 dark:text-white mb-1">Libur Sekolah</h4>
            <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest px-3 py-1 bg-indigo-50 dark:bg-indigo-900/30 rounded-full">
              {pesanLibur}
            </span>
          </div>
        ) : recent.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 opacity-40">
            <i className="fas fa-fingerprint text-5xl mb-3 text-gray-300" />
            <p className="text-[11px] font-bold uppercase tracking-widest text-center text-gray-500">
              Belum ada aktivitas
              <br />
              hadir, izin, atau sakit
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
            {recent.map((r, i) => {
              const [cls, label] = STATUS_CFG[r.status] ?? ["bg-gray-100 text-gray-700", "—"];
              const jam = r.jam_masuk
                ? r.jam_masuk.slice(0, 5)
                : new Date(r.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
              return (
                <div key={i} className="flex items-center gap-3 px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                  <div className="w-9 h-9 rounded-full flex-shrink-0 bg-indigo-600 flex items-center justify-center text-white font-black text-xs shadow-md">
                    {r.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-xs font-bold text-gray-800 dark:text-gray-100 truncate leading-tight">{r.name}</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 font-medium">Kelas {r.class}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-mono text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1 leading-none">
                      {jam}
                    </div>
                    <span className={`${cls} px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider`}>
                      {label}
                    </span>
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
