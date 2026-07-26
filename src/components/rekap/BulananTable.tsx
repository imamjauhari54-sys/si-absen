"use client";

import { useState } from "react";
import "./rekap.css";
import type { RekapBulananRow, StatusBulanan } from "@/lib/data/rekap";

const LEG: { k: string; cls: string; lbl: string }[] = [
  { k: "H", cls: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400", lbl: "Hadir" },
  { k: "T", cls: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400", lbl: "Terlambat" },
  { k: "I", cls: "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400", lbl: "Izin" },
  { k: "S", cls: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400", lbl: "Sakit" },
  { k: "A", cls: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400", lbl: "Alpha" },
  { k: "L", cls: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400", lbl: "Libur" },
];

const CS_MAP: Record<StatusBulanan, string> = {
  hadir: "cs-hadir", terlambat: "cs-terlambat", izin: "cs-izin", sakit: "cs-sakit",
  alpha: "cs-alpha", libur: "cs-libur", kosong: "cs-kosong",
};
const LBL_MAP: Record<StatusBulanan, string> = {
  hadir: "H", terlambat: "T", izin: "I", sakit: "S", alpha: "A", libur: "L", kosong: "-",
};
const HARI_SHORT: Record<string, string> = { Mon: "Sn", Tue: "Sl", Wed: "Rb", Thu: "Km", Fri: "Jm", Sat: "Sb" };

const SUM_CFG: { key: "hadir" | "terlambat" | "izin" | "sakit" | "alpha"; cls: string; emoji: string }[] = [
  { key: "hadir", cls: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400", emoji: "✅" },
  { key: "terlambat", cls: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400", emoji: "⏰" },
  { key: "izin", cls: "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400", emoji: "📝" },
  { key: "sakit", cls: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400", emoji: "🤒" },
  { key: "alpha", cls: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400", emoji: "❌" },
];

const DETAIL_STYLE: Record<StatusBulanan, React.CSSProperties> = {
  hadir: { background: "rgba(16,185,129,.15)", color: "#10b981" },
  terlambat: { background: "rgba(245,158,11,.15)", color: "#f59e0b" },
  izin: { background: "rgba(99,102,241,.15)", color: "#6366f1" },
  sakit: { background: "rgba(168,85,247,.15)", color: "#a855f7" },
  alpha: { background: "rgba(239,68,68,.15)", color: "#ef4444" },
  libur: { background: "rgba(100,116,139,.1)", color: "#94a3b8" },
  kosong: { background: "transparent", color: "#cbd5e1", border: "1px dashed #cbd5e1" },
};

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

export default function BulananTable({
  rows,
  tglList,
  liburKeterangan,
}: {
  rows: RekapBulananRow[];
  tglList: string[];
  liburKeterangan: Record<string, string>;
}) {
  const [openId, setOpenId] = useState<number | null>(null);

  return (
    <>
      {/* DESKTOP */}
      <div className="bulanan-desktop hidden md:block section-card shadow-sm overflow-hidden reveal">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-white/[0.05] flex flex-wrap justify-between items-center gap-3 bg-gray-50/50 dark:bg-gray-800/20">
          <h3 className="text-sm font-bold text-gray-800 dark:text-white flex items-center gap-2">
            <i className="fas fa-table text-indigo-500" /> Rekap Kehadiran Bulanan
          </h3>
          <div className="flex flex-wrap gap-2">
            {LEG.map((l) => (
              <span key={l.k} className={`${l.cls} px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide`}>
                <strong>{l.k}</strong> = {l.lbl}
              </span>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="tbl-bulanan w-full text-left border-collapse whitespace-nowrap">
            <thead className="bg-gray-50 dark:bg-[#1a2030] text-[10px] uppercase font-extrabold text-gray-500 dark:text-gray-400 tracking-wider">
              <tr>
                <th className="sticky-no bg-gray-50 dark:bg-[#1a2030] w-10 text-center z-20">No</th>
                <th className="sticky-nama bg-gray-50 dark:bg-[#1a2030] z-20">Nama Siswa</th>
                {tglList.map((tgl) => {
                  const isHol = !!liburKeterangan[tgl];
                  const d = new Date(`${tgl}T00:00:00Z`);
                  return (
                    <th
                      key={tgl}
                      className={`w-10 text-center py-2 ${isHol ? "text-rose-500 dark:text-rose-400" : ""}`}
                      title={tglTitle(tgl, isHol ? "libur" : "hadir", liburKeterangan[tgl])}
                    >
                      {String(d.getUTCDate()).padStart(2, "0")}
                      <div className="text-[8px] font-normal opacity-70 normal-case">{hariPendek(tgl)}</div>
                    </th>
                  );
                })}
                <th className="w-10 text-center bg-emerald-50/80 dark:bg-emerald-900/10 text-emerald-600 dark:text-emerald-400 py-3">H</th>
                <th className="w-10 text-center bg-amber-50/80 dark:bg-amber-900/10 text-amber-600 dark:text-amber-400">T</th>
                <th className="w-10 text-center bg-indigo-50/80 dark:bg-indigo-900/10 text-indigo-600 dark:text-indigo-400">I</th>
                <th className="w-10 text-center bg-purple-50/80 dark:bg-purple-900/10 text-purple-600 dark:text-purple-400">S</th>
                <th className="w-10 text-center bg-red-50/80 dark:bg-red-900/10 text-red-600 dark:text-red-400">A</th>
              </tr>
            </thead>
            <tbody className="text-gray-700 dark:text-gray-300">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={tglList.length + 7} className="p-10 text-center text-gray-400 font-medium">
                    Tidak ada data siswa.
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <tr key={row.id} className="hover:bg-indigo-50/20 dark:hover:bg-white/[0.015] transition-colors">
                    <td className="sticky-no bg-white dark:bg-[#1e2535] text-center text-xs font-bold text-gray-400 py-2">{i + 1}</td>
                    <td className="sticky-nama bg-white dark:bg-[#1e2535] font-bold text-gray-800 dark:text-gray-100 py-2 pr-3">
                      {row.nama}
                      <div className="text-[10px] font-normal text-gray-400 dark:text-gray-500">Kelas {row.kelas}</div>
                    </td>
                    {tglList.map((tgl) => {
                      const st = row.d[tgl] ?? "alpha";
                      return (
                        <td key={tgl} className={`${CS_MAP[st]} py-2 text-[11px] cursor-default`} title={tglTitle(tgl, st, liburKeterangan[tgl])}>
                          {LBL_MAP[st]}
                        </td>
                      );
                    })}
                    <td className="sum-h py-2">{row.hadir}</td>
                    <td className="sum-t py-2">{row.terlambat}</td>
                    <td className="sum-i py-2">{row.izin}</td>
                    <td className="sum-s py-2">{row.sakit}</td>
                    <td className="sum-a py-2">{row.alpha}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MOBILE */}
      <div className="bulanan-mobile md:hidden reveal">
        <div className="section-card px-4 py-3 mb-3 flex flex-wrap justify-between items-center gap-2">
          <h3 className="text-sm font-bold text-gray-800 dark:text-white flex items-center gap-2">
            <i className="fas fa-id-card text-indigo-500" /> Rekap Bulanan
            <span className="text-xs font-normal text-gray-400">({rows.length} siswa)</span>
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {LEG.map((l) => (
              <span key={l.k} className={`${l.cls} px-2 py-0.5 rounded-md text-[10px] font-bold`}>
                {l.k}
              </span>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="section-card p-10 text-center text-gray-400 font-medium">
            <i className="fas fa-inbox text-3xl mb-3 block opacity-50" />
            Tidak ada data siswa.
          </div>
        ) : (
          rows.map((row, i) => {
            const isOpen = openId === row.id;
            return (
              <div key={row.id} className="bulanan-card mb-3 shadow-sm" onClick={() => setOpenId(isOpen ? null : row.id)}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-xs font-black flex-shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-gray-800 dark:text-gray-100 text-sm truncate">{row.nama}</div>
                    <div className="text-[10px] text-gray-400">Kelas {row.kelas}</div>
                  </div>
                  <div className="text-gray-400 transition-transform duration-300" style={{ transform: isOpen ? "rotate(180deg)" : undefined }}>
                    <i className="fas fa-chevron-down text-xs" />
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {SUM_CFG.map((s) => (
                    <span key={s.key} className={`sum-badge ${s.cls}`}>
                      {s.emoji} {row[s.key]}
                    </span>
                  ))}
                </div>

                {isOpen && (
                  <div className="detail-grid">
                    {tglList.map((tgl) => {
                      const st = row.d[tgl] ?? "alpha";
                      const d = new Date(`${tgl}T00:00:00Z`);
                      return (
                        <div key={tgl} className="detail-cell" style={DETAIL_STYLE[st]}>
                          {LBL_MAP[st]}
                          <span>
                            {String(d.getUTCDate()).padStart(2, "0")}
                            {hariPendek(tgl)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
