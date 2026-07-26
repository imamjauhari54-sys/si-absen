import type { TrenHarian } from "@/types";

export default function TrenChart({ tren, totalSiswa }: { tren: TrenHarian[]; totalSiswa: number }) {
  const maxTren = Math.max(...tren.map((t) => t.n), 1);
  const rataRata = totalSiswa > 0 ? Math.round(tren.reduce((a, t) => a + t.n, 0) / 7) : 0;

  return (
    <div className="section-card p-5 lg:col-span-2 reveal flex flex-col">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Tren Kehadiran
          </h3>
          <p className="text-sm font-bold text-gray-800 dark:text-gray-200 mt-1">7 Hari Terakhir</p>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 text-right bg-gray-50 dark:bg-gray-800/50 px-3 py-1.5 rounded-lg border border-gray-100 dark:border-gray-700">
          Rata&sup2; <span className="text-emerald-500 font-bold">{rataRata}</span> siswa/hari
        </div>
      </div>

      <div className="flex-1 flex items-end gap-2 h-[120px] mb-2 relative">
        {tren.map((t, i) => {
          const h = maxTren > 0 ? Math.max(8, Math.round((t.n / maxTren) * 100)) : 8;
          const pctT = totalSiswa > 0 ? Math.round((t.n / totalSiswa) * 100) : 0;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-2 relative group h-full justify-end">
              <div
                className={`text-[10px] sm:text-xs font-bold ${t.isToday ? "text-emerald-500" : "text-gray-400 dark:text-gray-500"} transition-all opacity-0 group-hover:opacity-100 absolute -top-5`}
              >
                {t.n}
              </div>
              <div
                className={`w-full rounded-t-md tren-bar relative ${t.isToday ? "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.4)]" : "bg-gray-200 dark:bg-gray-700 hover:bg-emerald-300 dark:hover:bg-emerald-700"}`}
                style={{ height: `${h}%` }}
              >
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] font-bold py-1 px-2 rounded-md whitespace-nowrap tren-tip z-10">
                  {t.tgl} : {t.n}/{totalSiswa} ({pctT}%)
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-[4px] border-transparent border-t-gray-900" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 border-t border-gray-100 dark:border-gray-700/50 pt-2">
        {tren.map((t, i) => (
          <div
            key={i}
            className={`flex-1 text-center text-[10px] uppercase tracking-wider font-bold ${t.isToday ? "text-emerald-500" : "text-gray-400 dark:text-gray-500"}`}
          >
            {t.tgl}
          </div>
        ))}
      </div>
    </div>
  );
}
