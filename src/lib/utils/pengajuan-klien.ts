/**
 * Pemanggil API portal dari browser (tanpa React; fetch bisa disuntik agar mudah dites).
 * Semua jawaban dinormalkan menjadi { ok, status, pesan, kode, data } sehingga komponen tidak perlu menangani
 * jaringan putus, respons bukan JSON, atau bentuk galat yang berbeda-beda.
 */
import { FOLDER_LAMPIRAN_PENGAJUAN } from "./pengajuan";

type FetchFn = typeof fetch;

export interface JawabanApi {
  ok: boolean;
  status: number;
  pesan: string;
  kode?: string;
  /** Isi JSON mentah (untuk field tambahan seperti sisa_percobaan). */
  data: Record<string, unknown>;
}

const PESAN_JARINGAN = "Tidak dapat terhubung ke server. Periksa koneksi internet lalu coba lagi.";

export async function kirimJson(url: string, body: unknown, fetchFn: FetchFn = fetch): Promise<JawabanApi> {
  let res: Response;
  try {
    res = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch {
    return { ok: false, status: 0, pesan: PESAN_JARINGAN, kode: "JARINGAN", data: {} };
  }
  let data: Record<string, unknown> = {};
  try {
    const j: unknown = await res.json();
    if (j && typeof j === "object" && !Array.isArray(j)) data = j as Record<string, unknown>;
  } catch {
    /* bukan JSON: ditangani di bawah */
  }
  const sukses = res.ok && data.status === "ok";
  if (sukses) return { ok: true, status: res.status, pesan: typeof data.message === "string" ? data.message : "", data };
  if (res.status === 401) {
    return { ok: false, status: 401, kode: "SESI", pesan: "Sesi berakhir. Muat ulang halaman lalu masuk kembali dengan NISN.", data };
  }
  return {
    ok: false,
    status: res.status,
    pesan: typeof data.message === "string" && data.message ? data.message : "Terjadi kesalahan. Silakan coba lagi.",
    ...(typeof data.kode === "string" ? { kode: data.kode } : {}),
    data,
  };
}

export type HasilUnggah = { ok: true; url: string } | { ok: false; pesan: string; kode?: string };

/**
 * Unggah lampiran: (1) minta tanda tangan ke server (PIN diperiksa), (2) kirim langsung ke Cloudinary dengan
 * tanda tangan itu. Berkas TIDAK melewati server aplikasi.
 */
export async function unggahLampiran(file: File | Blob, pin: string, fetchFn: FetchFn = fetch): Promise<HasilUnggah> {
  const sig = await kirimJson("/portal-siswa/api/lampiran/signature", { pin }, fetchFn);
  if (!sig.ok) return { ok: false, pesan: sig.pesan, kode: sig.kode };
  const d = sig.data;
  if (
    typeof d.signature !== "string" || typeof d.timestamp !== "number" || typeof d.apiKey !== "string" ||
    typeof d.cloudName !== "string" || d.folder !== FOLDER_LAMPIRAN_PENGAJUAN || typeof d.allowedFormats !== "string"
  ) {
    return { ok: false, pesan: "Gagal menyiapkan unggahan. Silakan coba lagi." };
  }
  const fd = new FormData();
  fd.append("file", file);
  fd.append("api_key", d.apiKey);
  fd.append("timestamp", String(d.timestamp));
  fd.append("signature", d.signature);
  fd.append("folder", d.folder);
  fd.append("allowed_formats", d.allowedFormats);
  let res: Response;
  try {
    res = await fetchFn(`https://api.cloudinary.com/v1_1/${encodeURIComponent(d.cloudName)}/image/upload`, { method: "POST", body: fd });
  } catch {
    return { ok: false, pesan: "Gagal mengunggah foto. Periksa koneksi internet lalu coba lagi." };
  }
  let j: { secure_url?: unknown; error?: { message?: unknown } } = {};
  try {
    j = await res.json();
  } catch {
    /* abaikan */
  }
  if (typeof j.secure_url === "string") return { ok: true, url: j.secure_url };
  const alasan = typeof j.error?.message === "string" ? ` (${j.error.message})` : "";
  return { ok: false, pesan: `Gagal mengunggah foto${alasan}.` };
}

export const URL_API = {
  pengajuan: "/portal-siswa/api/pengajuan",
  batal: (id: number) => `/portal-siswa/api/pengajuan/${id}/batal`,
  pin: "/portal-siswa/api/pin",
} as const;
