"use client";

import { useState } from "react";
import "./rekap.css";
import type { HariLiburRow } from "@/lib/data/hari-libur";
import Portal from "@/components/ui/Portal";
import NotifModal from "@/components/ui/NotifModal";

const BULAN_NAMA = ["", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function formatTgl(tanggal: string): string {
  const [y, m, d] = tanggal.split("-");
  return `${d} ${BULAN_NAMA[Number(m)]} ${y}`;
}

export default function HariLiburModal() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<HariLiburRow[] | null>(null);
  const [tgl, setTgl] = useState("");
  const [tglSampai, setTglSampai] = useState("");
  const [ket, setKet] = useState("");
  const [saving, setSaving] = useState(false);
  const [notif, setNotif] = useState<{ status: "ok" | "error"; message: string } | null>(null);
  const [confirmHapus, setConfirmHapus] = useState<HariLiburRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [showSinkron, setShowSinkron] = useState(false);
  const [tahunSinkron, setTahunSinkron] = useState(new Date().getFullYear());
  const [sinkronBusy, setSinkronBusy] = useState(false);

  async function muatLibur() {
    setLoading(true);
    try {
      const res = await fetch("/api/hari-libur");
      const data = await res.json();
      setList(data.status === "ok" ? data.data : []);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  }

  function bukaModal() {
    setOpen(true);
    muatLibur();
  }

  async function tambahLibur() {
    if (!tgl || !ket.trim()) {
      setNotif({ status: "error", message: "Tanggal dan keterangan wajib diisi." });
      return;
    }
    if (tglSampai && tglSampai < tgl) {
      setNotif({ status: "error", message: '"Sampai Tanggal" tidak boleh sebelum "Tanggal".' });
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("tanggal", tgl);
      if (tglSampai) fd.append("sampaiTanggal", tglSampai);
      fd.append("keterangan", ket.trim());
      const res = await fetch("/api/hari-libur", { method: "POST", body: fd });
      const data = await res.json();
      if (data.status === "ok") {
        setTgl("");
        setTglSampai("");
        setKet("");
        muatLibur();
        const pesan =
          data.jumlah && data.jumlah > 1
            ? `${data.jumlah} hari libur berhasil ditambahkan.`
            : "Hari libur berhasil ditambahkan.";
        setNotif({ status: "ok", message: pesan });
      } else {
        setNotif({ status: "error", message: data.message || "Terjadi kesalahan." });
      }
    } catch {
      setNotif({ status: "error", message: "Terjadi kesalahan jaringan." });
    } finally {
      setSaving(false);
    }
  }

  async function jalankanSinkron() {
    setSinkronBusy(true);
    try {
      const fd = new FormData();
      fd.append("tahun", String(tahunSinkron));
      const res = await fetch("/api/hari-libur/sync", { method: "POST", body: fd });
      const data = await res.json();
      if (data.status === "ok") {
        setShowSinkron(false);
        muatLibur();
        setNotif({
          status: "ok",
          message: `Berhasil menyinkronkan ${data.jumlah} hari libur nasional tahun ${data.tahun}.`,
        });
      } else {
        setNotif({ status: "error", message: data.message || "Gagal sinkronisasi." });
      }
    } catch {
      setNotif({ status: "error", message: "Terjadi kesalahan jaringan." });
    } finally {
      setSinkronBusy(false);
    }
  }

  async function hapusLibur() {
    if (!confirmHapus) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/hari-libur/${confirmHapus.id}`, { method: "DELETE" });
      const data = await res.json();
      setConfirmHapus(null);
      if (data.status === "ok") {
        muatLibur();
        setNotif({ status: "ok", message: "Hari libur berhasil dihapus." });
      } else {
        setNotif({ status: "error", message: data.message || "Gagal menghapus hari libur." });
      }
    } catch {
      setConfirmHapus(null);
      setNotif({ status: "error", message: "Terjadi kesalahan jaringan." });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={bukaModal}
        className="h-10 px-4 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50 hover:bg-rose-100 dark:hover:bg-rose-900/40 rounded-xl text-sm font-bold transition flex items-center gap-2"
      >
        <i className="fas fa-calendar-times" />
        <span className="hidden sm:inline">Hari Libur</span>
      </button>

      {open && (
        <Portal>
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm no-print"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="modal-inner bg-white dark:bg-[#1e2535] rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700/60 w-full max-w-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/50 flex justify-between items-center bg-gray-50 dark:bg-gray-800/30">
              <span className="text-xs font-extrabold text-gray-500 dark:text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <i className="fas fa-calendar-times text-rose-500" /> Kelola Hari Libur
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowSinkron((v) => !v)}
                  title="Sinkronisasi hari libur nasional Indonesia dari Google Calendar"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50 rounded-xl text-xs font-bold transition"
                >
                  <i className="fas fa-sync-alt text-[10px]" />
                  <span className="hidden sm:inline">Sinkron Libur Nasional</span>
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center bg-gray-200 hover:bg-red-100 dark:bg-gray-700 dark:hover:bg-red-900/40 text-gray-500 hover:text-red-500 transition"
                >
                  <i className="fas fa-times text-xs" />
                </button>
              </div>
            </div>

            <div className="p-5 border-b border-gray-100 dark:border-gray-700/50">
              {showSinkron && (
                <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-xl">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-blue-700 dark:text-blue-400 flex items-center gap-2">
                      <i className="fas fa-info-circle" /> Sinkronisasi dari Google Calendar Indonesia
                    </span>
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold">Tahun:</label>
                      <input
                        type="number"
                        value={tahunSinkron}
                        onChange={(e) => setTahunSinkron(parseInt(e.target.value, 10) || tahunSinkron)}
                        min={2020}
                        max={2035}
                        className="w-20 px-2 py-1 text-xs border border-blue-200 dark:border-blue-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={jalankanSinkron}
                        disabled={sinkronBusy}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-xs font-bold transition"
                      >
                        {sinkronBusy ? (
                          <i className="fas fa-spinner fa-spin" />
                        ) : (
                          <>
                            <i className="fas fa-download mr-1" />
                            Ambil
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[130px]">
                  <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
                    Tanggal
                  </label>
                  <input
                    type="date"
                    value={tgl}
                    onChange={(e) => setTgl(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-rose-500 outline-none"
                  />
                </div>
                <div className="flex-1 min-w-[130px]">
                  <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
                    Sampai Tanggal <span className="normal-case font-medium text-gray-400">(opsional)</span>
                  </label>
                  <input
                    type="date"
                    value={tglSampai}
                    min={tgl || undefined}
                    onChange={(e) => setTglSampai(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-rose-500 outline-none"
                  />
                </div>
                <div className="flex-1 min-w-[160px]">
                  <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
                    Keterangan
                  </label>
                  <input
                    type="text"
                    value={ket}
                    onChange={(e) => setKet(e.target.value)}
                    placeholder="cth: Idul Fitri"
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-rose-500 outline-none"
                  />
                </div>
                <button
                  onClick={tambahLibur}
                  disabled={saving}
                  className="h-10 px-5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl text-sm font-bold transition shadow-sm flex items-center gap-2 active:scale-95"
                >
                  {saving ? <i className="fas fa-spinner fa-spin" /> : "Simpan"}
                </button>
              </div>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2">
                Kosongkan &quot;Sampai Tanggal&quot; kalau cuma 1 hari. Isi kalau libur beberapa hari sekaligus (mis.
                cuti bersama) — keterangannya akan sama untuk semua tanggal di rentang itu.
              </p>
            </div>

            <div className="overflow-y-auto" style={{ maxHeight: 320 }}>
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 dark:bg-gray-800/50 text-[10px] uppercase font-extrabold text-gray-500 dark:text-gray-400 tracking-wider sticky top-0">
                  <tr>
                    <th className="px-5 py-3">Tanggal</th>
                    <th className="px-5 py-3">Keterangan</th>
                    <th className="px-5 py-3 text-center w-16">Hapus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                  {loading ? (
                    <tr>
                      <td colSpan={3} className="p-6 text-center text-gray-400 text-xs">
                        <i className="fas fa-spinner fa-spin mr-2" />
                        Memuat...
                      </td>
                    </tr>
                  ) : !list || list.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-6 text-center text-gray-400 text-xs">
                        Belum ada data hari libur.
                      </td>
                    </tr>
                  ) : (
                    list.map((r) => (
                      <tr key={r.id} className="hover:bg-rose-50/30 dark:hover:bg-rose-900/10 transition-colors">
                        <td className="px-5 py-3 font-mono text-xs font-bold text-gray-700 dark:text-gray-300">{formatTgl(r.tanggal)}</td>
                        <td className="px-5 py-3 text-sm text-gray-700 dark:text-gray-300">{r.keterangan}</td>
                        <td className="px-5 py-3 text-center">
                          <button
                            onClick={() => setConfirmHapus(r)}
                            className="w-7 h-7 rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-500 transition flex items-center justify-center mx-auto"
                          >
                            <i className="fas fa-trash text-xs" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
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
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2 tracking-tight">Hapus Hari Libur?</h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed px-2 mb-8">
                Tanggal <strong className="text-gray-700 dark:text-gray-300">{formatTgl(confirmHapus.tanggal)}</strong> (
                {confirmHapus.keterangan}) akan dihapus dari daftar hari libur.
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
                  onClick={hapusLibur}
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

      <NotifModal open={!!notif} status={notif?.status ?? "ok"} message={notif?.message ?? ""} onClose={() => setNotif(null)} />
    </>
  );
}
