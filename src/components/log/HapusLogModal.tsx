"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Portal from "@/components/ui/Portal";
import NotifModal from "@/components/ui/NotifModal";
import { formatTglIndo } from "@/lib/utils/tanggal";
import type { JenisLog } from "@/lib/utils/hapus-log";

/**
 * Tombol + modal "Hapus Log" berdasarkan rentang tanggal (hanya dipakai di halaman admin).
 * Alur: pilih rentang → "Cek Jumlah" (pratinjau) → unduh CSV (opsional) → "Ya, Hapus".
 * Batas tanggal akhir dihitung di server (`batasAkhir`): log aktivitas minimal 90 hari, WA sampai hari ini.
 */
export default function HapusLogModal({
  jenis,
  batasAkhir,
  minUmurHari,
}: {
  jenis: JenisLog;
  /** Tanggal "Sampai" paling akhir yang boleh dipilih (YYYY-MM-DD). */
  batasAkhir: string;
  /** Hanya log aktivitas: umur minimal log yang boleh dihapus (hari). */
  minUmurHari?: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dari, setDari] = useState("");
  const [sampai, setSampai] = useState("");
  const [hanyaBerhasil, setHanyaBerhasil] = useState(true);
  const [jumlah, setJumlah] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [notif, setNotif] = useState<{ status: "ok" | "error"; message: string } | null>(null);

  const namaLog = jenis === "aktivitas" ? "Log Aktivitas" : "Log WA";
  const endpoint = `/api/log/${jenis}/hapus`;
  const siap = dari !== "" && sampai !== "";

  function tutup() {
    if (busy) return;
    setOpen(false);
    setJumlah(null);
  }

  function ubahTanggal(setter: (v: string) => void, v: string) {
    setter(v);
    setJumlah(null); // pratinjau lama tidak berlaku lagi
  }

  function bentukForm(aksi: "pratinjau" | "hapus") {
    const form = new FormData();
    form.set("aksi", aksi);
    form.set("dari", dari);
    form.set("sampai", sampai);
    if (jenis === "wa" && hanyaBerhasil) form.set("hanyaBerhasil", "1");
    return form;
  }

  async function kirim(aksi: "pratinjau" | "hapus") {
    setBusy(true);
    try {
      const res = await fetch(endpoint, { method: "POST", body: bentukForm(aksi) });
      const data = await res.json();
      if (data.status !== "ok") {
        setNotif({ status: "error", message: data.message || "Gagal memproses log." });
        return;
      }
      if (aksi === "pratinjau") {
        setJumlah(data.jumlah as number);
      } else {
        setOpen(false);
        setJumlah(null);
        setNotif({ status: "ok", message: `${data.jumlah} data ${namaLog} berhasil dihapus.` });
      }
    } catch {
      setNotif({ status: "error", message: "Terjadi kesalahan jaringan." });
    } finally {
      setBusy(false);
    }
  }

  const query = new URLSearchParams({ dari, sampai, ...(jenis === "wa" && hanyaBerhasil ? { hanyaBerhasil: "1" } : {}) });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2.5 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 rounded-xl text-xs font-bold transition"
      >
        <i className="fas fa-broom" /> Hapus Log Lama
      </button>

      {open && (
        <Portal>
          <div
            className="fixed inset-0 z-[999] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md"
            onClick={tutup}
          >
            <div
              className="bg-white dark:bg-[#1e2235] w-full max-w-[320px] rounded-[2.5rem] p-8 border border-gray-200 dark:border-white/10 shadow-2xl relative text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center -mt-16 mb-6">
                <div className="w-16 h-16 bg-white dark:bg-[#1e2235] border-4 border-gray-100 dark:border-[#282d45] rounded-full flex items-center justify-center shadow-xl">
                  <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-red-500/40">
                    <i className="fas fa-broom text-sm" />
                  </div>
                </div>
              </div>
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2 tracking-tight">Hapus {namaLog}</h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed px-2 mb-5">
                {jenis === "aktivitas" && minUmurHari
                  ? `Pilih rentang tanggal. Hanya log yang sudah lebih dari ${minUmurHari} hari yang bisa dihapus (sampai ${formatTglIndo(batasAkhir)}). `
                  : "Pilih rentang tanggal log yang akan dihapus. "}
                Penghapusan bersifat <strong>permanen</strong>.
              </p>

              <div className="text-left grid grid-cols-2 gap-3 mb-3">
                <label className="block">
                  <span className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2 px-1">Dari</span>
                  <input
                    type="date"
                    value={dari}
                    max={batasAkhir}
                    disabled={busy}
                    onChange={(e) => ubahTanggal(setDari, e.target.value)}
                    className="w-full py-2.5 px-2 rounded-xl text-xs font-bold border bg-gray-100 dark:bg-[#282d45] border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-200"
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2 px-1">Sampai</span>
                  <input
                    type="date"
                    value={sampai}
                    max={batasAkhir}
                    disabled={busy}
                    onChange={(e) => ubahTanggal(setSampai, e.target.value)}
                    className="w-full py-2.5 px-2 rounded-xl text-xs font-bold border bg-gray-100 dark:bg-[#282d45] border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-200"
                  />
                </label>
              </div>

              {jenis === "wa" && (
                <label className="flex items-start gap-2 text-left text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed px-1 mb-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hanyaBerhasil}
                    disabled={busy}
                    onChange={(e) => {
                      setHanyaBerhasil(e.target.checked);
                      setJumlah(null);
                    }}
                    className="mt-0.5 accent-red-500"
                  />
                  <span>Sisakan log yang gagal (hapus yang terkirim saja), berguna untuk menelusuri nomor HP yang salah.</span>
                </label>
              )}

              {jumlah !== null && (
                <div
                  className={`rounded-xl px-3 py-3 mb-3 text-xs border ${
                    jumlah > 0
                      ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300"
                      : "bg-gray-100 dark:bg-[#282d45] border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400"
                  }`}
                >
                  {jumlah > 0 ? (
                    <>
                      Akan menghapus <strong>{jumlah}</strong> data
                      <div className="text-[10px] mt-0.5 opacity-80">
                        {formatTglIndo(dari)} – {formatTglIndo(sampai)}
                      </div>
                    </>
                  ) : (
                    "Tidak ada data pada rentang ini."
                  )}
                </div>
              )}

              {jumlah !== null && jumlah > 0 && (
                <a
                  href={`/api/log/${jenis}/export?${query.toString()}`}
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline mb-3"
                >
                  <i className="fas fa-file-csv" /> Unduh CSV dulu (arsip)
                </a>
              )}

              <div className="flex gap-3 mt-4">
                <button
                  onClick={tutup}
                  disabled={busy}
                  className="flex-1 py-3.5 bg-gray-200 dark:bg-[#282d45] hover:bg-gray-300 dark:hover:bg-[#323858] text-gray-600 dark:text-gray-400 rounded-2xl text-[10px] font-bold transition-all uppercase tracking-widest disabled:opacity-60"
                >
                  Batal
                </button>
                {jumlah !== null && jumlah > 0 ? (
                  <button
                    onClick={() => kirim("hapus")}
                    disabled={busy}
                    className="flex-1 py-3.5 bg-red-600 hover:bg-red-700 disabled:opacity-70 text-white rounded-2xl text-[10px] font-bold transition-all uppercase tracking-widest shadow-lg shadow-red-500/20"
                  >
                    {busy ? <i className="fas fa-spinner fa-spin" /> : "Ya, Hapus"}
                  </button>
                ) : (
                  <button
                    onClick={() => kirim("pratinjau")}
                    disabled={busy || !siap}
                    className="flex-1 py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-2xl text-[10px] font-bold transition-all uppercase tracking-widest shadow-lg shadow-indigo-500/20"
                  >
                    {busy ? <i className="fas fa-spinner fa-spin" /> : "Cek Jumlah"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </Portal>
      )}

      <NotifModal
        open={!!notif}
        status={notif?.status ?? "ok"}
        message={notif?.message ?? ""}
        onClose={() => {
          const sukses = notif?.status === "ok";
          setNotif(null);
          if (sukses) router.refresh();
        }}
      />
    </>
  );
}
