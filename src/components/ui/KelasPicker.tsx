"use client";

import { useState } from "react";
import { normalizeKelas } from "@/lib/utils/kelas";

/**
 * Picker kelas standar: pilih dari daftar master, atau ketik nama kelas baru.
 * Dipakai bareng di form Siswa & form Pengguna (Guru) supaya nama kelas konsisten.
 */
export default function KelasPicker({
  value,
  onChange,
  options,
  helperPilih,
  helperBaru,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  helperPilih?: string;
  helperBaru?: string;
}) {
  const [mode, setMode] = useState<"pilih" | "baru">(value && !options.includes(value) ? "baru" : "pilih");

  return (
    <div>
      {mode === "pilih" ? (
        <div className="flex gap-2">
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="flex-1 px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            <option value="">-- Pilih Kelas --</option>
            {options.map((k) => (
              <option key={k} value={k}>
                Kelas {k}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              setMode("baru");
              onChange("");
            }}
            title="Tambah kelas baru"
            className="px-3.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-xl text-sm font-bold transition flex items-center gap-1.5 flex-shrink-0"
          >
            <i className="fas fa-plus text-xs" /> Baru
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={(e) => onChange(normalizeKelas(e.target.value))}
            placeholder='cth: 7 atau 7A (tanpa kata "Kelas")'
            autoFocus
            className="flex-1 px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-bold"
          />
          {options.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setMode("pilih");
                onChange("");
              }}
              title="Pilih dari kelas yang sudah ada"
              className="px-3.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-xl text-sm font-bold transition flex items-center gap-1.5 flex-shrink-0"
            >
              <i className="fas fa-list text-xs" /> Daftar
            </button>
          )}
        </div>
      )}
      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1.5 ml-1">
        {mode === "baru"
          ? helperBaru ?? 'Cukup isi angka/kode kelasnya saja — kata "Kelas" di depan otomatis ditambahkan saat ditampilkan.'
          : helperPilih ?? ""}
      </p>
    </div>
  );
}
