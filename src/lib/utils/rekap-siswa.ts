import type { StatusAbsen } from "@/types";
import { tahunMulaiTapel, tapelDariTanggal, type Semester } from "@/lib/utils/tapel";
import { tidakDihitungPada, type JedaSiswa } from "@/lib/utils/siswa-harian";

/**
 * SATU fungsi hitung status hari per siswa. Dipakai oleh: kartu Rekap Bulanan (portal & admin), kartu ringkasan
 * di atas (hadir/terlambat/izin/sakit/alpha + persentase), dan grafik tren. Sebelumnya kartu atas menghitung dari
 * baris absensi saja, sedangkan Rekap Bulanan menambahkan Alpha bawaan untuk hari lampau tanpa catatan, sehingga
 * dua angka di halaman yang sama bisa berbeda. Kini keduanya memakai fungsi ini.
 *
 * Urutan aturan untuk satu tanggal (TIDAK BOLEH diubah tanpa mengubah semua pemakai sekaligus):
 *   1. hari libur                                  -> "libur"     (tidak dihitung)
 *   2. pada/sesudah tanggal pindah, atau di jeda    -> "nonaktif"  (tidak dihitung; data tetap tersimpan)
 *   3. sebelum catatan pertama siswa di tapel itu   -> "kosong"    (siswa belum tercatat; tidak dihitung)
 *   4. ada catatan absensi                         -> statusnya
 *   5. hari lampau tanpa catatan                   -> "alpha"     (bawaan, sama seperti Rekap Bulanan)
 *   6. hari ini / mendatang tanpa catatan          -> "kosong"
 * "Hari" = tanggal bukan Minggu (daftarTanggalRentang), sama dengan kolom Rekap Bulanan.
 */

export type StatusHariSiswa = StatusAbsen | "libur" | "kosong" | "nonaktif";

export interface KonteksSiswa {
  /** Tanggal hari ini (WIB, YYYY-MM-DD). Hari >= today tanpa catatan = "kosong", bukan Alpha. */
  today: string;
  /** Hari libur (Set tanggal atau Map tanggal->keterangan). */
  libur: { has(tanggal: string): boolean };
  /** Catatan absensi siswa: tanggal -> status. */
  absensi: ReadonlyMap<string, string>;
  /** Tanggal pindah tunggal (dipakai Rekap Bulanan admin, per tapel baris riwayat). */
  nonaktifPada?: string | null;
  /** Tanggal pindah per tapel (dipakai portal/riwayat satu siswa lintas tapel): tapel -> tanggal. */
  batasPindah?: ReadonlyMap<string, string>;
  jeda?: readonly JedaSiswa[];
  /**
   * Tanggal catatan pertama siswa pada tapel itu. undefined = tanpa batas bawah (perilaku lama, Rekap Bulanan admin);
   * null = siswa belum punya catatan sama sekali di tapel itu -> semua hari "kosong".
   */
  mulai?: string | null;
}

function nonaktifUntuk(tgl: string, k: KonteksSiswa): string | null | undefined {
  return k.batasPindah ? k.batasPindah.get(tapelDariTanggal(tgl)) : k.nonaktifPada;
}

/** Status satu hari menurut aturan bersama (lihat urutan di atas). */
export function statusHariSiswa(tgl: string, k: KonteksSiswa): StatusHariSiswa {
  if (k.libur.has(tgl)) return "libur";
  if (tidakDihitungPada(nonaktifUntuk(tgl, k), k.jeda, tgl)) return "nonaktif";
  if (k.mulai === null || (k.mulai !== undefined && tgl < k.mulai)) return "kosong";
  const rec = k.absensi.get(tgl);
  if (rec) return rec as StatusAbsen;
  return tgl < k.today ? "alpha" : "kosong";
}

export interface RekapSiswa {
  d: Record<string, StatusHariSiswa>;
  hadir: number;
  terlambat: number;
  izin: number;
  sakit: number;
  alpha: number;
  /** Jumlah hari yang dihitung = hadir + terlambat + izin + sakit + alpha (penyebut persentase). */
  hariDihitung: number;
}

/** Status tiap tanggal + jumlah per status untuk daftar tanggal tertentu. */
export function hitungRekapSiswa(tglList: readonly string[], k: KonteksSiswa): RekapSiswa {
  const r: RekapSiswa = { d: {}, hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpha: 0, hariDihitung: 0 };
  for (const tgl of tglList) {
    const st = statusHariSiswa(tgl, k);
    r.d[tgl] = st;
    if (st === "hadir" || st === "terlambat" || st === "izin" || st === "sakit" || st === "alpha") {
      r[st]++;
      r.hariDihitung++;
    }
  }
  return r;
}

/** Persentase kehadiran (hadir + terlambat) dari hari yang dihitung, dibulatkan; 0 bila tidak ada hari dihitung. */
export function persenHadir(r: Pick<RekapSiswa, "hadir" | "terlambat" | "hariDihitung">): number {
  return r.hariDihitung > 0 ? Math.round(((r.hadir + r.terlambat) / r.hariDihitung) * 100) : 0;
}

/** Semua tanggal [dari, sampai] yang bukan Minggu (kolom Rekap Bulanan tidak menampilkan Minggu). */
export function daftarTanggalRentang(dari: string, sampai: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${dari}T00:00:00Z`);
  const akhir = new Date(`${sampai}T00:00:00Z`);
  while (cur <= akhir) {
    if (cur.getUTCDay() !== 0) out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/** Rentang tanggal sebuah tapel/semester: ganjil = Jul-Des tahun mulai, genap = Jan-Jun tahun berikutnya, kosong = setahun. */
export function rentangSemester(tapel: string, semester: string): { dari: string; sampai: string } | null {
  const y = tahunMulaiTapel(tapel);
  if (y === null) return null;
  if (semester === ("ganjil" satisfies Semester)) return { dari: `${y}-07-01`, sampai: `${y}-12-31` };
  if (semester === ("genap" satisfies Semester)) return { dari: `${y + 1}-01-01`, sampai: `${y + 1}-06-30` };
  return { dari: `${y}-07-01`, sampai: `${y + 1}-06-30` };
}

/**
 * Rentang yang dilihat filter riwayat (tapel, semester, bulan): bulan memilih satu bulan, dibatasi ke
 * tapel/semester bila diisi (irisan; kosong = null). Tanpa bulan dan tapel -> null (tidak ada rentang yang jelas).
 */
export function rentangFilter(f: { tapel?: string; semester?: string; bulan?: string }): { dari: string; sampai: string } | null {
  const dasar = f.tapel ? rentangSemester(f.tapel, f.semester ?? "") : null;
  if (f.tapel && !dasar) return null;
  if (!f.bulan) return dasar;
  const m = /^(\d{4})-(\d{2})$/.exec(f.bulan);
  if (!m) return dasar;
  const [y, mo] = [Number(m[1]), Number(m[2])];
  const bulan = { dari: `${f.bulan}-01`, sampai: new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10) };
  if (!dasar) return bulan;
  const dari = bulan.dari > dasar.dari ? bulan.dari : dasar.dari;
  const sampai = bulan.sampai < dasar.sampai ? bulan.sampai : dasar.sampai;
  return dari <= sampai ? { dari, sampai } : null;
}
