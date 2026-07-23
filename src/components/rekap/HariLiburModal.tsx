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
  const [ket, setKet] = useState("");
  const [saving, setSaving] = useState(false);
  const [notif, setNotif] = useState<{ status: "ok" | "error"; message: string } | null>(null);

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
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("tanggal", tgl);
      fd.append("keterangan", ket.trim());
      const res = await fetch("/api/hari-libur", { method: "POST", body: fd });
      const data = await res.json();
      if (data.status === "ok") {
        setTgl("");
        setKet("");
        muatLibur();
        setNotif({ status: "ok", message: "Hari libur berhasil ditambahkan." });
      } else {
        setNotif({ status: "error", message: data.message || "Terjadi kesalahan." });
      }
    } catch {
      setNotif({ status: "error", message: "Terjadi kesalahan jaringan." });
    } finally {
      setSaving(false);
    }
  }

  async function hapusLibur(id: number) {
    if (!confirm("Hapus hari libur ini?")) return;
    try {
      const res = await fetch(`/api/hari-libur/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.status === "ok") {
        muatLibur();
        setNotif({ status: "ok", message: "Hari libur berhasil dihapus." });
      } else {
        setNotif({ status: "error", message: data.message || "Gagal menghapus hari libur." });
      }
    } catch {
      setNotif({ status: "error", message: "Terjadi kesalahan jaringan." });
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
              <button
                onClick={() => setOpen(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center bg-gray-200 hover:bg-red-100 dark:bg-gray-700 dark:hover:bg-red-900/40 text-gray-500 hover:text-red-500 transition"
              >
                <i className="fas fa-times text-xs" />
              </button>
            </div>

            <div className="p-5 border-b border-gray-100 dark:border-gray-700/50">
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
                            onClick={() => hapusLibur(r.id)}
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

      <NotifModal open={!!notif} status={notif?.status ?? "ok"} message={notif?.message ?? ""} onClose={() => setNotif(null)} />
    </>
  );
}
