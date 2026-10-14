"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Portal from "@/components/ui/Portal";
import NotifModal from "@/components/ui/NotifModal";
import FotoUploader from "@/components/siswa/FotoUploader";
import { simpanProfilAction } from "@/lib/actions/profil";

const LABEL = "block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5";
const INPUT =
  "w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none";

export default function EditProfilModal({
  nama,
  username,
  nip,
  foto,
  onClose,
}: {
  nama: string;
  username: string;
  nip: string | null;
  foto: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [namaForm, setNamaForm] = useState(nama);
  const [nipForm, setNipForm] = useState(nip ?? "");
  const [fotoForm, setFotoForm] = useState(foto ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notif, setNotif] = useState<{ status: "ok" | "error"; message: string } | null>(null);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving && !notif) onClose();
    };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onClose, saving, notif]);

  async function simpan() {
    if (!namaForm.trim()) {
      setError("Nama lengkap wajib diisi.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await simpanProfilAction({ nama: namaForm, nip: nipForm, foto: fotoForm });
      if (res.status === "ok") {
        setNotif({ status: "ok", message: res.message });
      } else {
        setError(res.message);
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
        onClick={(e) => e.target === e.currentTarget && !saving && onClose()}
      >
        <div className="bg-white dark:bg-[#1e2535] rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700/60 w-full max-w-md overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/50 flex justify-between items-center bg-gray-50 dark:bg-gray-800/30">
            <span className="text-xs font-extrabold text-gray-500 dark:text-gray-400 uppercase tracking-widest flex items-center gap-2">
              <i className="fas fa-user-pen text-indigo-500" />
              Edit Profil Lengkap
            </span>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              aria-label="Tutup"
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

            <FotoUploader value={fotoForm} onChange={setFotoForm} folder="si-absen/users" label="Foto Profil" />

            <div>
              <label className={LABEL} htmlFor="profil-nama">
                Nama Lengkap
              </label>
              <input
                id="profil-nama"
                type="text"
                value={namaForm}
                onChange={(e) => setNamaForm(e.target.value)}
                maxLength={100}
                placeholder="Nama lengkap"
                className={INPUT}
              />
            </div>

            <div>
              <label className={LABEL} htmlFor="profil-username">
                Username
              </label>
              <input
                id="profil-username"
                type="text"
                value={username}
                readOnly
                disabled
                className={`${INPUT} font-mono opacity-60 cursor-not-allowed`}
              />
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5 ml-1">
                <i className="fas fa-info-circle mr-1" /> Username hanya bisa diubah oleh admin lewat Manajemen Pengguna.
              </p>
            </div>

            <div>
              <label className={LABEL} htmlFor="profil-nip">
                NIP <span className="normal-case font-normal">(opsional)</span>
              </label>
              <input
                id="profil-nip"
                type="text"
                inputMode="numeric"
                value={nipForm}
                onChange={(e) => setNipForm(e.target.value)}
                maxLength={30}
                placeholder="Nomor Induk Pegawai"
                className={`${INPUT} font-mono`}
              />
            </div>
          </div>

          <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-700/50 flex gap-3 bg-gray-50 dark:bg-gray-800/30">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl text-sm font-bold transition"
            >
              Batal
            </button>
            <button
              type="button"
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
