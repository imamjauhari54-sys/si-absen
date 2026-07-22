"use client";

import Link from "next/link";
import { useState } from "react";
import type { AlphaBerturut } from "@/types";

export default function AlphaBerturutAlert({
  daftar,
  minHari,
}: {
  daftar: AlphaBerturut[];
  minHari: number;
}) {
  const [hidden, setHidden] = useState(false);
  if (hidden || daftar.length === 0) return null;

  return (
    <div className="reveal mb-6">
      <div className="section-card overflow-hidden shadow-sm border-l-4 border-rose-500">
        <div className="px-5 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-rose-50/50 dark:bg-rose-900/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center flex-shrink-0">
              <i className="fas fa-triangle-exclamation text-rose-500 text-sm" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-rose-700 dark:text-rose-400 flex items-center gap-2">
                Peringatan Alpha Berturut-turut
                <span className="bg-rose-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                  {daftar.length} siswa
                </span>
              </h3>
              <p className="text-[11px] text-rose-600/70 dark:text-rose-400/60 mt-0.5">
                Siswa tidak hadir &ge; {minHari} hari berturut-turut &middot; Perlu tindak lanjut
              </p>
            </div>
          </div>
          <button
            onClick={() => setHidden(true)}
            className="flex-shrink-0 text-[10px] font-bold text-rose-500 hover:text-rose-700 dark:hover:text-rose-300 bg-rose-100 dark:bg-rose-900/30 hover:bg-rose-200 dark:hover:bg-rose-900/50 px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
          >
            <i className="fas fa-eye-slash text-[9px]" /> Sembunyikan
          </button>
        </div>

        <div className="overflow-x-auto" style={{ maxHeight: 320, overflowY: "auto" }}>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/50 text-[10px] uppercase tracking-wider font-extrabold text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700/50 sticky top-0 z-10">
              <tr>
                <th className="px-5 py-3 text-center w-10">No</th>
                <th className="px-5 py-3">Nama Siswa</th>
                <th className="px-5 py-3 text-center">Kelas</th>
                <th className="px-5 py-3 text-center">Alpha Sejak</th>
                <th className="px-5 py-3 text-center">Durasi</th>
                <th className="px-5 py-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {daftar.map((aw, idx) => {
                const durClass =
                  aw.hari >= 5
                    ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                    : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400";
                return (
                  <tr key={aw.id} className="hover:bg-rose-50/30 dark:hover:bg-rose-900/10 transition-colors">
                    <td className="px-5 py-3 text-center text-xs font-bold text-gray-400">{idx + 1}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full flex-shrink-0 overflow-hidden bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center text-rose-500 font-black text-xs">
                          {aw.foto ? (
                            <img src={aw.foto} className="w-full h-full object-cover" alt={aw.nama} />
                          ) : (
                            aw.nama.charAt(0).toUpperCase()
                          )}
                        </div>
                        <span className="font-bold text-gray-800 dark:text-gray-200 text-sm">{aw.nama}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className="bg-gray-100 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded text-xs font-bold">
                        {aw.kelas}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center text-xs font-semibold text-gray-600 dark:text-gray-400">
                      {aw.sejakFmt}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className={`${durClass} px-2.5 py-1 rounded-full text-[11px] font-extrabold`}>
                        {aw.hari} hari
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <Link
                        href={`/siswa/${aw.id}/history?from=dashboard`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-bold transition no-underline"
                      >
                        <i className="fas fa-clock-rotate-left text-[10px]" /> Lihat History
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
