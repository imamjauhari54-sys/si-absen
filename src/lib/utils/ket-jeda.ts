import { addDaysJakarta, formatTglIndo } from "@/lib/utils/tanggal";
import { dalamJeda, sudahKeluarPada, type JedaSiswa } from "@/lib/utils/siswa-harian";

/**
 * Penjelasan untuk manusia mengapa sebuah hari bertanda "×" (tidak dihitung). Tanpa ini admin/orang tua bisa mengira
 * data absensinya hilang. Selalu menegaskan dua hal: harinya TIDAK dihitung (bukan alpha), dan datanya tetap tersimpan.
 */

/** Ujung jeda yang ditampilkan = hari TERAKHIR jeda (sehari sebelum tanggal kembali). */
function akhirJeda(j: JedaSiswa): string {
  return addDaysJakarta(j.sampai, -1);
}

function rentang(j: JedaSiswa): string {
  const akhir = akhirJeda(j);
  return akhir === j.dari ? formatTglIndo(j.dari) : `${formatTglIndo(j.dari)} – ${formatTglIndo(akhir)}`;
}

/** Tooltip untuk sel "×" pada `tanggal`; null kalau hari itu memang dihitung. */
export function ketTidakDihitung(
  nonaktifPada: string | null | undefined,
  alasan: "lulus" | "pindah" | null | undefined,
  jeda: readonly JedaSiswa[] | null | undefined,
  tanggal: string
): string | null {
  const j = jeda?.find((x) => dalamJeda([x], tanggal));
  if (j) return `Tidak dihitung — jeda ${rentang(j)} (siswa tidak terdaftar). Bukan alpha; data absensi tetap tersimpan.`;
  if (sudahKeluarPada(nonaktifPada, tanggal)) {
    const kata = alasan === "lulus" ? "lulus" : "pindah";
    return `Tidak dihitung — sudah ${kata} sejak ${formatTglIndo(nonaktifPada!)}. Bukan alpha; data absensi tetap tersimpan.`;
  }
  return null;
}

/** Jeda yang beririsan dengan bulan "YYYY-MM", diurutkan. */
export function jedaDiBulan(jeda: readonly JedaSiswa[] | null | undefined, bulanYYYYMM: string): JedaSiswa[] {
  if (!jeda) return [];
  const awal = `${bulanYYYYMM}-01`;
  const [y, m] = bulanYYYYMM.split("-").map(Number);
  const akhir = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return jeda.filter((j) => j.dari <= akhir && akhirJeda(j) >= awal).sort((a, b) => (a.dari < b.dari ? -1 : 1));
}

/** Lencana di samping nama pada Rekap Bulanan, mis. "Jeda 15 Agu 2026 – 9 Sep 2026"; null kalau tidak ada jeda di bulan itu. */
export function labelJedaBulan(jeda: readonly JedaSiswa[] | null | undefined, bulanYYYYMM: string): string | null {
  const daftar = jedaDiBulan(jeda, bulanYYYYMM);
  return daftar.length ? `Jeda ${daftar.map(rentang).join("; ")}` : null;
}

/** Catatan untuk siswa/orang tua di Portal (bahasa sederhana). Kosong bila tidak ada jeda di bulan itu. */
export function catatanJedaPortal(jeda: readonly JedaSiswa[] | null | undefined, bulanYYYYMM: string): string[] {
  return jedaDiBulan(jeda, bulanYYYYMM).map(
    (j) => `Pada ${rentang(j)} siswa tidak terdaftar (jeda). Hari bertanda × tidak dihitung sebagai ketidakhadiran, dan tidak mengurangi persentase kehadiran.`
  );
}
