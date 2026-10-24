"use client";

import Portal from "./Portal";

/**
 * Modal konfirmasi peringatan (ikon amber) dengan gaya yang sama seperti modal lain di aplikasi
 * (NotifModal, "Aktifkan Kembali?", dst.). Dipakai saat server meminta konfirmasi sebelum menyimpan,
 * mis. tanggal pindah yang jatuh di hari Minggu atau masih punya absensi sesudahnya.
 * `pesan` boleh berisi beberapa baris (dipisah \n); tiap baris tampil sebagai butir sendiri.
 */
export default function KonfirmasiPeringatanModal({
  open,
  judul = "Periksa Lagi",
  pesan,
  labelYa = "Ya, Lanjutkan",
  busy = false,
  onYa,
  onBatal,
}: {
  open: boolean;
  judul?: string;
  pesan: string;
  labelYa?: string;
  busy?: boolean;
  onYa: () => void;
  onBatal: () => void;
}) {
  if (!open) return null;
  const baris = pesan.split("\n").filter((b) => b.trim() !== "");

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md"
        onClick={() => !busy && onBatal()}
      >
        <div
          className="bg-white dark:bg-[#1e2235] w-full max-w-[320px] rounded-[2.5rem] p-8 border border-gray-200 dark:border-white/10 shadow-2xl relative text-center"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-center -mt-16 mb-6">
            <div className="w-16 h-16 bg-white dark:bg-[#1e2235] border-4 border-gray-100 dark:border-[#282d45] rounded-full flex items-center justify-center shadow-xl">
              <div className="w-10 h-10 bg-amber-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-amber-500/40">
                <i className="fas fa-triangle-exclamation text-sm" />
              </div>
            </div>
          </div>
          <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2 tracking-tight">{judul}</h3>
          <div className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed px-2 mb-8 space-y-2">
            {baris.map((b, i) => (
              <p key={i}>{b}</p>
            ))}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onBatal}
              disabled={busy}
              className="flex-1 py-3.5 bg-gray-200 dark:bg-[#282d45] hover:bg-gray-300 dark:hover:bg-[#323858] text-gray-600 dark:text-gray-400 rounded-2xl text-[10px] font-bold transition-all uppercase tracking-widest disabled:opacity-60"
            >
              Ubah Tanggal
            </button>
            <button
              onClick={onYa}
              disabled={busy}
              className="flex-1 py-3.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-70 text-white rounded-2xl text-[10px] font-bold transition-all uppercase tracking-widest shadow-lg shadow-amber-500/20"
            >
              {busy ? <i className="fas fa-spinner fa-spin" /> : labelYa}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
