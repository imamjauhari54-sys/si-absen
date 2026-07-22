import "./kpi.css";
import type { SiswaStats } from "@/lib/data/siswa";

export default function KpiSiswa({ stat }: { stat: SiswaStats }) {
  const kpis = [
    { label: "Total Siswa", val: stat.total, sub: "Terdaftar aktif", cls: "text-indigo-600", bg: "bg-indigo-500", icon: "fa-users", sk: "sk-indigo" },
    { label: "Laki-laki", val: stat.laki, sub: "Siswa putra", cls: "text-blue-600", bg: "bg-blue-500", icon: "fa-mars", sk: "sk-blue" },
    { label: "Perempuan", val: stat.pr, sub: "Siswa putri", cls: "text-pink-600", bg: "bg-pink-500", icon: "fa-venus", sk: "sk-pink" },
    { label: "QR Aktif", val: stat.berqr, sub: "Token tergenerate", cls: "text-emerald-600", bg: "bg-emerald-500", icon: "fa-qrcode", sk: "sk-emerald" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {kpis.map((k) => {
        const pct = stat.total > 0 ? Math.round((k.val / stat.total) * 100) : 0;
        return (
          <div key={k.label} className={`sk-card ${k.sk} reveal p-4 sm:p-5 rounded-xl shadow-sm`}>
            <div className="flex justify-between items-start mb-3">
              <div>
                <div className={`sk-label text-[10px] font-extrabold uppercase tracking-widest mb-1 ${k.cls}`}>{k.label}</div>
                <div className="sk-number text-3xl sm:text-4xl font-black text-gray-800 dark:text-white">{k.val}</div>
              </div>
              <div className={`sk-icon w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl ${k.bg} flex items-center justify-center shadow-md transition-all duration-300`}>
                <i className={`fas ${k.icon} text-lg sm:text-xl text-white transition-colors duration-300`} />
              </div>
            </div>
            <div className="pt-3 border-t border-gray-100 dark:border-white/[0.05]">
              <div className="flex justify-between items-center mb-1.5">
                <span className="sk-sub text-[10px] text-gray-500 dark:text-gray-400 font-semibold">{k.sub}</span>
                <span className="sk-pct text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300">
                  {pct}%
                </span>
              </div>
              <div className="sk-track w-full bg-gray-100 dark:bg-gray-700/50 rounded-full h-1.5 overflow-hidden">
                <div className={`sk-fill ${k.bg} h-full rounded-full`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
