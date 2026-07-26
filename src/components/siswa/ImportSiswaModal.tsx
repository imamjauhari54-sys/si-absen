"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Portal from "@/components/ui/Portal";

const TEMPLATE_CSV =
  "nama,kelas,nisn,jenis_kelamin,no_hp_ortu\n" +
  "Contoh Nama Siswa,5,0091234501,L,08123456789\n" +
  "Contoh Siswa Dua,5A,,P,\n";

function unduhTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "template_import_siswa.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function ImportSiswaModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [hasil, setHasil] = useState<{ status: "ok" | "error"; message: string; errors: string[] } | null>(null);

  async function proses() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    setHasil(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/siswa/import", { method: "POST", body: fd });
      const data = await res.json();
      setHasil({ status: data.status, message: data.message, errors: data.errors || [] });
      if (data.status === "ok") router.refresh();
    } catch {
      setHasil({ status: "error", message: "Terjadi kesalahan jaringan.", errors: [] });
    } finally {
      setUploading(false);
    }
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div className="bg-white dark:bg-[#1e2535] rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700/60 w-full max-w-md overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/50 flex justify-between items-center bg-gray-50 dark:bg-gray-800/30">
            <span className="text-xs font-extrabold text-gray-500 dark:text-gray-400 uppercase tracking-widest flex items-center gap-2">
              <i className="fas fa-file-import text-blue-500" /> Import Siswa dari CSV
            </span>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center bg-gray-200 hover:bg-red-100 dark:bg-gray-700 dark:hover:bg-red-900/40 text-gray-500 hover:text-red-500 transition"
            >
              <i className="fas fa-times text-xs" />
            </button>
          </div>

          <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
            <button
              type="button"
              onClick={unduhTemplate}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-xl text-xs font-bold transition"
            >
              <i className="fas fa-download" /> Unduh Template CSV
            </button>

            <div>
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
                File CSV
              </label>
              <label className="flex items-center gap-3 px-3 py-3 bg-gray-50 dark:bg-gray-800/50 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl cursor-pointer hover:border-blue-400 transition">
                <i className="fas fa-file-csv text-lg text-gray-400" />
                <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {fileName || "Klik untuk pilih file .csv"}
                </span>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => setFileName(e.target.files?.[0]?.name || "")}
                />
              </label>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
                Kolom wajib: <strong>nama</strong>, <strong>kelas</strong>. Kolom opsional: nisn, jenis_kelamin (L/P),
                no_hp_ortu. Maks. 500 baris per file.
              </p>
            </div>

            {hasil && (
              <div
                className={`rounded-xl p-3 text-xs font-semibold border ${
                  hasil.status === "ok"
                    ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-100 dark:border-emerald-900/40"
                    : "bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-300 border-rose-100 dark:border-rose-900/40"
                }`}
              >
                <div className="flex items-start gap-2">
                  <i className={`fas ${hasil.status === "ok" ? "fa-circle-check" : "fa-circle-exclamation"} mt-0.5`} />
                  <span>{hasil.message}</span>
                </div>
                {hasil.errors.length > 0 && (
                  <ul className="mt-2 pl-5 list-disc space-y-0.5 max-h-32 overflow-y-auto font-normal opacity-90">
                    {hasil.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-700/50 flex gap-3 bg-gray-50 dark:bg-gray-800/30">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl text-sm font-bold transition"
            >
              {hasil?.status === "ok" ? "Tutup" : "Batal"}
            </button>
            <button
              onClick={proses}
              disabled={uploading || !fileName}
              className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl text-sm font-bold shadow-sm transition flex items-center justify-center gap-2 active:scale-95"
            >
              {uploading ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-upload" />}
              {uploading ? "Memproses..." : "Import Sekarang"}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
