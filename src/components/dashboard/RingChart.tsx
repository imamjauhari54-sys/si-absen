import type { StatHariIni } from "@/lib/data/dashboard";

export default function RingChart({
  totalSiswa,
  stat,
}: {
  totalSiswa: number;
  stat: StatHariIni;
}) {
  const hadirTotal = stat.hadir + stat.terlambat;
  const izinTotal = stat.izin + stat.sakit;

  const pctHadir = totalSiswa > 0 ? Math.round((hadirTotal / totalSiswa) * 100) : 0;
  const pctIzin = totalSiswa > 0 ? Math.round((izinTotal / totalSiswa) * 100) : 0;
  const pctAlpha = totalSiswa > 0 ? Math.round((stat.alpha / totalSiswa) * 100) : 0;

  const c = 2 * Math.PI * 50;
  const offHadir = c * (1 - pctHadir / 100);
  const offIzin = c * (1 - pctIzin / 100);
  const offAlpha = c * (1 - pctAlpha / 100);

  const rotHadir = -90;
  const rotIzin = -90 + (pctHadir / 100) * 360;
  const rotAlpha = -90 + ((pctHadir + pctIzin) / 100) * 360;

  return (
    <div className="section-card p-5 lg:col-span-1 flex flex-col items-center justify-center reveal">
      <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4 w-full text-center">
        Kehadiran Hari Ini
      </h3>

      <div className="relative w-[120px] h-[120px] mb-4">
        <svg className="ring-svg w-full h-full" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="50" fill="none" className="track" strokeWidth="10" />
          <circle
            cx="60" cy="60" r="50" fill="none" strokeLinecap="round"
            stroke="#ef4444" strokeWidth="10"
            strokeDasharray={c} strokeDashoffset={offAlpha}
            style={{ transformOrigin: "center", transform: `rotate(${rotAlpha}deg)`, transition: "stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)" }}
          />
          <circle
            cx="60" cy="60" r="50" fill="none" strokeLinecap="round"
            stroke="#8b5cf6" strokeWidth="10"
            strokeDasharray={c} strokeDashoffset={offIzin}
            style={{ transformOrigin: "center", transform: `rotate(${rotIzin}deg)`, transition: "stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)" }}
          />
          <circle
            cx="60" cy="60" r="50" fill="none" strokeLinecap="round"
            stroke="#10b981" strokeWidth="10"
            strokeDasharray={c} strokeDashoffset={offHadir}
            style={{ transformOrigin: "center", transform: `rotate(${rotHadir}deg)`, transition: "stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="text-2xl font-black text-emerald-500 dark:text-emerald-400 leading-none">
            {pctHadir}
            <span className="text-sm opacity-70">%</span>
          </div>
          <div className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase mt-1">Hadir</div>
        </div>
      </div>

      <div className="w-full space-y-2 text-xs font-medium">
        <div className="flex justify-between items-center text-gray-600 dark:text-gray-300">
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Hadir/Telat
          </span>
          <span className="font-bold">{hadirTotal}</span>
        </div>
        <div className="flex justify-between items-center text-gray-600 dark:text-gray-300">
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm bg-violet-500" /> Izin/Sakit
          </span>
          <span className="font-bold">{izinTotal}</span>
        </div>
        <div className="flex justify-between items-center text-gray-600 dark:text-gray-300">
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-500" /> Alpha
          </span>
          <span className="font-bold">{stat.alpha}</span>
        </div>
      </div>
    </div>
  );
}
