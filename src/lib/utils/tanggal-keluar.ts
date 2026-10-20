import { tanggalValid } from "@/lib/utils/absen-edit";

export type HasilTanggalKeluar = { ok: true; value: string | null } | { ok: false; message: string };

/**
 * Validasi tanggal keluar siswa dari form Nonaktifkan.
 * Kosong = pakai default (hari ini, diisi database). Harus tanggal kalender yang benar dan tidak
 * boleh di masa depan (rekap harian/bulanan tidak punya makna untuk keluar yang belum terjadi).
 */
export function parseTanggalKeluar(raw: unknown, hariIni: string): HasilTanggalKeluar {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return { ok: true, value: null };
  if (!tanggalValid(s)) return { ok: false, message: "Tanggal keluar tidak valid." };
  if (s > hariIni) return { ok: false, message: "Tanggal keluar tidak boleh di masa depan." };
  return { ok: true, value: s };
}
