"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { StudentFull } from "@/types";
import IdCardVisual from "./IdCardVisual";
import SiswaFormModal from "./SiswaFormModal";
import Portal from "@/components/ui/Portal";
import NotifModal from "@/components/ui/NotifModal";

const AV_COLORS = [
  "from-indigo-500 to-purple-600",
  "from-blue-500 to-cyan-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-pink-500 to-rose-500",
];

export default function SiswaTable({
  list,
  search,
  namaSekolah,
  alamat,
  isAdmin,
  semuaKelas,
}: {
  list: StudentFull[];
  search: string;
  namaSekolah: string;
  alamat: string;
  isAdmin: boolean;
  semuaKelas: string[];
}) {
  const router = useRouter();
  const [preview, setPreview] = useState<StudentFull | null>(null);
  const [editing, setEditing] = useState<StudentFull | null>(null);
  const [confirmHapus, setConfirmHapus] = useState<StudentFull | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notif, setNotif] = useState<{ status: "ok" | "error"; message: string } | null>(null);
  const [alasanNonaktif, setAlasanNonaktif] = useState<"lulus" | "pindah">("lulus");

  function bukaKonfirmasiHapus(s: StudentFull) {
    setAlasanNonaktif("lulus");
    setConfirmHapus(s);
  }

  function tutupKonfirmasiHapus() {
    setConfirmHapus(null);
  }

  /**
   * Ini soft-delete: siswa dipindah ke status non-aktif (lulus/pindah), BUKAN
   * dihapus dari database. Riwayat absensinya tetap tersimpan dan bisa
   * diaktifkan lagi kapan saja lewat halaman "Siswa Nonaktif". Hapus permanen
   * (yang tidak bisa dibatalkan) hanya tersedia di halaman itu.
   */
  async function nonaktifkanSiswa() {
    if (!confirmHapus) return;
    setDeleting(true);
    try {
      const form = new FormData();
      form.set("alasan", alasanNonaktif);
      const res = await fetch(`/api/siswa/${confirmHapus.id}/nonaktifkan`, { method: "POST", body: form });
      const data = await res.json();
      const nama = confirmHapus.name;
      tutupKonfirmasiHapus();
      if (data.status === "ok") {
        setNotif({ status: "ok", message: `Siswa "${nama}" dipindah ke daftar non-aktif (${alasanNonaktif}).` });
      } else {
        setNotif({ status: "error", message: data.message || "Gagal menonaktifkan siswa." });
      }
    } catch {
      tutupKonfirmasiHapus();
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

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setPreview(null);
    }
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, []);

  return (
    <>
      <div className="section-card shadow-sm overflow-hidden reveal">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-white/[0.05] flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/20">
          <h3 className="text-sm font-bold text-gray-800 dark:text-white flex items-center gap-2">
            <i className="fas fa-users text-indigo-500" /> Daftar Siswa
            <span className="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">({list.length} siswa)</span>
          </h3>
          {search && (
            <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
              <i className="fas fa-filter text-indigo-400" />
              Hasil pencarian: &quot;<strong className="text-gray-700 dark:text-gray-300">{search}</strong>&quot;
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 text-[10px] uppercase tracking-wider font-extrabold border-b border-gray-200 dark:border-gray-700/50">
              <tr>
                <th className="px-5 py-3 w-12 text-center">No</th>
                <th className="px-5 py-3">Profil Siswa</th>
                <th className="px-5 py-3 text-center">Kelas</th>
                <th className="px-5 py-3 text-center">Jenis Kelamin</th>
                <th className="px-5 py-3 text-center">Status QR</th>
                <th className="px-5 py-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {list.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center">
                    <div className="flex flex-col items-center justify-center opacity-60">
                      <i className="fas fa-box-open text-4xl text-gray-300 dark:text-gray-600 mb-3" />
                      <p className="text-sm font-bold text-gray-500 dark:text-gray-400">Tidak ada data siswa ditemukan</p>
                      {search && <p className="text-xs text-gray-400 mt-1">Coba kata kunci yang berbeda</p>}
                    </div>
                  </td>
                </tr>
              ) : (
                list.map((s, i) => {
                  const isL = (s.jenis_kelamin ?? "").toLowerCase() === "l";
                  const inisial = s.name.charAt(0).toUpperCase();
                  const avColor = AV_COLORS[i % AV_COLORS.length];
                  return (
                    <tr key={s.id} className="tbl-row text-gray-700 dark:text-gray-300">
                      <td className="px-5 py-3 text-center text-xs font-bold text-gray-400">{i + 1}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`avatar bg-gradient-to-br ${avColor} shadow-sm`}>
                            {s.foto ? <img src={s.foto} className="w-full h-full object-cover" alt={s.name} /> : inisial}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-gray-800 dark:text-gray-200 truncate text-sm">{s.name}</p>
                            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 font-mono">
                              {s.nisn ? `NISN: ${s.nisn}` : <span className="italic">NISN belum diisi</span>}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/50 px-2.5 py-1 rounded-md text-xs font-bold">
                          {s.class}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-center">
                        {isL ? (
                          <span className="inline-flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide">
                            <i className="fas fa-mars" /> Laki-laki
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide">
                            <i className="fas fa-venus" /> Perempuan
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-center">
                        {s.token ? (
                          <span className="inline-flex items-center gap-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide">
                            <i className="fas fa-check-circle" /> Aktif
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide">
                            <i className="fas fa-times-circle" /> Belum
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <div className="flex justify-center items-center gap-2">
                          {isAdmin && (
                            <>
                              <button
                                onClick={() => setEditing(s)}
                                title="Edit Siswa"
                                className="w-8 h-8 rounded-lg flex items-center justify-center bg-violet-50 hover:bg-violet-100 dark:bg-violet-900/20 dark:hover:bg-violet-900/40 text-violet-600 dark:text-violet-400 transition"
                              >
                                <i className="fas fa-user-pen text-xs" />
                              </button>
                              <button
                                onClick={() => bukaKonfirmasiHapus(s)}
                                title="Nonaktifkan Siswa"
                                className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/20 dark:hover:bg-amber-900/40 text-amber-600 dark:text-amber-500 transition"
                              >
                                <i className="fas fa-user-slash text-xs" />
                              </button>
                            </>
                          )}
                          <Link
                            href={`/siswa/${s.id}/history?from=siswa`}
                            title="History Absensi"
                            className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/20 dark:hover:bg-amber-900/40 text-amber-600 dark:text-amber-400 transition"
                          >
                            <i className="fas fa-clock-rotate-left text-xs" />
                          </Link>
                          <button
                            onClick={() => setPreview(s)}
                            title="Preview ID Card"
                            className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100 hover:bg-indigo-100 dark:bg-gray-700/60 dark:hover:bg-indigo-900/30 text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400 transition"
                          >
                            <i className="fas fa-eye text-xs" />
                          </button>
                          <Link
                            href={`/cetak-idcard?id=${s.id}`}
                            target="_blank"
                            title="Cetak ID Card"
                            className="w-8 h-8 rounded-lg flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition active:scale-95"
                          >
                            <i className="fas fa-print text-xs" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {preview && (
        <Portal>
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setPreview(null)}
        >
          <div className="bg-white dark:bg-[#1e2535] rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700/60 w-full max-w-xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-700/50 flex justify-between items-center bg-gray-50 dark:bg-gray-800/30">
              <h3 className="text-xs font-extrabold text-gray-500 dark:text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <i className="fas fa-id-badge text-indigo-500" /> Preview ID Card
              </h3>
              <button
                onClick={() => setPreview(null)}
                className="w-7 h-7 rounded-lg flex items-center justify-center bg-gray-200 hover:bg-red-100 dark:bg-gray-700 dark:hover:bg-red-900/40 text-gray-500 hover:text-red-500 transition"
              >
                <i className="fas fa-times text-xs" />
              </button>
            </div>

            <div
              className="p-6 flex justify-center"
              style={{
                backgroundColor: "#f8fafc",
                backgroundImage: "radial-gradient(#cbd5e1 1px, transparent 1px)",
                backgroundSize: "12px 12px",
              }}
            >
              <IdCardVisual
                namaSekolah={namaSekolah}
                alamat={alamat}
                nama={preview.name}
                kelas={preview.class}
                nisn={preview.nisn}
                foto={preview.foto}
                token={preview.token}
              />
            </div>

            <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-700/50 flex gap-3 bg-gray-50 dark:bg-gray-800/30">
              <button
                onClick={() => setPreview(null)}
                className="flex-1 px-4 py-2.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl text-sm font-bold transition"
              >
                Tutup
              </button>
              <a
                href={`/cetak-idcard?id=${preview.id}`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-sm transition flex items-center justify-center gap-2 active:scale-95"
              >
                <i className="fas fa-print" /> Cetak
              </a>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {editing && <SiswaFormModal mode="edit" initialData={editing} semuaKelas={semuaKelas} onClose={() => setEditing(null)} />}

      {confirmHapus && (
        <Portal>
          <div
            className="fixed inset-0 z-[999] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md"
            onClick={() => !deleting && tutupKonfirmasiHapus()}
          >
            <div
              className="bg-white dark:bg-[#1e2235] w-full max-w-[320px] rounded-[2.5rem] p-8 border border-gray-200 dark:border-white/10 shadow-2xl relative text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center -mt-16 mb-6">
                <div className="w-16 h-16 bg-white dark:bg-[#1e2235] border-4 border-gray-100 dark:border-[#282d45] rounded-full flex items-center justify-center shadow-xl">
                  <div className="w-10 h-10 bg-amber-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-amber-500/40">
                    <i className="fas fa-user-slash text-sm" />
                  </div>
                </div>
              </div>
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2 tracking-tight">Nonaktifkan Siswa?</h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed px-2 mb-6">
                <strong className="text-gray-700 dark:text-gray-300">{confirmHapus.name}</strong> (Kelas {confirmHapus.class}) akan
                dipindah ke daftar <strong>Siswa Nonaktif</strong> dan tidak muncul lagi di Data Siswa. Riwayat absensinya tetap
                tersimpan, dan status ini bisa dibatalkan (diaktifkan lagi) kapan saja.
              </p>

              <div className="text-left mb-8">
                <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2 px-1">
                  Alasan
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(["lulus", "pindah"] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      disabled={deleting}
                      onClick={() => setAlasanNonaktif(opt)}
                      className={`py-2.5 rounded-xl text-xs font-bold capitalize transition-all border ${
                        alasanNonaktif === opt
                          ? "bg-amber-500 border-amber-500 text-white shadow-md shadow-amber-500/30"
                          : "bg-gray-100 dark:bg-[#282d45] border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-[#323858]"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={tutupKonfirmasiHapus}
                  disabled={deleting}
                  className="flex-1 py-3.5 bg-gray-200 dark:bg-[#282d45] hover:bg-gray-300 dark:hover:bg-[#323858] text-gray-600 dark:text-gray-400 rounded-2xl text-[10px] font-bold transition-all uppercase tracking-widest disabled:opacity-60"
                >
                  Batal
                </button>
                <button
                  onClick={nonaktifkanSiswa}
                  disabled={deleting}
                  className="flex-1 py-3.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-70 text-white rounded-2xl text-[10px] font-bold transition-all uppercase tracking-widest shadow-lg shadow-amber-500/20"
                >
                  {deleting ? <i className="fas fa-spinner fa-spin" /> : "Ya, Nonaktifkan"}
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
