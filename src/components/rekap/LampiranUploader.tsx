"use client";

import { useRef, useState } from "react";

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

interface Props {
  /** URL lampiran yang sudah ada sebelumnya (dari data lama), kalau ada. */
  existingUrl: string | null;
  /**
   * Dipanggil setiap kali nilai berubah:
   * - url Cloudinary baru setelah upload sukses
   * - "" kalau lampiran (baru atau lama) dihapus/dibatalkan
   * - null kalau tidak ada perubahan sama sekali dari lampiran lama
   */
  onChange: (value: string | null) => void;
  folder?: string;
}

export default function LampiranUploader({ existingUrl, onChange, folder = "si-absen/lampiran" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<{ type: "wait" | "ok" | "err"; msg: string } | null>(null);
  const [existingHidden, setExistingHidden] = useState(false);

  function reset() {
    setPreview(null);
    setFileName("");
    setFileSize("");
    setStatus(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function uploadFile(file: File) {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      setStatus({ type: "err", msg: "Hanya file JPG/PNG/WebP yang diizinkan." });
      reset();
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setStatus({ type: "err", msg: "Ukuran file maksimal 5MB." });
      reset();
      return;
    }
    if (!CLOUD_NAME || !UPLOAD_PRESET) {
      setStatus({ type: "err", msg: "Cloudinary belum dikonfigurasi." });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);
    setFileName(file.name);
    setFileSize((file.size / 1024).toFixed(1) + " KB");
    setExistingHidden(true);

    setStatus({ type: "wait", msg: "Mengupload foto..." });
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("upload_preset", UPLOAD_PRESET);
      fd.append("folder", folder);
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body: fd });
      const data = await res.json();
      if (data.secure_url) {
        setStatus({ type: "ok", msg: "Foto berhasil diupload ✓" });
        onChange(data.secure_url);
      } else {
        setStatus({ type: "err", msg: "Gagal upload: " + (data.error?.message || "Unknown error") });
        reset();
      }
    } catch {
      setStatus({ type: "err", msg: "Gagal koneksi ke Cloudinary." });
      reset();
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }

  function hapusExisting() {
    setExistingHidden(true);
    onChange(""); // sentinel dikirim sebagai "__HAPUS__" oleh pemanggil (lihat HarianTable)
  }

  const tampilkanExisting = existingUrl && !existingHidden && !preview;

  return (
    <div>
      <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
        <i className="fas fa-camera text-indigo-400 mr-1" /> Foto Surat / Lampiran{" "}
        <span className="normal-case font-normal text-gray-400">(JPG/PNG, Opsional)</span>
      </label>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl px-4 py-6 text-center cursor-pointer transition ${
          dragOver
            ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20"
            : "border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700"
        }`}
      >
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/jpg,image/webp" onChange={handleFileInput} className="hidden" />

        {preview ? (
          <div className="pointer-events-none py-1">
            <img src={preview} alt="preview" className="w-24 h-24 object-cover rounded-xl mx-auto mb-2 border-2 border-indigo-200 dark:border-indigo-700 shadow" />
            <p className="text-xs font-bold text-gray-700 dark:text-gray-200 truncate max-w-[220px] mx-auto text-center">{fileName}</p>
            <p className="text-[10px] text-gray-400 mt-0.5 text-center">{fileSize}</p>
          </div>
        ) : (
          <div className="pointer-events-none py-2">
            <i className="fas fa-camera text-2xl text-gray-300 dark:text-gray-600 mb-2 block" />
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Klik atau seret foto ke sini</p>
            <p className="text-[10px] text-gray-400 mt-1">JPG / PNG / WebP &middot; Maks 5MB</p>
          </div>
        )}
      </div>

      {status && (
        <div className="mt-2 flex items-center gap-2">
          <i
            className={`fas text-xs ${
              status.type === "wait" ? "fa-spinner fa-spin text-gray-400" : status.type === "ok" ? "fa-check-circle text-emerald-500" : "fa-times-circle text-red-500"
            }`}
          />
          <span
            className={`text-[11px] font-semibold ${
              status.type === "wait" ? "text-gray-500" : status.type === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"
            }`}
          >
            {status.msg}
          </span>
        </div>
      )}

      {tampilkanExisting && (
        <div className="mt-2 flex items-center gap-2 p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-100 dark:border-indigo-800">
          <i className="fas fa-image text-indigo-400 text-sm flex-shrink-0" />
          <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium flex-1 truncate">Lampiran sebelumnya tersimpan</span>
          <a href={existingUrl} target="_blank" rel="noreferrer" className="text-[10px] font-bold text-indigo-600 hover:underline flex-shrink-0">
            Lihat
          </a>
          <button type="button" onClick={hapusExisting} className="text-[10px] text-red-400 hover:text-red-600 font-bold flex-shrink-0">
            Hapus
          </button>
        </div>
      )}
    </div>
  );
}
