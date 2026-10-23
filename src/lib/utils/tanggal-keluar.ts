import { tanggalValid } from "@/lib/utils/absen-edit";
import { formatTglIndo, isoWeekday } from "@/lib/utils/tanggal";
import { tahunMulaiTapel } from "@/lib/utils/tapel";

export type HasilTanggalKeluar = { ok: true; value: string | null } | { ok: false; message: string };

/**
 * Validasi tanggal pindah/keluar siswa dari form Nonaktifkan (siswa masih tampil pada tanggal itu, tetapi absensinya tidak dihitung).
 * Kosong = pakai default (hari ini, diisi database). Harus tanggal kalender yang benar dan tidak
 * boleh di masa depan (rekap harian/bulanan tidak punya makna untuk keluar yang belum terjadi).
 */
export function parseTanggalKeluar(raw: unknown, hariIni: string): HasilTanggalKeluar {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return { ok: true, value: null };
  if (!tanggalValid(s)) return { ok: false, message: "Tanggal pindah tidak valid." };
  if (s > hariIni) return { ok: false, message: "Tanggal pindah tidak boleh di masa depan." };
  return { ok: true, value: s };
}

/**
 * Dari banyak baris riwayat_kelas, ambil yang tapelnya paling baru untuk tiap siswa (urutan masukan
 * bebas). Dipakai halaman Siswa Nonaktif: tanggal keluar ada di baris tapel terakhir siswa itu.
 */
export function pilihRiwayatTerbaru<T extends { siswa_id: number; tapel: string }>(rows: T[]): Map<number, T> {
  const hasil = new Map<number, T>();
  for (const r of rows) {
    const lama = hasil.get(r.siswa_id);
    if (!lama || r.tapel > lama.tapel) hasil.set(r.siswa_id, r);
  }
  return hasil;
}

export interface MasukanPeriksaTanggalPindah {
  tanggal: string;
  tapel: string;
  /** Tanggal absensi siswa (di tapel itu) pada atau sesudah `tanggal`. */
  tanggalAbsensiSesudah: string[];
  liburSet: ReadonlySet<string>;
}

export interface HasilPeriksaTanggalPindah {
  /** Ditolak (tanggal jelas salah). */
  galat: string | null;
  /** Boleh disimpan, tetapi admin harus mengonfirmasi dulu. */
  peringatan: string[];
}

/**
 * Pemeriksaan tanggal pindah terhadap data. Ditolak bila jauh di luar kalender tapel (batas longgar:
 * 1 Juni awal tapel s.d. 31 Juli akhir tapel). Peringatan (perlu konfirmasi) bila tanggal itu hari Minggu,
 * hari libur, atau masih ada absensi hari sekolah pada/sesudahnya yang jadi tidak dihitung.
 */
export function periksaTanggalPindah(m: MasukanPeriksaTanggalPindah): HasilPeriksaTanggalPindah {
  const awal = tahunMulaiTapel(m.tapel);
  if (awal !== null) {
    const batasAwal = `${awal}-06-01`;
    const batasAkhir = `${awal + 1}-07-31`;
    if (m.tanggal < batasAwal || m.tanggal > batasAkhir) {
      return {
        galat: `Tanggal pindah ${formatTglIndo(m.tanggal)} di luar tapel ${m.tapel}. Isi tanggal yang berada di tapel tersebut.`,
        peringatan: [],
      };
    }
  }

  const peringatan: string[] = [];
  if (isoWeekday(m.tanggal) === 7) {
    peringatan.push(`${formatTglIndo(m.tanggal)} jatuh pada hari Minggu.`);
  } else if (m.liburSet.has(m.tanggal)) {
    peringatan.push(`${formatTglIndo(m.tanggal)} tercatat sebagai hari libur.`);
  }

  const hariSekolah = [...new Set(m.tanggalAbsensiSesudah)]
    .filter((t) => isoWeekday(t) !== 7 && !m.liburSet.has(t))
    .sort();
  if (hariSekolah.length > 0) {
    peringatan.push(
      `Siswa masih punya absensi ${hariSekolah.length} hari sekolah pada/sesudah tanggal ini (sampai ${formatTglIndo(hariSekolah[hariSekolah.length - 1])}). Absensi tersebut tidak akan dihitung.`
    );
  }
  return { galat: null, peringatan };
}
