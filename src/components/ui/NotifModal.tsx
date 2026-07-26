"use client";

import { useEffect } from "react";
import Portal from "./Portal";

/**
 * Modal notifikasi standar (sukses/gagal) yang dipakai di seluruh aplikasi.
 * Bentuk/markup TIDAK diubah dari desain aslinya — hanya disatukan jadi satu
 * komponen supaya konsisten, ditambah auto-close 1.5 detik saat status "ok".
 */
export default function NotifModal({
  open,
  status,
  message,
  onClose,
  autoCloseMs = 1500,
}: {
  open: boolean;
  status: "ok" | "error";
  message: string;
  onClose: () => void;
  /** Durasi auto-close (ms) saat status "ok". Set null untuk menonaktifkan auto-close. */
  autoCloseMs?: number | null;
}) {
  useEffect(() => {
    if (!open || status !== "ok" || autoCloseMs == null) return;
    const timer = setTimeout(onClose, autoCloseMs);
    return () => clearTimeout(timer);
  }, [open, status, autoCloseMs, onClose]);

  if (!open) return null;

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[999] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md"
        onClick={onClose}
      >
        <div
          className="bg-white dark:bg-[#1e2235] w-full max-w-[320px] rounded-[2.5rem] p-8 border border-gray-200 dark:border-white/10 shadow-2xl relative text-center"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-center -mt-16 mb-6">
            <div className="w-16 h-16 bg-white dark:bg-[#1e2235] border-4 border-gray-100 dark:border-[#282d45] rounded-full flex items-center justify-center shadow-xl">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-white shadow-lg ${
                  status === "ok" ? "bg-emerald-500 shadow-emerald-500/40" : "bg-red-500 shadow-red-500/40"
                }`}
              >
                <i className={`fas ${status === "ok" ? "fa-check" : "fa-exclamation"} text-lg`} />
              </div>
            </div>
          </div>
          <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2 tracking-tight">
            {status === "ok" ? "Berhasil!" : "Gagal!"}
          </h3>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed px-2 mb-8">{message}</p>
          <button
            onClick={onClose}
            className={`w-full py-3.5 text-white rounded-2xl text-[10px] font-bold transition-all uppercase tracking-widest shadow-lg ${
              status === "ok"
                ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20"
                : "bg-red-600 hover:bg-red-700 shadow-red-500/20"
            }`}
          >
            Oke, Mengerti
          </button>
        </div>
      </div>
    </Portal>
  );
}
