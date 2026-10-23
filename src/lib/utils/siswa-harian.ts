import { formatTglIndo } from "@/lib/utils/tanggal";
import { semesterDariTanggal, tapelDariTanggal } from "@/lib/utils/tapel";

/**
 * Aturan siapa yang tampil di tabel rekap (harian, bulanan, history semester).
 *
 * Daftar dasar = baris riwayat_kelas pada tapel itu. TANGGAL PINDAH (riwayat_kelas.nonaktif_pada,
 * migrasi 020/024) = hari siswa TERAKHIR TAMPIL, tetapi absensi pada tanggal itu SENDIRI tidak
 * dihitung. Yang dihitung hanya tanggal SEBELUM tanggal pindah; dari sehari sesudahnya siswa tidak
 * ditampilkan lagi, apa pun isi record-nya (record tidak pernah dihapus).
 *
 *  - Ada tanggal pindah:
 *      harian   : tampil kalau tanggal yang dilihat <= tanggal pindah (pada tanggal pindah tampil, tidak dihitung).
 *      bulanan  : tampil kalau hari efektif pertama bulan itu <= tanggal pindah (bulan pindah masih
 *                 tampil, bulan-bulan berikutnya hilang).
 *      history  : tampil kalau punya hari terhitung (sebelum tanggal pindah) pada semester itu, ATAU
 *                 tanggal pindahnya jatuh di tapel+semester yang dilihat (tetap tampil dengan angka 0
 *                 dan lencana pindah). Semester berikutnya otomatis hilang.
 *  - Tanpa tanggal pindah tapi non-aktif, di tapel AKTIF (data lama sebelum migrasi 020):
 *      tampil hanya kalau punya data absensi pada periode itu.
 *  - Selain itu (siswa aktif, atau tapel lama tanpa tanggal pindah = penuh satu tapel): selalu tampil.
 *
 * Periode: harian = tanggal itu, bulanan = hari efektif pertama bulan itu, history semester =
 * `semesterRekap` (awalPeriode tidak diisi).
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
  /** Hanya history semester: semester yang dilihat ("ganjil"/"genap"). Menjaga siswa pindah tetap tampil di semester tanggal pindahnya. */
  semesterRekap?: string | null;
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
  const { adaAbsenIds, awalPeriode, semesterRekap, tapelRekap } = opsi;
  return daftar.filter((s) => {
    if (!perluCekData(s, opsi)) return true;
    if (s.nonaktif_pada && awalPeriode) return awalPeriode <= s.nonaktif_pada; // batas akhir: record sesudahnya tidak menyelamatkan
    if (adaAbsenIds.has(s.id)) return true;
    // History semester: siswa pindah tetap tampil (angka 0) di semester yang memuat tanggal pindahnya.
    if (s.nonaktif_pada && semesterRekap) {
      return tapelDariTanggal(s.nonaktif_pada) === tapelRekap && semesterDariTanggal(s.nonaktif_pada) === semesterRekap;
    }
    return false;
  });
}

/** Nama lama (rekap harian); aturannya sama. */
export const saringSiswaHarian = saringSiswaRekap;

/** Apakah `tanggal` sudah TIDAK DIHITUNG untuk siswa ini (pada tanggal pindah atau sesudahnya)? Tanpa tanggal pindah: tidak. */
export function sudahKeluarPada(nonaktifPada: string | null | undefined, tanggal: string): boolean {
  return !!nonaktifPada && tanggal >= nonaktifPada;
}

/**
 * Apakah record absensi `tanggal` pada `tapel` masih dihitung menurut batas pindah siswa itu?
 * `batas` = tapel -> tanggal pindah (eksklusif: hanya tanggal SEBELUMNYA yang dihitung); tapel tanpa batas tidak dipotong.
 */
export function dalamBatasPindah(tapel: string | null | undefined, tanggal: string, batas: ReadonlyMap<string, string>): boolean {
  const b = tapel ? batas.get(tapel) : undefined;
  return !b || tanggal < b;
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
