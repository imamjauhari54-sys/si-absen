import "./history.css";
import type { StatHistory } from "@/lib/data/history";

export default function HistoryWidgets({ stat, total }: { stat: StatHistory; total: number }) {
  const cfg = [
    { label: "Hadir", key: "hadir" as const, txt: "text-emerald-500", bg: "bg-emerald-500", icon: "fa-check-circle", cls: "hw-hadir" },
    { label: "Terlambat", key: "terlambat" as const, txt: "text-amber-500", bg: "bg-amber-500", icon: "fa-clock", cls: "hw-telat" },
    { label: "Izin", key: "izin" as const, txt: "text-indigo-500", bg: "bg-indigo-500", icon: "fa-file-alt", cls: "hw-izin" },
    { label: "Sakit", key: "sakit" as const, txt: "text-purple-500", bg: "bg-purple-500", icon: "fa-briefcase-medical", cls: "hw-sakit" },
    { label: "Alpha", key: "alpha" as const, txt: "text-red-500", bg: "bg-red-500", icon: "fa-times-circle", cls: "hw-alpha" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 mb-6">
      {cfg.map((w) => {
        const pct = total > 0 ? Math.round((stat[w.key] / total) * 100) : 0;
        return (
          <div key={w.key} className={`hw-card ${w.cls} reveal p-4 sm:p-5 rounded-xl shadow-sm`}>
            <div className="flex justify-between items-start mb-3">
              <div>
                <div className={`hw-label text-[10px] font-extrabold uppercase tracking-widest mb-1 ${w.txt}`}>{w.label}</div>
                <div className="hw-number text-3xl sm:text-4xl font-black text-gray-800 dark:text-white">{stat[w.key]}</div>
              </div>
              <div className={`hw-icon-wrap w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl ${w.bg} flex items-center justify-center shadow-md transition-all duration-300`}>
                <i className={`fas ${w.icon} text-lg sm:text-xl text-white transition-colors duration-300`} />
              </div>
            </div>
            <div className="pt-3 border-t border-gray-100 dark:border-white/[0.05]">
              <div className="flex justify-between items-center mb-1.5">
                <span className="hw-pct-label text-[10px] text-gray-500 dark:text-gray-400 font-semibold uppercase">dari Total</span>
                <span className="hw-pct-badge text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300">
                  {pct}%
                </span>
              </div>
              <div className="hw-bar-track w-full bg-gray-100 dark:bg-gray-700/50 rounded-full h-1.5 overflow-hidden">
                <div className={`hw-bar-fill ${w.bg} h-full rounded-full`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
