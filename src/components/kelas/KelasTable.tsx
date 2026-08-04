"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Portal from "@/components/ui/Portal";
import NotifModal from "@/components/ui/NotifModal";
import { normalizeKelas } from "@/lib/utils/kelas";

export interface KelasRow {
  id: number;
  nama: string;
  jumlahSiswa: number;
  jumlahLaki: number;
  jumlahPerempuan: number;
  waliKelas: string | null;
}

export default function KelasTable({ list }: { list: KelasRow[] }) {
  const router = useRouter();
  const [namaBaru, setNamaBaru] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<KelasRow | null>(null);
  const [namaEdit, setNamaEdit] = useState("");
  const [confirmHapus, setConfirmHapus] = useState<KelasRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notif, setNotif] = useState<{ status: "ok" | "error"; message: string } | null>(null);

  async function tambah() {
    const nama = normalizeKelas(namaBaru);
    if (!nama) {
      setNotif({ status: "error", message: "Nama kelas wajib diisi." });
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("nama", nama);
      const res = await fetch("/api/kelas", { method: "POST", body: fd });
      const data = await res.json();
      if (data.status === "ok") {
        setNamaBaru("");
        setNotif({ status: "ok", message: `Kelas "${nama}" berhasil ditambahkan.` });
      } else {
        setNotif({ status: "error", message: data.message || "Gagal menambahkan kelas." });
      }
    } catch {
      setNotif({ status: "error", message: "Terjadi kesalahan jaringan." });
    } finally {
      setSaving(false);
    }
  }

  async function simpanEdit() {
    if (!editing) return;
    const nama = normalizeKelas(namaEdit);
    if (!nama) {
      setNotif({ status: "error", message: "Nama kelas wajib diisi." });
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("nama", nama);
      const res = await fetch(`/api/kelas/${editing.id}`, { method: "PUT", body: fd });
      const data = await res.json();
      setEditing(null);
      if (data.status === "ok") {
        setNotif({ status: "ok", message: `Kelas berhasil diganti nama jadi "${nama}". Data siswa & wali kelas ikut disesuaikan.` });
      } else {
        setNotif({ status: "error", message: data.message || "Gagal mengubah nama kelas." });
      }
    } catch {
      setEditing(null);
      setNotif({ status: "error", message: "Terjadi kesalahan jaringan." });
    } finally {
      setSaving(false);
    }
  }

  async function hapus() {
    if (!confirmHapus) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/kelas/${confirmHapus.id}`, { method: "DELETE" });
      const data = await res.json();
      setConfirmHapus(null);
      if (data.status === "ok") {
        setNotif({ status: "ok", message: `Kelas "${confirmHapus.nama}" berhasil dihapus.` });
      } else {
        setNotif({ status: "error", message: data.message || "Gagal menghapus kelas." });
      }
    } catch {
      setConfirmHapus(null);
      setNotif({ status: "error", message: "Terjadi kesalahan jaringan." });
    } finally {
      setDeleting(false);
    }
  }

  function tutupNotif() {
    const wasSuccess = notif?.status === "ok";
    setNotif(null);
    if (wasSuccess) router.refresh();
  }

  return (
    <>
      <div className="section-card p-5 mb-6 shadow-sm reveal">
        <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
          <i className="fas fa-plus text-indigo-500" /> Tambah Kelas Baru
        </h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={namaBaru}
            onChange={(e) => setNamaBaru(e.target.value)}
            onBlur={(e) => setNamaBaru(normalizeKelas(e.target.value))}
            placeholder='cth: 7 atau 7A (tanpa kata "Kelas")'
            className="flex-1 px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          <button
            onClick={tambah}
            disabled={saving}
            className="px-5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl text-sm font-bold shadow-sm transition active:scale-95"
          >
            {saving ? <i className="fas fa-spinner fa-spin" /> : "Tambah"}
          </button>
        </div>
      </div>

      <div className="section-card shadow-sm overflow-hidden reveal">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-white/[0.05] bg-gray-50/50 dark:bg-gray-800/20">
          <h3 className="text-sm font-bold text-gray-800 dark:text-white flex items-center gap-2">
            <i className="fas fa-list text-indigo-500" /> Daftar Kelas
            <span className="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">({list.length} kelas)</span>
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 text-[10px] uppercase tracking-wider font-extrabold border-b border-gray-200 dark:border-gray-700/50">
              <tr>
                <th className="px-5 py-3 w-12 text-center">No</th>
                <th className="px-5 py-3">Nama Kelas</th>
                <th className="px-5 py-3">Wali Kelas</th>
                <th className="px-5 py-3 text-center">Siswa Laki-laki</th>
                <th className="px-5 py-3 text-center">Siswa Perempuan</th>
                <th className="px-5 py-3 text-center">Jumlah Siswa</th>
                <th className="px-5 py-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {list.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center">
                    <div className="flex flex-col items-center justify-center opacity-60">
                      <i className="fas fa-chalkboard text-4xl text-gray-300 dark:text-gray-600 mb-3" />
                      <p className="text-sm font-bold text-gray-500 dark:text-gray-400">Belum ada kelas terdaftar</p>
                    </div>
                  </td>
                </tr>
              ) : (
                list.map((k, i) => (
                  <tr key={k.id} className="tbl-row text-gray-700 dark:text-gray-300">
                    <td className="px-5 py-3 text-center text-xs font-bold text-gray-400">{i + 1}</td>
                    <td className="px-5 py-3">
                      <span className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/50 px-2.5 py-1 rounded-md text-xs font-bold">
                        Kelas {k.nama}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {k.waliKelas ? (
                        <span className="text-gray-700 dark:text-gray-300 font-semibold">{k.waliKelas}</span>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500 italic text-xs">Belum ada wali kelas</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-center text-blue-600 dark:text-blue-400 font-bold">{k.jumlahLaki}</td>
                    <td className="px-5 py-3 text-center text-pink-600 dark:text-pink-400 font-bold">{k.jumlahPerempuan}</td>
                    <td className="px-5 py-3 text-center font-bold text-gray-600 dark:text-gray-300">{k.jumlahSiswa}</td>
                    <td className="px-5 py-3 text-center">
                      <div className="flex justify-center items-center gap-2">
                        <button
                          onClick={() => {
                            setEditing(k);
                            setNamaEdit(k.nama);
                          }}
                          title="Ganti Nama"
                          className="w-8 h-8 rounded-lg flex items-center justify-center bg-violet-50 hover:bg-violet-100 dark:bg-violet-900/20 dark:hover:bg-violet-900/40 text-violet-600 dark:text-violet-400 transition"
                        >
                          <i className="fas fa-pen text-xs" />
                        </button>
                        <button
                          onClick={() => setConfirmHapus(k)}
                          title={k.jumlahSiswa > 0 ? "Masih ada siswa di kelas ini" : "Hapus Kelas"}
                          className="w-8 h-8 rounded-lg flex items-center justify-center bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-500 transition"
                        >
                          <i className="fas fa-trash text-xs" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <Portal>
          <div
            className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={(e) => e.target === e.currentTarget && setEditing(null)}
          >
            <div className="bg-white dark:bg-[#1e2535] rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700/60 w-full max-w-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-800/30">
                <span className="text-xs font-extrabold text-gray-500 dark:text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  <i className="fas fa-pen text-indigo-500" /> Ganti Nama Kelas
                </span>
              </div>
              <div className="p-5 space-y-2">
                <input
                  type="text"
                  value={namaEdit}
                  onChange={(e) => setNamaEdit(e.target.value)}
                  onBlur={(e) => setNamaEdit(normalizeKelas(e.target.value))}
                  autoFocus
                  className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <p className="text-[10px] text-gray-500 dark:text-gray-400">
                  Data siswa & wali kelas yang memakai nama lama akan otomatis ikut disesuaikan.
                </p>
              </div>
              <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-700/50 flex gap-3 bg-gray-50 dark:bg-gray-800/30">
                <button
                  onClick={() => setEditing(null)}
                  className="flex-1 px-4 py-2.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl text-sm font-bold transition"
                >
                  Batal
                </button>
                <button
                  onClick={simpanEdit}
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl text-sm font-bold shadow-sm transition flex items-center justify-center gap-2 active:scale-95"
                >
                  {saving ? <i className="fas fa-spinner fa-spin" /> : "Simpan"}
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {confirmHapus && (
        <Portal>
          <div
            className="fixed inset-0 z-[999] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md"
            onClick={() => !deleting && setConfirmHapus(null)}
          >
            <div
              className="bg-white dark:bg-[#1e2235] w-full max-w-[320px] rounded-[2.5rem] p-8 border border-gray-200 dark:border-white/10 shadow-2xl relative text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center -mt-16 mb-6">
                <div className="w-16 h-16 bg-white dark:bg-[#1e2235] border-4 border-gray-100 dark:border-[#282d45] rounded-full flex items-center justify-center shadow-xl">
                  <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-red-500/40">
                    <i className="fas fa-trash text-sm" />
                  </div>
                </div>
              </div>
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2 tracking-tight">Hapus Kelas?</h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed px-2 mb-8">
                Kelas <strong className="text-gray-700 dark:text-gray-300">{confirmHapus.nama}</strong> akan dihapus dari daftar
                master. {confirmHapus.jumlahSiswa > 0 && "Pindahkan dulu semua siswanya sebelum bisa dihapus."}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmHapus(null)}
                  disabled={deleting}
                  className="flex-1 py-3.5 bg-gray-200 dark:bg-[#282d45] hover:bg-gray-300 dark:hover:bg-[#323858] text-gray-600 dark:text-gray-400 rounded-2xl text-[10px] font-bold transition-all uppercase tracking-widest disabled:opacity-60"
                >
                  Batal
                </button>
                <button
                  onClick={hapus}
                  disabled={deleting}
                  className="flex-1 py-3.5 bg-red-600 hover:bg-red-700 disabled:opacity-70 text-white rounded-2xl text-[10px] font-bold transition-all uppercase tracking-widest shadow-lg shadow-red-500/20"
                >
                  {deleting ? <i className="fas fa-spinner fa-spin" /> : "Ya, Hapus"}
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      <NotifModal open={!!notif} status={notif?.status ?? "ok"} message={notif?.message ?? ""} onClose={tutupNotif} />
    </>
  );
}
