import { tanggalValid } from "@/lib/utils/absen-edit";
import { addDaysJakarta, formatTglIndo } from "@/lib/utils/tanggal";

/** Jenis log yang bisa dibersihkan: log_aktivitas (jejak audit admin) dan wa_log (percobaan kirim WA). */
export type JenisLog = "aktivitas" | "wa";

export function jenisLogValid(s: string): s is JenisLog {
  return s === "aktivitas" || s === "wa";
}

/** Log aktivitas adalah jejak audit: hanya yang berumur LEBIH dari sekian hari yang boleh dihapus. */
export const MIN_UMUR_LOG_AKTIVITAS_HARI = 90;

/** Tanggal paling akhir (inklusif) yang boleh dihapus. Aktivitas: hari ini − 90; WA: hari ini. */
export function batasAkhirHapus(jenis: JenisLog, hariIni: string): string {
  return jenis === "aktivitas" ? addDaysJakarta(hariIni, -MIN_UMUR_LOG_AKTIVITAS_HARI) : hariIni;
}

export type HasilRentangLog = { ok: true; dari: string; sampai: string } | { ok: false; message: string };

export function validasiRentangHapusLog(
  jenis: JenisLog,
  dari: unknown,
  sampai: unknown,
  hariIni: string
): HasilRentangLog {
  const d = typeof dari === "string" ? dari.trim() : "";
  const s = typeof sampai === "string" ? sampai.trim() : "";
  if (!tanggalValid(d) || !tanggalValid(s)) {
    return { ok: false, message: "Isi tanggal \"Dari\" dan \"Sampai\" dengan benar." };
  }
  if (d > s) return { ok: false, message: "Tanggal \"Dari\" tidak boleh sesudah tanggal \"Sampai\"." };
  const batas = batasAkhirHapus(jenis, hariIni);
  if (s > batas) {
    return {
      ok: false,
      message:
        jenis === "aktivitas"
          ? `Log aktivitas hanya bisa dihapus jika sudah lebih dari ${MIN_UMUR_LOG_AKTIVITAS_HARI} hari. Tanggal "Sampai" paling akhir: ${formatTglIndo(batas)}.`
          : `Tanggal "Sampai" tidak boleh di masa depan (paling akhir ${formatTglIndo(batas)}).`,
    };
  }
  return { ok: true, dari: d, sampai: s };
}

/**
 * Rentang tanggal WIB (inklusif) → batas waktu untuk kolom timestamptz:
 * created_at >= mulai DAN created_at < sebelum.
 */
export function rentangWaktuWib(dari: string, sampai: string): { mulai: string; sebelum: string } {
  return {
    mulai: `${dari}T00:00:00+07:00`,
    sebelum: `${addDaysJakarta(sampai, 1)}T00:00:00+07:00`,
  };
}

/** Sel CSV: kutip bila perlu, dan netralkan awalan rumus (= + - @) supaya aman dibuka di Excel. */
export function sel(nilai: unknown): string {
  let v = nilai === null || nilai === undefined ? "" : String(nilai);
  if (/^[=+\-@]/.test(v)) v = `'${v}`;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function barisCsv(kolom: unknown[]): string {
  return kolom.map(sel).join(",") + "\r\n";
}
