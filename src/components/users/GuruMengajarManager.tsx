"use client";

import { useState } from "react";

interface Mengajar {
  id: number;
  class: string;
  mapel: string;
}

/**
 * Kelola penugasan guru mengajar mata pelajaran DI LUAR wali kelas.
 * Ini murni data informasi/administratif — belum mempengaruhi hak akses
 * login (login guru tetap berbasis wali kelas seperti sebelumnya), supaya
 * tidak mengubah alur otentikasi yang sudah berjalan.
 */
export default function GuruMengajarManager({
  guruId,
  semuaKelas,
  initialList,
}: {
  guruId: number;
  semuaKelas: string[];
  /** Data awal yang sudah di-fetch di server (bareng data pengguna lain),
   *  supaya modal ini nggak perlu nge-fetch ulang & nampilin loading kedua
   *  begitu dibuka. Kalau di-refresh (setelah tambah/hapus), baru fetch ulang
   *  ke API secara diam-diam. */
  initialList: Mengajar[];
}) {
  const [list, setList] = useState<Mengajar[]>(initialList);
  const [kelasBaru, setKelasBaru] = useState("");
  const [mapelBaru, setMapelBaru] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function muatUlang() {
    try {
      const res = await fetch(`/api/users/${guruId}/mengajar`);
      const data = await res.json();
      if (data.status === "ok") setList(data.list);
    } catch {
      // biarkan senyap — daftar tetap pakai state optimistic/terakhir yang ada
    }
  }

  async function tambah() {
    if (!kelasBaru || !mapelBaru.trim()) {
      setError("Kelas dan mata pelajaran wajib diisi.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("kelas", kelasBaru);
      fd.append("mapel", mapelBaru.trim());
      const res = await fetch(`/api/users/${guruId}/mengajar`, { method: "POST", body: fd });
      const data = await res.json();
      if (data.status === "ok") {
        setKelasBaru("");
        setMapelBaru("");
        muatUlang();
      } else {
        setError(data.message || "Gagal menambahkan.");
      }
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setSaving(false);
    }
  }

  async function hapus(id: number) {
    setList((prev) => prev.filter((m) => m.id !== id)); // optimistic
    await fetch(`/api/users/${guruId}/mengajar/${id}`, { method: "DELETE" });
  }

  return (
    <div className="border-t border-dashed border-gray-200 dark:border-gray-700 pt-4">
      <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
        Mengajar Mapel Lain <span className="normal-case font-normal">(opsional, di luar wali kelas)</span>
      </label>

      {list.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {list.map((m) => (
            <span
              key={m.id}
              className="inline-flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-800/50 px-2.5 py-1 rounded-full text-[11px] font-bold"
            >
              {m.mapel} · Kls {m.class}
              <button type="button" onClick={() => hapus(m.id)} className="hover:text-red-500 transition">
                <i className="fas fa-times text-[9px]" />
              </button>
            </span>
          ))}
        </div>
      )}

      {error && <p className="text-[10px] text-rose-500 font-semibold mb-1.5">{error}</p>}

      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          value={mapelBaru}
          onChange={(e) => setMapelBaru(e.target.value)}
          placeholder="cth: Penjas"
          className="px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
        />
        <div className="flex gap-1.5">
          <select
            value={kelasBaru}
            onChange={(e) => setKelasBaru(e.target.value)}
            className="flex-1 px-2 py-2 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            <option value="">Kelas</option>
            {semuaKelas.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={tambah}
            disabled={saving}
            className="px-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-lg text-xs font-bold transition flex-shrink-0"
          >
            {saving ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-plus" />}
          </button>
        </div>
      </div>
    </div>
  );
}
