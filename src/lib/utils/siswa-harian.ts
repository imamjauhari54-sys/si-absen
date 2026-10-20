import { formatTglIndo } from "@/lib/utils/tanggal";

/**
 * Aturan siapa yang tampil di tabel rekap (harian, bulanan, history semester).
 *
 * Daftar dasar = baris riwayat_kelas pada tapel itu. Siswa yang sudah keluar (lulus/pindah) tetap
 * punya baris, sehingga tanpa penyaringan mereka muncul sebagai "alpha"/"kosong" setelah keluar dan
 * jumlahnya tidak cocok dengan halaman Data Siswa.
 *
 *  - Ada tanggal keluar (riwayat_kelas.nonaktif_pada, migrasi 020), di tapel mana pun:
 *      tampil kalau awal periode < tanggal keluar (ia masih dihitung di periode itu), atau
 *      kalau punya data absensi pada periode itu. Selain itu disembunyikan.
 *  - Tanpa tanggal keluar tapi non-aktif, di tapel AKTIF (data lama sebelum migrasi 020):
 *      tampil hanya kalau punya data absensi pada periode itu.
 *  - Selain itu (siswa aktif, atau tapel lama tanpa tanggal keluar = penuh satu tapel): selalu tampil.
 *
 * Periode: harian = tanggal itu, bulanan = hari efektif pertama bulan itu, history semester =
 * tidak diisi (hanya data absensi yang menentukan).
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
    if (adaAbsenIds.has(s.id)) return true;
    return !!s.nonaktif_pada && !!awalPeriode && awalPeriode < s.nonaktif_pada;
  });
}

/** Nama lama (rekap harian); aturannya sama. */
export const saringSiswaHarian = saringSiswaRekap;

/** Apakah pada `tanggal` siswa sudah keluar (tanggal >= tanggal keluar)? Tanpa tanggal keluar: tidak. */
export function sudahKeluarPada(nonaktifPada: string | null | undefined, tanggal: string): boolean {
  return !!nonaktifPada && tanggal >= nonaktifPada;
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
