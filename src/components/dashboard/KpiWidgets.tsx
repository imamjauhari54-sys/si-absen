import type { StatHariIni } from "@/lib/data/dashboard";

export default function KpiWidgets({
  totalSiswa,
  stat,
  batasTerlambat,
}: {
  totalSiswa: number;
  stat: StatHariIni;
  batasTerlambat: string;
}) {
  const kpis = [
    { label: "Total Siswa", val: totalSiswa, cls: "widget-siswa", bg: "bg-indigo-500", icon: "fa-users", sub: "Terdaftar aktif" },
    { label: "Hadir", val: stat.hadir, cls: "widget-hadir", bg: "bg-emerald-500", icon: "fa-check-circle", sub: "Tepat waktu" },
    { label: "Terlambat", val: stat.terlambat, cls: "widget-telat", bg: "bg-amber-500", icon: "fa-clock", sub: `Setelah ${batasTerlambat}` },
    { label: "Izin / Sakit", val: stat.izin + stat.sakit, cls: "widget-izin", bg: "bg-violet-500", icon: "fa-notes-medical", sub: `${stat.izin} izin, ${stat.sakit} sakit` },
    { label: "Alpha", val: stat.alpha, cls: "widget-alpha", bg: "bg-red-500", icon: "fa-times-circle", sub: "Tidak masuk" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
      {kpis.map((k) => {
        const pct = totalSiswa > 0 ? Math.round((k.val / totalSiswa) * 100) : 0;
        return (
          <div key={k.label} className={`widget-card ${k.cls} group p-4 sm:p-5 rounded-xl shadow-sm reveal`}>
            <div className="flex justify-between items-start mb-2">
              <div>
                <div className="widget-text text-[10px] sm:text-xs font-bold uppercase tracking-widest mb-1">
                  {k.label}
                </div>
                <div className="widget-number text-gray-800 dark:text-white text-3xl sm:text-4xl font-extrabold">
                  {k.val}
                </div>
              </div>
              <div className={`widget-icon-circle w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl ${k.bg} flex items-center justify-center shadow-md transition-all duration-300`}>
                <i className={`fas ${k.icon} text-lg sm:text-xl text-white transition-colors duration-300`} />
              </div>
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-white/[0.05]">
              <span className="widget-sub text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 font-medium truncate pr-2">
                {k.sub}
              </span>
              <span className="widget-sub text-[10px] sm:text-xs font-bold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300">
                {pct}%
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
