"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StudentFull } from "@/types";
import Portal from "@/components/ui/Portal";
import NotifModal from "@/components/ui/NotifModal";
import FotoUploader from "./FotoUploader";
import KelasPicker from "@/components/ui/KelasPicker";

export default function SiswaFormModal({
  mode,
  initialData,
  semuaKelas,
  onClose,
}: {
  mode: "create" | "edit";
  initialData?: StudentFull;
  semuaKelas: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialData?.name ?? "");
  const [kelas, setKelas] = useState(initialData?.class ?? "");
  const [nisn, setNisn] = useState(initialData?.nisn ?? "");
  const [noHpOrtu, setNoHpOrtu] = useState(initialData?.no_hp_ortu ?? "");
  const [jk, setJk] = useState(initialData?.jenis_kelamin ?? "");
  const [foto, setFoto] = useState(initialData?.foto ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notif, setNotif] = useState<{ status: "ok" | "error"; message: string } | null>(null);

  async function simpan() {
    if (!name.trim() || !kelas.trim()) {
      setError("Nama dan kelas wajib diisi.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("name", name.trim());
      fd.append("class", kelas.trim());
      fd.append("nisn", nisn.trim());
      fd.append("no_hp_ortu", noHpOrtu.trim());
      fd.append("jenis_kelamin", jk);
      fd.append("foto", foto.trim());

      const url = mode === "create" ? "/api/siswa" : `/api/siswa/${initialData!.id}`;
      const res = await fetch(url, { method: mode === "create" ? "POST" : "PUT", body: fd });
      const data = await res.json();

      if (data.status === "ok") {
        setNotif({
          status: "ok",
          message: mode === "create" ? "Data siswa baru berhasil ditambahkan." : "Perubahan data siswa berhasil disimpan.",
        });
      } else {
        setError(data.message || "Terjadi kesalahan.");
      }
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setSaving(false);
    }
  }

  function tutupNotif() {
    setNotif(null);
    router.refresh();
    onClose();
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div className="bg-white dark:bg-[#1e2535] rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700/60 w-full max-w-md overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/50 flex justify-between items-center bg-gray-50 dark:bg-gray-800/30">
            <span className="text-xs font-extrabold text-gray-500 dark:text-gray-400 uppercase tracking-widest flex items-center gap-2">
              <i className={`fas ${mode === "create" ? "fa-user-plus" : "fa-user-pen"} text-indigo-500`} />
              {mode === "create" ? "Tambah Siswa" : "Edit Siswa"}
            </span>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center bg-gray-200 hover:bg-red-100 dark:bg-gray-700 dark:hover:bg-red-900/40 text-gray-500 hover:text-red-500 transition"
            >
              <i className="fas fa-times text-xs" />
            </button>
          </div>

          <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
            {error && (
              <div className="flex items-start gap-2 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-300 border border-rose-100 dark:border-rose-900/40 rounded-xl p-3 text-xs font-semibold">
                <i className="fas fa-circle-exclamation mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <FotoUploader value={foto} onChange={setFoto} />

            <div>
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
                Nama Lengkap
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nama siswa"
                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
                Kelas
              </label>
              <KelasPicker value={kelas} onChange={setKelas} options={semuaKelas} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
                  Jenis Kelamin
                </label>
                <select
                  value={jk}
                  onChange={(e) => setJk(e.target.value)}
                  className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="">Pilih</option>
                  <option value="L">Laki-laki</option>
                  <option value="P">Perempuan</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
                  NISN <span className="normal-case font-normal">(opsional)</span>
                </label>
                <input
                  type="text"
                  value={nisn}
                  onChange={(e) => setNisn(e.target.value)}
                  placeholder="cth: 0091234501"
                  className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
                No. HP Orang Tua/Wali <span className="normal-case font-normal">(opsional, untuk notifikasi WA)</span>
              </label>
              <input
                type="text"
                value={noHpOrtu}
                onChange={(e) => setNoHpOrtu(e.target.value)}
                placeholder="cth: 08123456789"
                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
              />
            </div>
          </div>

          <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-700/50 flex gap-3 bg-gray-50 dark:bg-gray-800/30">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl text-sm font-bold transition"
            >
              Batal
            </button>
            <button
              onClick={simpan}
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl text-sm font-bold shadow-sm transition flex items-center justify-center gap-2 active:scale-95"
            >
              {saving ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-save" />}
              {saving ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </div>
      </div>

      <NotifModal open={!!notif} status={notif?.status ?? "ok"} message={notif?.message ?? ""} onClose={tutupNotif} />
    </Portal>
  );
}
