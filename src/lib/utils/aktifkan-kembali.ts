/**
 * Aturan murni (tanpa I/O) untuk "Aktifkan Kembali" siswa nonaktif (migrasi 025).
 * Dipisah dari route/modal supaya bisa dites tanpa database dan dipakai ulang di server maupun UI.
 *
 * Dua mode:
 *  - batal_pindah         (A): tidak jadi pindah / salah input. Hari sekolah tanpa catatan sejak tanggal pindah diisi Alpha.
 *  - kembali_setelah_jeda (B): kembali pada tanggal tertentu; hari jeda tidak dihitung dan tidak tampil.
 *
 * Mode B hanya boleh dibuka bila semua rekap memakai aturan jeda yang sama (siswa-harian.ts, hari_dihitung_siswa).
 * Selama MODE_JEDA_DIBUKA = false, server MENOLAK mode B walau dipanggil langsung (bukan hanya disembunyikan
 * di modal), supaya tidak ada angka rekap yang berbeda-beda.
 */
import { tanggalValid } from "@/lib/utils/absen-edit";
import { addDaysJakarta, formatTglIndo } from "@/lib/utils/tanggal";

export const MODE_AKTIFKAN = ["batal_pindah", "kembali_setelah_jeda"] as const;
export type ModeAktifkan = (typeof MODE_AKTIFKAN)[number];

/**
 * Mode B dibuka (Langkah 3): rekap harian, bulanan, history semester, dan portal siswa sudah memakai aturan jeda yang sama
 * (siswa-harian.ts + hari_dihitung_siswa/rekap_history_siswa). Tetap berupa saklar: bila aturan jeda perlu diperbaiki,
 * ubah ke false dan server menolak mode B lagi (data jeda yang sudah tersimpan tetap dihormati rekap).
 */
export const MODE_JEDA_DIBUKA = true;

export interface PratinjauAktifkan {
  nama: string;
  status: "lulus" | "pindah";
  alasan: "lulus" | "pindah";
  kelas_sekarang: string;
  kelas_saat_pindah: string | null;
  tapel_pindah: string | null;
  tapel_aktif: string | null;
  pindah_pada: string | null;
  lintas_tapel: boolean;
  hari_ini: string;
  hari_belum_tercatat: number;
  hari_jeda: number | null;
  nisn_bentrok: boolean;
}

export type HasilParseAktifkan =
  | { ok: true; mode: ModeAktifkan; kembali: string | null }
  | { ok: false; message: string };

/**
 * ID dari URL: hanya angka positif utuh. parseInt("9abc") = 9 menerima sampah, jadi seluruh string diperiksa
 * dulu. Menolak awalan nol ("09"), tanda, spasi, desimal, dan angka di atas batas aman.
 */
