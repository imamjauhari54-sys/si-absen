import type { RekapBulananSiswaResult } from "@/lib/data/rekap";
import type { StatusBulanan } from "@/lib/data/rekap";

const LEG: { k: string; cls: string; lbl: string }[] = [
  { k: "H", cls: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400", lbl: "Hadir" },
  { k: "T", cls: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400", lbl: "Terlambat" },
  { k: "I", cls: "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400", lbl: "Izin" },
  { k: "S", cls: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400", lbl: "Sakit" },
  { k: "A", cls: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400", lbl: "Alpha" },
  { k: "L", cls: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400", lbl: "Libur" },
];

const LBL_MAP: Record<StatusBulanan, string> = {
  hadir: "H", terlambat: "T", izin: "I", sakit: "S", alpha: "A", libur: "L", kosong: "-",
};

const DETAIL_STYLE: Record<StatusBulanan, React.CSSProperties> = {
  hadir: { background: "rgba(16,185,129,.15)", color: "#10b981" },
  terlambat: { background: "rgba(245,158,11,.15)", color: "#f59e0b" },
  izin: { background: "rgba(99,102,241,.15)", color: "#6366f1" },
  sakit: { background: "rgba(168,85,247,.15)", color: "#a855f7" },
  alpha: { background: "rgba(239,68,68,.15)", color: "#ef4444" },
  libur: { background: "rgba(100,116,139,.1)", color: "#94a3b8" },
  kosong: { background: "transparent", color: "#cbd5e1", border: "1px dashed #cbd5e1" },
};

const HARI_SHORT: Record<string, string> = { Mon: "Sn", Tue: "Sl", Wed: "Rb", Thu: "Km", Fri: "Jm", Sat: "Sb" };

function hariPendek(tgl: string): string {
  const d = new Date(`${tgl}T00:00:00Z`);
  const en = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  return HARI_SHORT[en] ?? en;
}

function tglTitle(tgl: string, st: StatusBulanan, keterangan?: string): string {
  const d = new Date(`${tgl}T00:00:00Z`);
  const dm = `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${dm} · ${st === "libur" && keterangan ? keterangan : st.charAt(0).toUpperCase() + st.slice(1)}`;
}

function bulanLabel(bulanYYYYMM: string): string {
  const [y, m] = bulanYYYYMM.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: "UTC" });
}

export default function RekapBulananSiswaCard({
  data,
  bulanYYYYMM,
  liburKeterangan,
}: {
  data: RekapBulananSiswaResult;
  bulanYYYYMM: string;
  liburKeterangan: Record<string, string>;
}) {
  const SUM_CFG: { key: "hadir" | "terlambat" | "izin" | "sakit" | "alpha"; label: string; cls: string; emoji: string }[] = [
    { key: "hadir", label: "Hadir", cls: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400", emoji: "✅" },
    { key: "terlambat", label: "Terlambat", cls: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400", emoji: "⏰" },
    { key: "izin", label: "Izin", cls: "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400", emoji: "📝" },
    { key: "sakit", label: "Sakit", cls: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400", emoji: "🤒" },
    { key: "alpha", label: "Alpha", cls: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400", emoji: "❌" },
  ];

  return (
    <div className="section-card p-5 mb-6 reveal shadow-sm">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-1">
        <h3 className="text-sm font-bold text-gray-800 dark:text-white flex items-center gap-2">
          <i className="fas fa-calendar-days text-indigo-500" /> Rekap Bulanan
          <span className="text-xs font-normal text-gray-400 capitalize">— {bulanLabel(bulanYYYYMM)}</span>
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {LEG.map((l) => (
            <span key={l.k} className={`${l.cls} px-2 py-0.5 rounded-md text-[10px] font-bold`}>
              <strong>{l.k}</strong> {l.lbl}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mt-4 mb-1">
        {SUM_CFG.map((s) => (
          <span key={s.key} className="sum-badge" style={{ background: DETAIL_STYLE[s.key].background, color: DETAIL_STYLE[s.key].color as string }}>
            {s.emoji} {s.label}: {data[s.key]}
          </span>
        ))}
      </div>

      <div className="detail-grid">
        {data.tglList.map((tgl) => {
          const st = data.d[tgl] ?? "alpha";
          const d = new Date(`${tgl}T00:00:00Z`);
          return (
            <div key={tgl} className="detail-cell" style={DETAIL_STYLE[st]} title={tglTitle(tgl, st, liburKeterangan[tgl])}>
              {LBL_MAP[st]}
              <span>
                {String(d.getUTCDate()).padStart(2, "0")}
                {hariPendek(tgl)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
