"use client";

import { useEffect, useState } from "react";
import { logoutAction } from "@/lib/auth/actions";
import Portal from "@/components/ui/Portal";

export default function LogoutModal({
  nama,
  role,
  foto,
}: {
  nama: string;
  role: string;
  foto: string | null;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handler(e: Event) {
      e.preventDefault();
      setOpen(true);
    }
    const btn = document.getElementById("btn-buka-modal-keluar");
    btn?.addEventListener("click", handler);
    return () => btn?.removeEventListener("click", handler);
  }, []);

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, []);

  if (!open) return null;

  return (
    <Portal>
    <div
      className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-md flex items-center justify-center p-6"
      onClick={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <div className="bg-white dark:bg-[#1e2235] w-full max-w-[320px] rounded-[2.5rem] p-8 border border-gray-200 dark:border-white/10 shadow-2xl relative text-center">
        <div className="flex justify-center -mt-16 mb-6">
          <div className="w-16 h-16 bg-white dark:bg-[#1e2235] border-4 border-gray-100 dark:border-[#282d45] rounded-full flex items-center justify-center shadow-xl">
            <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-red-500/40">
              <i className="fas fa-right-from-bracket text-sm" />
            </div>
          </div>
        </div>

        <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2 tracking-tight">
          Keluar dari Sistem?
        </h3>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed px-4 mb-6">
          Sesi Anda akan diakhiri. Pastikan semua pekerjaan sudah tersimpan.
        </p>

        <div className="bg-gray-100 dark:bg-black/30 rounded-2xl p-4 flex items-center gap-3 mb-8 border border-gray-200 dark:border-white/5 text-left">
          {foto ? (
            <img
              src={foto}
              alt="Profil"
              className="w-10 h-10 rounded-full object-cover shadow-lg shadow-indigo-600/30 flex-shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-black text-sm shadow-lg shadow-indigo-600/30 flex-shrink-0">
              {nama.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="overflow-hidden">
            <div className="text-xs font-bold text-gray-800 dark:text-white truncate">{nama}</div>
            <div className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">
              {role} • Akan Logout
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex-1 py-3.5 bg-gray-200 dark:bg-[#282d45] hover:bg-gray-300 dark:hover:bg-[#323858] text-gray-600 dark:text-gray-400 rounded-2xl text-[10px] font-bold transition-all uppercase tracking-widest"
          >
            Batal
          </button>
          <form action={logoutAction} className="flex-1">
            <button
              type="submit"
              className="w-full py-3.5 bg-red-600 hover:bg-red-700 text-white rounded-2xl text-[10px] font-bold transition-all uppercase tracking-widest shadow-lg shadow-red-500/20"
            >
              Ya, Keluar
            </button>
          </form>
        </div>
      </div>
    </div>
    </Portal>
  );
}
