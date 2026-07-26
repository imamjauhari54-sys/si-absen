"use client";

import { useEffect, useState } from "react";
import "./rekap.css";
import type { RekapHarianRow, StatusHarian } from "@/lib/data/rekap";
import Portal from "@/components/ui/Portal";
import NotifModal from "@/components/ui/NotifModal";
import LampiranUploader from "@/components/rekap/LampiranUploader";

const BADGE_MAP: Record<string, string> = {
  hadir: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
  terlambat: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
  izin: "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400",
  sakit: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400",
  alpha: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
};
const ST_OPTS: { st: StatusHarian; icon: string; color: string; emoji: string; label: string }[] = [
  { st: "hadir", icon: "fa-check-square", color: "text-emerald-500", emoji: "✅", label: "Hadir" },
  { st: "terlambat", icon: "fa-clock", color: "text-amber-500", emoji: "⏰", label: "Terlambat" },
  { st: "izin", icon: "fa-file-alt", color: "text-indigo-500", emoji: "📝", label: "Izin" },
  { st: "sakit", icon: "fa-briefcase-medical", color: "text-purple-500", emoji: "🤒", label: "Sakit" },
  { st: "alpha", icon: "fa-times-circle", color: "text-red-500", emoji: "❌", label: "Alpha" },
];
const KET_ALPHA_DEFAULT = "Tanpa Keterangan";

