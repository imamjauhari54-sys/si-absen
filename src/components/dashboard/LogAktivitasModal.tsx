"use client";

import { useState } from "react";
import type { ActivityLog } from "@/types";
import Portal from "@/components/ui/Portal";

export default function LogAktivitasModal() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<ActivityLog[] | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  async function bukaModal() {
    setOpen(true);
    setLoading(true);
    setErrMsg(null);
    try {
      const res = await fetch("/api/logs");
      const data = await res.json();
      if (data.status === "ok") {
        setLogs(data.data);
      } else {
        setErrMsg(data.message || "Gagal memuat data.");
      }
    } catch {
      setErrMsg("Gagal memuat file log aktivitas.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={bukaModal}
        className="ml-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all"
      >
        <i className="fas fa-history text-indigo-500" /> Log Absensi Terbaru
      </button>

      {open && (
        <Portal>
          <div
            className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
            onClick={(e) => e.target === e.currentTarget && setOpen(false)}
          >
          <div className="bg-white dark:bg-[#1e2235] w-full max-w-2xl rounded-[2.5rem] p-8 border border-gray-200 dark:border-white/10 shadow-2xl relative flex flex-col max-h-[85vh] reveal">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                <i className="fas fa-history text-indigo-500" /> Riwayat Perubahan
              </h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-red-500 transition-colors">
                <i className="fas fa-times" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-2">
              {loading && (
                <div className="text-center py-10 opacity-50">
                  <i className="fas fa-spinner fa-spin" />
                </div>
              )}

              {!loading && errMsg && (
                <div className="text-center py-10 text-red-500 text-xs font-bold">ERROR: {errMsg}</div>
              )}

              {!loading && !errMsg && logs?.length === 0 && (
                <div className="text-center py-10 text-gray-400 text-xs uppercase font-bold">
                  Belum ada riwayat aktivitas.
                </div>
              )}

              {!loading &&
                !errMsg &&
                logs?.map((log) => {
                  const inisial = log.nama_admin ? log.nama_admin.charAt(0).toUpperCase() : "?";
                  return (
                    <div
                      key={log.id}
                      className="p-4 rounded-2xl bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/5 flex gap-4 items-start shadow-sm mb-3"
                    >
                      <div className="flex-shrink-0">
                        {log.foto_admin ? (
                          <img
                            src={log.foto_admin}
                            className="w-8 h-8 rounded-full object-cover border border-gray-200 dark:border-white/10"
                            alt={log.nama_admin}
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[10px] font-black">
                            {inisial}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start">
                          <span className="text-[11px] font-bold text-gray-800 dark:text-white">{log.nama_admin}</span>
                          <span className="text-[9px] text-gray-400 font-bold uppercase">{log.created_at}</span>
                        </div>
                        <p className="text-[11px] text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">
                          Mengubah{" "}
                          <span className="font-extrabold text-gray-800 dark:text-white">{log.nama_siswa}</span>,{" "}
                          <span className="font-bold text-indigo-500 uppercase">Kelas {log.kelas_siswa || "-"}</span>{" "}
                          dari{" "}
                          <span className="font-black text-red-500 dark:text-red-400 uppercase">{log.status_lama}</span>{" "}
                          ke{" "}
                          <span className="font-black text-emerald-500 dark:text-emerald-400 uppercase">
                            {log.status_baru}
                          </span>
                        </p>
                        {log.keterangan && (
                          <p className="mt-1.5 text-[10px] italic text-gray-500 dark:text-gray-400 bg-white/50 dark:bg-white/5 p-1 px-2 rounded-lg border border-gray-100 dark:border-white/5">
                            &ldquo;{log.keterangan}&rdquo;
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
          </div>
        </Portal>
      )}
    </>
  );
}
