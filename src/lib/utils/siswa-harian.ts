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
 * JEDA (migrasi 025, mode "Kembali setelah jeda"): siswa yang keluar lalu kembali di tapel yang sama punya
 * satu atau lebih jeda [dari, sampai) = [tanggal pindah, tanggal kembali). Aturannya SAMA dengan tanggal pindah:
 *  - tidak DIHITUNG pada tanggal dari <= t < sampai (record tidak dihapus; absensinya tidak ikut angka mana pun);
 *  - tidak TAMPIL pada dari < t < sampai; pada tanggal `dari` sendiri tampil (dengan lencana) tetapi tidak dihitung.
 * Aturan hitung yang sama dipakai SQL (hari_dihitung_siswa, rekap_history_siswa) — keduanya harus selalu
 * menghasilkan angka yang sama; lihat test "satu aturan hitung" di siswa-harian.test.ts dan aktifkan_siswa.test.sql.
 *
 * Periode: harian = [tanggal itu], bulanan = semua hari efektif bulan itu (`periode`), history semester =
 * `semesterRekap` (periode tidak diisi). Siswa tampil bila ADA tanggal dalam periode yang tampil untuknya.
 */
/** Satu jeda tertutup: [dari, sampai) — `dari` = tanggal pindah, `sampai` = tanggal kembali (hari pertama dihitung lagi). */
export interface JedaSiswa {
  dari: string;
  sampai: string;
  alasan?: "lulus" | "pindah" | null;
}

export interface SiswaBisaKeluar {
  id: number;
  nonaktif_pada?: string | null;
  jeda?: readonly JedaSiswa[];
}

export interface OpsiSaring {
  tapelRekap: string;
  tapelAktif: string | null | undefined;
  nonaktifIds: ReadonlySet<number>;
  adaAbsenIds: ReadonlySet<number>;
  /** YYYY-MM-DD hari pertama periode yang dilihat; kosong = tidak ada (history semester). Dipakai bila `periode` tidak diisi. */
  awalPeriode?: string | null;
  /** Semua tanggal (hari efektif) periode yang dilihat: harian = [tanggal], bulanan = hari efektif bulan itu. Menggantikan awalPeriode. */
  periode?: readonly string[] | null;
  /** Hanya history semester: semester yang dilihat ("ganjil"/"genap"). Menjaga siswa pindah tetap tampil di semester tanggal pindahnya. */
  semesterRekap?: string | null;
}

/** Siswa yang tampil-tidaknya bergantung pada tanggal keluar / data absensi (selain itu selalu tampil). */
export function perluCekData(
  s: SiswaBisaKeluar,
  opsi: Pick<OpsiSaring, "tapelRekap" | "tapelAktif" | "nonaktifIds">
): boolean {
  if (s.nonaktif_pada) return true;
  if (s.jeda && s.jeda.length > 0) return true;
  return !!opsi.tapelAktif && opsi.tapelRekap === opsi.tapelAktif && opsi.nonaktifIds.has(s.id);
}