export default function HarianTable({ rows: initialRows, tanggal }: { rows: RekapHarianRow[]; tanggal: string }) {
  const [rows, setRows] = useState(initialRows);
  const [editing, setEditing] = useState<RekapHarianRow | null>(null);
  const [tglDari, setTglDari] = useState("");
  const [tglSampai, setTglSampai] = useState("");
  const [selSt, setSelSt] = useState<StatusHarian | "">("");
  const [ket, setKet] = useState("");
  const [lampiranUrl, setLampiranUrl] = useState<string | null>(null); // null = tidak diubah
  const [saving, setSaving] = useState(false);
  const [notif, setNotif] = useState<{ status: "ok" | "error"; message: string } | null>(null);

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setEditing(null);
    }
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, []);

  function bukaModal(row: RekapHarianRow) {
    setEditing(row);
    setTglDari(tanggal);
    setTglSampai("");
    const statusAwal = row.status === "kosong" ? "alpha" : row.status;
    setSelSt(statusAwal);
    setKet(statusAwal === "alpha" ? row.keterangan || KET_ALPHA_DEFAULT : row.keterangan ?? "");
    setLampiranUrl(null);
  }

  function pilihStatus(st: StatusHarian) {
    setSelSt(st);
    if (st === "alpha") {
      if (!ket || ket === KET_ALPHA_DEFAULT) setKet(KET_ALPHA_DEFAULT);
    } else if (ket === KET_ALPHA_DEFAULT) {
      setKet("");
    }
  }

  async function simpanEdit() {
    if (!editing || !selSt || !tglDari) return;
    if (tglSampai && tglSampai < tglDari) {
      setNotif({ status: "error", message: '"Sampai Tanggal" tidak boleh lebih awal dari "Dari Tanggal".' });
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("action", "edit_status");
      fd.append("siswa_id", String(editing.id));
      fd.append("tanggal", tglDari);
      if (tglSampai) fd.append("tanggal_sampai", tglSampai);
      fd.append("status", selSt);
      fd.append("keterangan", ket);
      if (lampiranUrl !== null) fd.append("lampiran_url", lampiranUrl === "" ? "__HAPUS__" : lampiranUrl);

      const res = await fetch("/api/absen/edit", { method: "POST", body: fd });
      const data = await res.json();

      if (data.status === "ok") {
        // Update baris di tabel kalau tanggal yang lagi ditampilkan (tanggal
        // prop) termasuk dalam rentang yang barusan diedit.
        const akhir = tglSampai || tglDari;
        if (tglDari <= tanggal && tanggal <= akhir) {
          setRows((prev) =>
            prev.map((r) => (r.id === editing.id ? { ...r, status: selSt, keterangan: ket || null } : r))
          );
        }
        setEditing(null);
        const pesan =
          data.diproses > 1
            ? `Status kehadiran ${data.diproses} hari berhasil diperbarui.${
                data.dilewati > 0 ? ` (${data.dilewati} hari dilewati karena Minggu/libur)` : ""
              }`
            : "Status kehadiran berhasil diperbarui.";
        setNotif({ status: "ok", message: pesan });
      } else {
        setNotif({ status: "error", message: data.message || "Terjadi kesalahan." });
      }
    } catch {
      setNotif({ status: "error", message: "Terjadi kesalahan jaringan. Silakan coba lagi." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="section-card shadow-sm overflow-hidden reveal">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-white/[0.05] flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/20 flex-wrap gap-3">
          <h3 className="text-sm font-bold text-gray-800 dark:text-white flex items-center gap-2">
            <i className="fas fa-list text-indigo-500" /> Daftar Kehadiran Siswa
            <span className="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">({rows.length} siswa)</span>
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 text-[10px] uppercase tracking-wider font-extrabold border-b border-gray-200 dark:border-gray-700/50">
              <tr>
                <th className="px-5 py-3 w-12 text-center">No</th>
                <th className="px-5 py-3">Nama Siswa</th>
                <th className="px-5 py-3 text-center">Kelas</th>
                <th className="px-5 py-3 text-center">Status</th>
                <th className="px-5 py-3 text-center">Jam Masuk</th>
                <th className="px-5 py-3 text-center">Jam Pulang</th>
                <th className="px-5 py-3">Keterangan</th>
                <th className="px-5 py-3 text-center no-print">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-gray-400 font-medium">
                    <i className="fas fa-inbox text-3xl mb-3 block opacity-50" />
                    Tidak ada data untuk tanggal ini.
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => {
                  const bc = BADGE_MAP[row.status] ?? "bg-gray-100 text-gray-600";
                  return (
                    <tr key={row.id} className="tbl-row text-gray-700 dark:text-gray-300">
                      <td className="px-5 py-3 text-center text-xs font-bold text-gray-400">{i + 1}</td>
                      <td className="px-5 py-3 font-bold text-gray-800 dark:text-gray-200">{row.name}</td>
                      <td className="px-5 py-3 text-center">
                        <span className="bg-gray-100 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded text-xs font-bold">
                          {row.class}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-center">
                        {row.status === "kosong" ? (
                          <span className="text-gray-400 font-bold text-xl">-</span>
                        ) : (
                          <span className={`${bc} px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase tracking-wide`}>
                            {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-center font-mono text-xs font-bold text-gray-500 dark:text-gray-400">
                        {row.jam_masuk ? row.jam_masuk.slice(0, 5) : "—"}
                      </td>
                      <td className="px-5 py-3 text-center font-mono text-xs font-bold text-gray-500 dark:text-gray-400">
                        {row.jam_pulang ? row.jam_pulang.slice(0, 5) : "—"}
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-500 dark:text-gray-400">
                        {row.keterangan || <span className="opacity-40">—</span>}
                      </td>
                      <td className="px-5 py-3 text-center no-print">
                        <button
                          onClick={() => bukaModal(row)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-bold transition"
                        >
                          <i className="fas fa-pen" /> Edit
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <Portal>
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm no-print"
          onClick={(e) => e.target === e.currentTarget && setEditing(null)}
        >
          <div className="modal-inner bg-white dark:bg-[#1e2535] rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700/60 w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/50 flex justify-between items-center bg-gray-50 dark:bg-gray-800/30">
              <span className="text-xs font-extrabold text-gray-500 dark:text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <i className="fas fa-pen-square text-indigo-500" /> Edit Kehadiran
              </span>
              <button
                onClick={() => setEditing(null)}
                className="w-7 h-7 rounded-lg flex items-center justify-center bg-gray-200 hover:bg-red-100 dark:bg-gray-700 dark:hover:bg-red-900/40 text-gray-500 hover:text-red-500 transition"
              >
                <i className="fas fa-times text-xs" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 flex-shrink-0">
                  <i className="fas fa-user-circle text-lg" />
                </div>
                <div className="text-base font-extrabold text-gray-800 dark:text-white">{editing.name}</div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
                  <i className="fas fa-calendar-alt text-indigo-400 mr-1" /> Rentang Tanggal
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[10px] text-gray-400 mb-1">Dari Tanggal</div>
                    <input
                      type="date"
                      value={tglDari}
                      onChange={(e) => setTglDari(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-400 mb-1">Sampai Tanggal</div>
                    <input
                      type="date"
                      value={tglSampai}
                      min={tglDari || undefined}
                      onChange={(e) => setTglSampai(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-gray-400 mt-1.5 flex items-center gap-1">
                  <i className="fas fa-info-circle text-indigo-400" />
                  Kosongkan &quot;Sampai Tanggal&quot; jika hanya 1 hari
                </p>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">
                  <i className="fas fa-tag text-indigo-400 mr-1" /> Kategori
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {ST_OPTS.map((opt) => (
                    <button
                      key={opt.st}
                      onClick={() => pilihStatus(opt.st)}
                      className={`st-btn ${selSt === opt.st ? `active-${opt.st}` : ""}`}
                    >
                      <i className={`fas ${opt.icon} ${opt.color}`} />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <LampiranUploader
                key={editing.id}
                existingUrl={editing.lampiran}
                onChange={setLampiranUrl}
              />

              <div>
                <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
                  <i className="fas fa-comment-alt text-indigo-400 mr-1" /> Alasan / Keterangan
                </label>
                <textarea
                  rows={3}
                  value={ket}
                  onChange={(e) => setKet(e.target.value)}
                  placeholder="Tulis alasan / keterangan..."
                  className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition resize-none leading-relaxed"
                />
                {selSt === "alpha" && (
                  <p className="text-[10px] text-red-500 dark:text-red-400 mt-1 flex items-center gap-1">
                    <i className="fas fa-robot" /> Keterangan otomatis diisi untuk status Alpha
                  </p>
                )}
              </div>
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
                disabled={saving || !selSt || !tglDari}
                className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl text-sm font-bold shadow-sm transition flex items-center justify-center gap-2 active:scale-95"
              >
                {saving ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-save" />}
                {saving ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      <NotifModal open={!!notif} status={notif?.status ?? "ok"} message={notif?.message ?? ""} onClose={() => setNotif(null)} />
    </>
  );
}
