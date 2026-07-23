"use client";

import { useRef, useState } from "react";

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

export default function FotoUploader({
  value,
  onChange,
  folder = "si-absen/siswa",
  label = "Foto Siswa",
}: {
  value: string;
  onChange: (url: string) => void;
  folder?: string;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // biar bisa pilih file yang sama lagi kalau mau ulang
    if (!file) return;

    if (!CLOUD_NAME || !UPLOAD_PRESET) {
      setError("Cloudinary belum dikonfigurasi (NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME / UPLOAD_PRESET di .env.local).");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("File harus berupa gambar.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Ukuran gambar maksimal 5MB.");
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("upload_preset", UPLOAD_PRESET);
      fd.append("folder", folder);

      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || "Upload ke Cloudinary gagal.");

      onChange(data.secure_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload gagal.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
        {label} <span className="normal-case font-normal">(opsional)</span>
      </label>

      <div className="flex items-center gap-3">
        <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center flex-shrink-0">
          {uploading ? (
            <i className="fas fa-spinner fa-spin text-gray-400" />
          ) : value ? (
            <img src={value} alt={label} className="w-full h-full object-cover" />
          ) : (
            <i className="fas fa-user text-gray-300 dark:text-gray-600 text-xl" />
          )}
        </div>

        <div className="flex-1">
          <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg text-xs font-bold transition disabled:opacity-60 flex items-center gap-2"
          >
            <i className="fas fa-upload" />
            {uploading ? "Mengunggah..." : value ? "Ganti Foto" : "Upload Foto"}
          </button>
          {value && !uploading && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="ml-2 px-3 py-2 text-red-500 hover:text-red-600 text-xs font-bold transition"
            >
              Hapus
            </button>
          )}
        </div>
      </div>

      {error && <p className="mt-1.5 text-[11px] text-rose-500 font-semibold">{error}</p>}
    </div>
  );
}
