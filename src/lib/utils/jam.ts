/**
 * Utilitas jam untuk logic absensi (jam masuk/telat/pulang, lock sistem).
 * Awalnya nempel sebagai fungsi lokal di scan-absen/proses/route.ts, dipindah
 * ke sini biar bisa di-unit-test terpisah dari database/HTTP.
 */

/** Waktu sekarang di Asia/Jakarta (WIB, UTC+7), tanpa lib eksternal. */
export function nowJakarta(): Date {
  return new Date(Date.now() + 7 * 60 * 60 * 1000);
}

/** Format HH:MM:SS dari Date yang sudah di-geser ke WIB (lihat nowJakarta). */
export function hms(d: Date): string {
  return d.toISOString().slice(11, 19);
}

/** Format "HH.MM" (pakai titik) dari Date yang sudah di-geser ke WIB. */
export function jamTitikFormat(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, "0")}.${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/**
 * Tambah/kurang menit dari string HH:MM:SS, hasil HH:MM:SS.
 * Menit negatif berarti mundur. Hasil selalu dibungkus (wrap) dalam rentang
 * 00:00:00–23:59:59 satu hari — TIDAK menghitung lompat ke hari
 * sebelumnya/berikutnya (lihat catatan di bawah).
 */
export function addMinutes(hms_: string, minutes: number): string {
  const [h, m, s] = hms_.split(":").map(Number);
  const total = h * 3600 + m * 60 + s + minutes * 60;
  const norm = ((total % 86400) + 86400) % 86400;
  const hh = Math.floor(norm / 3600);
  const mm = Math.floor((norm % 3600) / 60);
  const ss = norm % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}
