/**
 * Helper murni untuk Tahun Pelajaran (tapel) — format "YYYY/YYYY" dengan tahun
 * kedua = tahun pertama + 1 (mis. "2026/2027"). Tahun ajaran dimulai Juli.
 */

export type Semester = "ganjil" | "genap";

export const TAHUN_MULAI_MIN = 2000;
export const TAHUN_MULAI_MAX = 2100;

/** 2026 → "2026/2027". */
export function formatTapel(tahunMulai: number): string {
  return `${tahunMulai}/${tahunMulai + 1}`;
}

/** "2026/2027" → 2026. Mengembalikan null kalau formatnya tidak valid. */
export function tahunMulaiTapel(nama: string): number | null {
  const m = /^(\d{4})\/(\d{4})$/.exec(nama);
  if (!m) return null;
  const awal = Number(m[1]);
  return Number(m[2]) === awal + 1 ? awal : null;
}

export function validTapel(nama: string): boolean {
  return tahunMulaiTapel(nama) !== null;
}

/** Urutan menurun (terbaru dulu). Format YYYY/YYYY, jadi cukup bandingkan string. */
export function urutkanTapelTerbaru(daftar: string[]): string[] {
  return [...new Set(daftar)].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

/** Tapel & semester menurut kalender (Jul–Des = ganjil, Jan–Jun = genap). Dipakai sebagai fallback. */
export function tapelDariTanggal(tanggalYYYYMMDD: string): string {
  const [y, m] = tanggalYYYYMMDD.split("-").map(Number);
  return formatTapel(m >= 7 ? y : y - 1);
}

export function semesterDariTanggal(tanggalYYYYMMDD: string): Semester {
  const m = Number(tanggalYYYYMMDD.split("-")[1]);
  return m >= 7 ? "ganjil" : "genap";
}