export function saringSiswaRekap<T extends SiswaBisaKeluar>(daftar: T[], opsi: OpsiSaring): T[] {
  const { adaAbsenIds, awalPeriode, semesterRekap, tapelRekap } = opsi;
  const periode = opsi.periode ?? (awalPeriode ? [awalPeriode] : null);
  return daftar.filter((s) => {
    if (!perluCekData(s, opsi)) return true;
    // Ada tanggal pindah / jeda dan periode yang dilihat: tampil bila ada tanggal periode yang TAMPIL untuk siswa ini
    // (record sesudah tanggal pindah / di tengah jeda tidak menyelamatkan).
    if (periode && periode.length > 0 && (s.nonaktif_pada || (s.jeda && s.jeda.length > 0))) {
      return periode.some((t) => tampilPada(s.nonaktif_pada, s.jeda, t));
    }
    if (adaAbsenIds.has(s.id)) return true;
    // History semester: siswa pindah/jeda tetap tampil (angka 0) di semester yang memuat tanggal pindah/awal jedanya.
    if (semesterRekap) {
      const titik = [s.nonaktif_pada, ...(s.jeda ?? []).map((j) => j.dari)].filter((t): t is string => !!t);
      return titik.some((t) => tapelDariTanggal(t) === tapelRekap && semesterDariTanggal(t) === semesterRekap);
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

/** Apakah `tanggal` jatuh di dalam salah satu jeda [dari, sampai)? Itu hari yang TIDAK DIHITUNG. */
export function dalamJeda(jeda: readonly JedaSiswa[] | null | undefined, tanggal: string): boolean {
  return !!jeda && jeda.some((j) => tanggal >= j.dari && tanggal < j.sampai);
}

/** Apakah `tanggal` jatuh di antara tanggal pindah dan tanggal kembali (dari < t < sampai)? Itu hari yang TIDAK TAMPIL. */
export function tersembunyiJeda(jeda: readonly JedaSiswa[] | null | undefined, tanggal: string): boolean {
  return !!jeda && jeda.some((j) => tanggal > j.dari && tanggal < j.sampai);
}

/** SATU aturan "tidak dihitung": pada/sesudah tanggal pindah yang masih berlaku, atau di dalam jeda. */
export function tidakDihitungPada(
  nonaktifPada: string | null | undefined,
  jeda: readonly JedaSiswa[] | null | undefined,
  tanggal: string
): boolean {
  return sudahKeluarPada(nonaktifPada, tanggal) || dalamJeda(jeda, tanggal);
}

/** SATU aturan "tampil": sampai tanggal pindah (termasuk), kecuali di tengah jeda. */
export function tampilPada(
  nonaktifPada: string | null | undefined,
  jeda: readonly JedaSiswa[] | null | undefined,
  tanggal: string
): boolean {
  if (nonaktifPada && tanggal > nonaktifPada) return false;
  return !tersembunyiJeda(jeda, tanggal);
}

/** Lencana pada tanggal awal jeda (hari terakhir tampil), mis. "Pindah · 15 Agu 2026"; null di tanggal lain. */
export function labelJedaPada(jeda: readonly JedaSiswa[] | null | undefined, tanggal: string): string | null {
  const j = jeda?.find((x) => x.dari === tanggal);
  return j ? labelKeluar(j.alasan ?? null, j.dari) : null;
}

/** Baris riwayat_status_siswa (mode kembali_setelah_jeda) -> jeda per siswa, urut tanggal. */
export function kelompokkanJeda(
  rows: readonly { siswa_id: number; pindah_pada: string | null; kembali_pada: string | null; alasan?: "lulus" | "pindah" | null }[]
): Map<number, JedaSiswa[]> {
  const peta = new Map<number, JedaSiswa[]>();
  for (const r of rows) {
    if (!r.pindah_pada || !r.kembali_pada) continue; // jeda harus punya kedua ujung
    if (!peta.has(r.siswa_id)) peta.set(r.siswa_id, []);
    peta.get(r.siswa_id)!.push({ dari: r.pindah_pada, sampai: r.kembali_pada, alasan: r.alasan ?? null });
  }
  for (const list of peta.values()) list.sort((a, b) => (a.dari < b.dari ? -1 : 1));
  return peta;
}

/**
 * Apakah record absensi `tanggal` pada `tapel` masih dihitung menurut batas pindah dan jeda siswa itu?
 * `batas` = tapel -> tanggal pindah (eksklusif: hanya tanggal SEBELUMNYA yang dihitung); tapel tanpa batas tidak dipotong.
 * `jeda` = jeda tertutup siswa itu (tanggal absolut, berlaku lintas tapel); tanggal di dalam jeda tidak dihitung.
 */
export function dalamBatasPindah(
  tapel: string | null | undefined,
  tanggal: string,
  batas: ReadonlyMap<string, string>,
  jeda?: readonly JedaSiswa[] | null
): boolean {
  const b = tapel ? batas.get(tapel) : undefined;
  return (!b || tanggal < b) && !dalamJeda(jeda, tanggal);
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