export function parseIdSiswa(raw: string): number | null {
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

/** Tanggal paling awal yang boleh dipilih sebagai tanggal kembali: sehari SESUDAH tanggal pindah. */
export function kembaliPalingAwal(pindahPada: string | null): string | undefined {
  return pindahPada ? addDaysJakarta(pindahPada, 1) : undefined;
}

export function modeValid(m: unknown): m is ModeAktifkan {
  return typeof m === "string" && (MODE_AKTIFKAN as readonly string[]).includes(m);
}

/**
 * Validasi masukan form. Aturan yang butuh data (tanggal kembali harus SESUDAH tanggal pindah) dijaga di
 * database; di sini hanya bentuk masukan, mode, dan "tidak boleh di masa depan" (tanggal WIB).
 */
export function parseAktifkanInput(
  raw: { mode: unknown; kembali: unknown },
  hariIni: string,
  opsi: { modeJedaDibuka?: boolean } = {}
): HasilParseAktifkan {
  const modeJedaDibuka = opsi.modeJedaDibuka ?? MODE_JEDA_DIBUKA;
  const mode = typeof raw.mode === "string" ? raw.mode.trim() : "";
  if (!modeValid(mode)) return { ok: false, message: "Pilih salah satu: Tidak jadi pindah, atau Kembali setelah jeda." };

  if (mode === "batal_pindah") return { ok: true, mode, kembali: null };

  if (!modeJedaDibuka) {
    return { ok: false, message: "Mode \"Kembali setelah jeda\" belum tersedia. Gunakan \"Tidak jadi pindah\"." };
  }
  const kembali = typeof raw.kembali === "string" ? raw.kembali.trim() : "";
  if (!kembali) return { ok: false, message: "Isi tanggal kembali." };
  if (!tanggalValid(kembali)) return { ok: false, message: "Tanggal kembali tidak valid." };
  if (kembali > hariIni) return { ok: false, message: "Tanggal kembali tidak boleh di masa depan." };
  return { ok: true, mode, kembali };
}

export interface DampakAktifkan {
  /** Satu baris ringkasan, mis. "Pindah sejak 15 Agu 2026". */
  ringkasan: string;
  /** Hal yang harus dibaca admin sebelum konfirmasi. */
  peringatan: string[];
  /** false = tombol konfirmasi dimatikan (mis. NISN bentrok). */
  bisaLanjut: boolean;
}

/** Teks dampak untuk modal, dari hasil pratinjau database. */
export function susunDampak(p: PratinjauAktifkan, mode: ModeAktifkan, kembali: string | null): DampakAktifkan {
  const peringatan: string[] = [];
  let bisaLanjut = true;

  const label = p.alasan === "lulus" ? "Lulus" : "Pindah";
  let ringkasan: string;
  if (p.lintas_tapel) {
    ringkasan = `${label} pada tapel ${p.tapel_pindah ?? "sebelumnya"}. Data tapel itu tetap utuh; siswa dibuatkan baris di tapel ${p.tapel_aktif ?? "aktif"}.`;
    peringatan.push(
      `Kelas siswa sekarang: ${p.kelas_sekarang}` +
        (p.kelas_saat_pindah ? ` (saat ${label.toLowerCase()}: ${p.kelas_saat_pindah})` : "") +
        ". Pastikan sudah sesuai, terutama bila sudah ada kenaikan kelas."
    );
  } else if (p.pindah_pada) {
    ringkasan = `${label} sejak ${formatTglIndo(p.pindah_pada)}`;
  } else {
    ringkasan = `${label} (tanpa tanggal tercatat)`;
  }

  if (!p.lintas_tapel && p.pindah_pada) {
    if (mode === "batal_pindah") {
      if (p.hari_belum_tercatat > 0) {
        peringatan.push(
          `${p.hari_belum_tercatat} hari sekolah belum punya catatan. Hari-hari ini akan tercatat Alpha sampai Anda koreksi lewat Edit Manual.`
        );
      } else {
        peringatan.push("Tidak ada hari sekolah tanpa catatan, jadi tidak ada Alpha yang ditambahkan.");
      }
    } else {
      // Mode B: konfirmasi hanya boleh bila tanggal kembali SESUDAH tanggal pindah dan tidak di masa depan,
      // dan database berhasil menghitung hari jeda (hari_jeda = 0 sah; null = tanggal tidak bisa dihitung).
      const awal = kembaliPalingAwal(p.pindah_pada)!;
      if (!kembali) {
        bisaLanjut = false;
        peringatan.push("Isi tanggal kembali.");
      } else if (kembali < awal) {
        bisaLanjut = false;
        peringatan.push(`Tanggal kembali harus sesudah tanggal pindah (paling awal ${formatTglIndo(awal)}).`);
      } else if (kembali > p.hari_ini) {
        bisaLanjut = false;
        peringatan.push("Tanggal kembali tidak boleh di masa depan.");
      } else if (p.hari_jeda === null) {
        bisaLanjut = false;
        peringatan.push("Dampak tanggal kembali belum dapat dihitung. Periksa tanggalnya.");
      } else {
        peringatan.push(
          `${p.hari_jeda} hari sekolah (${formatTglIndo(p.pindah_pada)} sampai sebelum ${formatTglIndo(kembali)}) tidak dihitung dan tidak tampil.`
        );
      }
    }
  } else if (mode === "kembali_setelah_jeda" && !p.lintas_tapel) {
    // tanpa tanggal pindah tercatat tidak ada jeda yang bisa dihitung; database juga menolaknya
    bisaLanjut = false;
    peringatan.push("Siswa ini tidak punya tanggal pindah tercatat, jadi mode jeda tidak bisa dipakai. Pilih \"Tidak jadi pindah\".");
  }

  if (p.nisn_bentrok) {
    bisaLanjut = false;
    peringatan.push("NISN siswa ini sudah dipakai siswa aktif lain. Ubah atau kosongkan NISN dulu sebelum mengaktifkan.");
  }

  return { ringkasan, peringatan, bisaLanjut };
}

export interface GalatAktifkan {
  /** "sudah_aktif" = permintaan ganda / sudah dikerjakan admin lain: bukan kegagalan, cukup muat ulang. */
  status: "error" | "sudah_aktif";
  message: string;
}

/** Terjemahkan galat Postgres/PostgREST dari pratinjau_aktifkan_siswa / aktifkan_siswa ke pesan untuk admin. */
export function pesanGalatAktifkan(err: { message: string; code?: string | null }): GalatAktifkan {
  const msg = err.message ?? "";
  if (err.code === "PGRST202") {
    return { status: "error", message: "Fitur ini butuh migrasi 025 (aktifkan_siswa) dijalankan dulu." };
  }
  if (/sudah aktif/i.test(msg)) {
    return { status: "sudah_aktif", message: "Siswa ini sudah aktif (mungkin sudah diaktifkan admin lain). Daftar dimuat ulang." };
  }
  if (err.code === "23505" && /nisn/i.test(msg)) {
    return { status: "error", message: "Gagal mengaktifkan: NISN siswa ini sudah dipakai siswa aktif lain. Ubah atau kosongkan NISN dulu." };
  }
  if (err.code === "23503") {
    return { status: "error", message: "Akun admin tidak ditemukan. Silakan login ulang lalu coba lagi." };
  }
  if (err.code === "40P01" || err.code === "55P03") {
    return { status: "error", message: "Sistem sedang sibuk memproses siswa ini. Tunggu sebentar lalu coba lagi." };
  }
  return { status: "error", message: msg || "Gagal mengaktifkan siswa." };
}
