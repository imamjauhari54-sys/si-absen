"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StudentFull } from "@/types";
import Portal from "@/components/ui/Portal";
import NotifModal from "@/components/ui/NotifModal";

const KATA_KONFIRMASI = "HAPUS";

export default function SiswaNonaktifTable({ list }: { list: StudentFull[] }) {
  const router = useRouter();
  const [aktifkanTarget, setAktifkanTarget] = useState<StudentFull | null>(null);
  const [hapusTarget, setHapusTarget] = useState<StudentFull | null>(null);
  const [teksKonfirmasi, setTeksKonfirmasi] = useState("");
  const [busy, setBusy] = useState(false);
  const [notif, setNotif] = useState<{ status: "ok" | "error"; message: string } | null>(null);

  const konfirmasiValid = teksKonfirmasi.trim().toUpperCase() === KATA_KONFIRMASI;

  function bukaHapusPermanen(s: StudentFull) {
    setTeksKonfirmasi("");
    setHapusTarget(s);
  }
  function tutupHapusPermanen() {
    setHapusTarget(null);
    setTeksKonfirmasi("");
  }

  function tutupNotif() {
    const wasSuccess = notif?.status === "ok";
    setNotif(null);
    if (wasSuccess) router.refresh();
  }

  async function aktifkanSiswa() {
    if (!aktifkanTarget) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/siswa/${aktifkanTarget.id}/aktifkan`, { method: "POST" });
      const data = await res.json();
      const nama = aktifkanTarget.name;
      setAktifkanTarget(null);
      if (data.status === "ok") {
        setNotif({ status: "ok", message: `Siswa "${nama}" berhasil diaktifkan kembali.` });
      } else {
        setNotif({ status: "error", message: data.message || "Gagal mengaktifkan siswa." });
      }
    } catch {
      setAktifkanTarget(null);
      setNotif({ status: "error", message: "Terjadi kesalahan jaringan." });
    } finally {
      setBusy(false);
    }
  }

  async function hapusPermanen() {
    if (!hapusTarget || !konfirmasiValid) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/siswa/${hapusTarget.id}`, { method: "DELETE" });
      const data = await res.json();
      const nama = hapusTarget.name;
      tutupHapusPermanen();
      if (data.status === "ok") {
        setNotif({ status: "ok", message: `Data siswa "${nama}" berhasil dihapus permanen.` });
      } else {
        setNotif({ status: "error", message: data.message || "Gagal menghapus siswa." });
      }
    } catch {
      tutupHapusPermanen();
      setNotif({ status: "error", message: "Terjadi kesalahan jaringan." });
    } finally {
      setBusy(false);
    }
  }

  if (list.length === 0) {
    return (
      <div className="section-card p-10 text-center reveal">
        <i className="fas fa-user-check text-3xl text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Tidak ada siswa non-aktif saat ini.</p>
      </div>
    );
  }

  return (
    <>
      <div className="section-card shadow-sm overflow-hidden reveal">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/50 dark:bg-gray-800/20 border-b border-gray-100 dark:border-white/[0.05] text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                <th className="px-5 py-3">Nama</th>
                <th className="px-5 py-3">Kelas</th>
                <th className="px-5 py-3">NISN</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
              {list.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition">
                  <td className="px-5 py-3 font-semibold text-gray-800 dark:text-gray-100">{s.name}</td>
                  <td className="px-5 py-3 text-gray-600 dark:text-gray-400">{s.class}</td>
                  <td className="px-5 py-3 text-gray-600 dark:text-gray-400">{s.nisn || "-"}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                        s.status === "lulus"
                          ? "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
                          : "bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400"
                      }`}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setAktifkanTarget(s)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 text-xs font-bold transition"
                      >
                        <i className="fas fa-rotate-left text-[10px]" /> Aktifkan Kembali
                      </button>
                      <button
                        onClick={() => bukaHapusPermanen(s)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-500 text-xs font-bold transition"
                      >
                        <i className="fas fa-trash text-[10px]" /> Hapus Permanen
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal konfirmasi: aktifkan kembali */}
      {aktifkanTarget && (
        <Portal>
          <div
            className="fixed inset-0 z-[999] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md"
            onClick={() => !busy && setAktifkanTarget(null)}
          >
            <div
              className="bg-white dark:bg-[#1e2235] w-full max-w-[320px] rounded-[2.5rem] p-8 border border-gray-200 dark:border-white/10 shadow-2xl relative text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center -mt-16 mb-6">
                <div className="w-16 h-16 bg-white dark:bg-[#1e2235] border-4 border-gray-100 dark:border-[#282d45] rounded-full flex items-center justify-center shadow-xl">
                  <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-emerald-500/40">
                    <i className="fas fa-rotate-left text-sm" />
                  </div>
                </div>
              </div>
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2 tracking-tight">Aktifkan Kembali?</h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed px-2 mb-8">
                <strong className="text-gray-700 dark:text-gray-300">{aktifkanTarget.name}</strong> (Kelas {aktifkanTarget.class})
                akan muncul lagi di Data Siswa dan bisa dipakai scan absen seperti biasa.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setAktifkanTarget(null)}
                  disabled={busy}
                  className="flex-1 py-3.5 bg-gray-200 dark:bg-[#282d45] hover:bg-gray-300 dark:hover:bg-[#323858] text-gray-600 dark:text-gray-400 rounded-2xl text-[10px] font-bold transition-all uppercase tracking-widest disabled:opacity-60"
                >
                  Batal
                </button>
                <button
                  onClick={aktifkanSiswa}
                  disabled={busy}
                  className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-70 text-white rounded-2xl text-[10px] font-bold transition-all uppercase tracking-widest shadow-lg shadow-emerald-500/20"
                >
                  {busy ? <i className="fas fa-spinner fa-spin" /> : "Ya, Aktifkan"}
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* Modal konfirmasi: hapus permanen — wajib ketik "HAPUS" */}
      {hapusTarget && (
        <Portal>
          <div
            className="fixed inset-0 z-[999] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md"
            onClick={() => !busy && tutupHapusPermanen()}
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
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2 tracking-tight">Hapus Permanen?</h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed px-2 mb-6">
                Data <strong className="text-gray-700 dark:text-gray-300">{hapusTarget.name}</strong> (Kelas {hapusTarget.class})
                beserta seluruh riwayat absensinya akan dihapus permanen dari database dan{" "}
                <strong className="text-red-500">tidak bisa dikembalikan</strong>.
              </p>

              <div className="text-left mb-8">
                <div className="flex items-center gap-1.5 mb-2 px-1">
                  <i className="fas fa-lock text-red-500 text-[10px]" />
                  <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                    Ketik &quot;{KATA_KONFIRMASI}&quot; untuk konfirmasi
                  </span>
                </div>
                <input
                  type="text"
                  value={teksKonfirmasi}
                  onChange={(e) => setTeksKonfirmasi(e.target.value)}
                  disabled={busy}
                  placeholder={`Ketik ${KATA_KONFIRMASI}...`}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && konfirmasiValid && !busy) hapusPermanen();
                  }}
                  className="w-full px-4 py-3 rounded-2xl bg-gray-100 dark:bg-[#282d45] border border-gray-200 dark:border-white/10 text-center text-sm font-semibold tracking-widest text-gray-700 dark:text-gray-200 placeholder:font-normal placeholder:tracking-normal placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={tutupHapusPermanen}
                  disabled={busy}
                  className="flex-1 py-3.5 bg-gray-200 dark:bg-[#282d45] hover:bg-gray-300 dark:hover:bg-[#323858] text-gray-600 dark:text-gray-400 rounded-2xl text-[10px] font-bold transition-all uppercase tracking-widest disabled:opacity-60"
                >
                  Batal
                </button>
                <button
                  onClick={hapusPermanen}
                  disabled={busy || !konfirmasiValid}
                  className="flex-1 py-3.5 bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl text-[10px] font-bold transition-all uppercase tracking-widest shadow-lg shadow-red-500/20"
                >
                  {busy ? <i className="fas fa-spinner fa-spin" /> : "Ya, Hapus Permanen"}
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
