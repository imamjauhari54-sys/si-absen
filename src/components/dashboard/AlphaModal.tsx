"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Portal from "@/components/ui/Portal";
import NotifModal from "@/components/ui/NotifModal";

export default function AlphaModal({
  belumRecord,
  guruNama,
  guruFoto,
  isLibur,
}: {
  belumRecord: number;
  guruNama: string;
  guruFoto: string | null;
  isLibur: boolean;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [notif, setNotif] = useState<{ type: "ok" | "error"; message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function eksekusi() {
    setLoading(true);
    try {
      const res = await fetch("/api/absen/auto-alpha", { method: "POST" });
      const data = await res.json();
      setConfirmOpen(false);
      if (data.status === "ok") {
        setNotif({ type: "ok", message: data.message });
      } else {
        setNotif({ type: "error", message: data.message || "Gagal memproses." });
      }
    } catch {
      setConfirmOpen(false);
      setNotif({ type: "error", message: "Terjadi kesalahan jaringan." });
    } finally {
      setLoading(false);
    }
  }

  function tutupNotif() {
    const wasSuccess = notif?.type === "ok";
    setNotif(null);
    if (wasSuccess) router.refresh();
  }

  if (belumRecord <= 0 || isLibur) return null;

  return (
    <>
      <div className="reveal mb-6 px-1">
        <div className="bg-gradient-to-r from-red-500 to-rose-600 rounded-2xl p-4 shadow-lg flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4 text-white text-center md:text-left">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-xl backdrop-blur-md border border-white/30">
              <i className="fas fa-magic" />
            </div>
            <div>
              <h4 className="font-bold text-sm sm:text-base">Tutup Absensi Hari Ini?</h4>
              <p className="text-xs text-white/80">
                Terdapat <span className="font-bold text-white">{belumRecord} siswa</span> belum absen. Klik tombol untuk memproses Alpha.
              </p>
            </div>
          </div>
          <button
            onClick={() => setConfirmOpen(true)}
            className="w-full md:w-auto px-6 py-2.5 bg-white text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-extrabold transition-all active:scale-95 flex items-center justify-center gap-2 shadow-xl shadow-red-900/20"
          >
            <i className="fas fa-user-slash" /> PROSES ALPHA SEKARANG
          </button>
        </div>
      </div>

      {confirmOpen && (
        <Portal>
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md">
          <div className="bg-white dark:bg-[#1e2235] w-full max-w-[320px] rounded-[2.5rem] p-8 border border-gray-200 dark:border-white/10 shadow-2xl relative text-center reveal">
            <div className="flex justify-center -mt-16 mb-6">
              <div className="w-16 h-16 bg-white dark:bg-[#1e2235] border-4 border-gray-100 dark:border-[#282d45] rounded-full flex items-center justify-center shadow-xl">
                <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-red-500/40">
                  <i className="fas fa-magic text-sm" />
                </div>
              </div>
            </div>

            <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2 tracking-tight">Tutup Absen?</h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed px-4 mb-6">
              Sesi absen akan diakhiri. Siswa yang belum scan akan otomatis ditandai sebagai{" "}
              <span className="text-red-500 font-bold">Alpha</span>.
            </p>

            <div className="bg-gray-100 dark:bg-black/30 rounded-2xl p-4 flex items-center gap-3 mb-8 border border-gray-200 dark:border-white/5 text-left">
              {guruFoto ? (
                <img src={guruFoto} alt="Profil" className="w-10 h-10 rounded-full object-cover shadow-lg shadow-indigo-600/30 flex-shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-black text-sm shadow-lg shadow-indigo-600/30 flex-shrink-0">
                  {guruNama.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="overflow-hidden">
                <div className="text-xs font-bold text-gray-800 dark:text-white truncate">{guruNama}</div>
                <div className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">
                  Admin &middot; {belumRecord} Belum Absen
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setConfirmOpen(false)}
                className="flex-1 py-3.5 bg-gray-200 dark:bg-[#282d45] hover:bg-gray-300 dark:hover:bg-[#323858] text-gray-600 dark:text-gray-400 rounded-2xl text-[10px] font-bold transition-all uppercase tracking-widest"
              >
                Batal
              </button>
              <button
                onClick={eksekusi}
                disabled={loading}
                className="flex-1 py-3.5 bg-red-600 hover:bg-red-700 disabled:opacity-70 text-white rounded-2xl text-[10px] font-bold transition-all uppercase tracking-widest shadow-lg shadow-red-500/20"
              >
                {loading ? <i className="fas fa-spinner fa-spin" /> : "Ya, Proses"}
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      <NotifModal open={!!notif} status={notif?.type ?? "ok"} message={notif?.message ?? ""} onClose={tutupNotif} />
    </>
  );
}
