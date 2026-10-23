import { formatTglIndo } from "@/lib/utils/tanggal";

/**
 * Aturan siapa yang tampil di tabel rekap (harian, bulanan, history semester).
 *
 * Daftar dasar = baris riwayat_kelas pada tapel itu. TANGGAL PINDAH (riwayat_kelas.nonaktif_pada,
 * migrasi 020/023) = HARI TERAKHIR siswa masih menjadi bagian dari rekap (inklusif). Absensi pada
 * tanggal itu masih dihitung; sesudahnya tidak dihitung dan siswanya tidak ditampilkan lagi, apa pun
 * isi record-nya (record tidak pernah dihapus).
 *
 *  - Ada tanggal pindah:
 *      harian   : tampil kalau tanggal yang dilihat <= tanggal pindah.
 *      bulanan  : tampil kalau hari efektif pertama bulan itu <= tanggal pindah (bulan pindah masih
 *                 tampil, bulan-bulan berikutnya hilang).
 *      history  : tampil hanya kalau punya hari terhitung (sampai tanggal pindah) pada semester itu —
 *                 agregat database sudah memotong record sesudah tanggal pindah (migrasi 022/023), jadi
 *                 semester berikutnya otomatis hilang.
 *  - Tanpa tanggal pindah tapi non-aktif, di tapel AKTIF (data lama sebelum migrasi 020):
 *      tampil hanya kalau punya data absensi pada periode itu.
 *  - Selain itu (siswa aktif, atau tapel lama tanpa tanggal pindah = penuh satu tapel): selalu tampil.
 *
 * Periode: harian = tanggal itu, bulanan = hari efektif pertama bulan itu, history semester =
 * tidak diisi (hanya data terhitung yang menentukan).
 */
export interface SiswaBisaKeluar {
  id: number;
  nonaktif_pada?: string | null;
}

export interface OpsiSaring {
  tapelRekap: string;
  tapelAktif: string | null | undefined;
  nonaktifIds: ReadonlySet<number>;
  adaAbsenIds: ReadonlySet<number>;
  /** YYYY-MM-DD hari pertama periode yang dilihat; kosong = tidak ada (history semester). */
  awalPeriode?: string | null;
}

/** Siswa yang tampil-tidaknya bergantung pada tanggal keluar / data absensi (selain itu selalu tampil). */
export function perluCekData(
  s: SiswaBisaKeluar,
  opsi: Pick<OpsiSaring, "tapelRekap" | "tapelAktif" | "nonaktifIds">
): boolean {
  if (s.nonaktif_pada) return true;
  return !!opsi.tapelAktif && opsi.tapelRekap === opsi.tapelAktif && opsi.nonaktifIds.has(s.id);
}

export function saringSiswaRekap<T extends SiswaBisaKeluar>(daftar: T[], opsi: OpsiSaring): T[] {
  const { adaAbsenIds, awalPeriode } = opsi;
  return daftar.filter((s) => {
    if (!perluCekData(s, opsi)) return true;
    if (s.nonaktif_pada && awalPeriode) return awalPeriode <= s.nonaktif_pada; // batas akhir: record sesudahnya tidak menyelamatkan
    return adaAbsenIds.has(s.id);
  });
}

/** Nama lama (rekap harian); aturannya sama. */
export const saringSiswaHarian = saringSiswaRekap;

/** Apakah `tanggal` SESUDAH tanggal pindah siswa (sudah di luar rekap)? Tanpa tanggal pindah: tidak. */
export function sudahKeluarPada(nonaktifPada: string | null | undefined, tanggal: string): boolean {
  return !!nonaktifPada && tanggal > nonaktifPada;
}

/**
 * Apakah record absensi `tanggal` pada `tapel` masih dihitung menurut batas pindah siswa itu?
 * `batas` = tapel -> tanggal pindah (inklusif); tapel tanpa batas tidak dipotong.
 */
export function dalamBatasPindah(tapel: string | null | undefined, tanggal: string, batas: ReadonlyMap<string, string>): boolean {
  const b = tapel ? batas.get(tapel) : undefined;
  return !b || tanggal <= b;
}

/** Teks lencana di rekap, mis. "Pindah · 12 Okt 2026". Null kalau tidak ada informasi keluar. */
export function labelKeluar(
  alasan: "lulus" | "pindah" | null | undefined,
  nonaktifPada: string | null | undefined
): string | null {
  if (!alasan && !nonaktifPada) return null;
  const a = alasan ? alasan.charAt(0).toUpperCase() + alasan.slice(1) : "Nonaktif";
  return nonaktifPada ? `${a} · ${formatTglIndo(nonaktifPada)}` : a;
}
