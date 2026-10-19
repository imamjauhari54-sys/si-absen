/**
 * Aturan murni (tanpa I/O) untuk edit manual absensi dan Pulihkan.
 * Dipisah dari route supaya bisa dites tanpa database.
 *
 * Aturan jam (diterapkan di database oleh fungsi edit_manual_absensi, migrasi 019):
 *  - hadir / terlambat  : jam masuk & pulang yang sudah ada dipertahankan (tidak pernah dibuat otomatis)
 *  - izin / sakit / alpha: jam masuk & pulang dikosongkan
 *
 * Aturan periode & scan_oleh (juga di database, migrasi 019):
 *  - baris yang sudah ada: tapel, semester, dan scan_oleh dipertahankan
 *  - baris baru: periode ditentukan per tanggal oleh database (bukan setting aktif); scan_oleh kosong
 */
import { addDaysJakarta, isoWeekday } from "./tanggal";

export const STATUS_EDIT_VALID = ["hadir", "terlambat", "izin", "sakit", "alpha"] as const;
export type StatusEdit = (typeof STATUS_EDIT_VALID)[number];

/** Status yang mempertahankan jam masuk/pulang. Status lain mengosongkannya. */
export const STATUS_DENGAN_JAM: readonly StatusEdit[] = ["hadir", "terlambat"];

export const MAX_RENTANG_HARI = 92; // ~3 bulan, jaga-jaga input keliru

/**
 * SQLSTATE yang dilempar edit_manual_absensi (migrasi 019) kalau siswa tidak punya riwayat_kelas pada
 * tapel hasil penentuan periode. Route menerjemahkannya menjadi HTTP 422. Harus sama dengan errcode di SQL.
 */
export const KODE_SQL_RIWAYAT_KELAS_KOSONG = "EM001";

export function statusValid(s: string): s is StatusEdit {
  return (STATUS_EDIT_VALID as readonly string[]).includes(s);
}

/** Salinan aturan jam di sisi TypeScript — dipakai untuk pratinjau di UI dan sebagai dokumentasi yang bisa dites. */
export function statusMempertahankanJam(status: string): boolean {
  return (STATUS_DENGAN_JAM as readonly string[]).includes(status);
}

/** YYYY-MM-DD yang benar-benar ada di kalender (menolak 2026-02-31, "abc", dst). */
export function tanggalValid(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export type RencanaTanggal =
  | { ok: true; diproses: string[]; dilewati: string[] }
  | { ok: false; message: string };

/**
 * Susun daftar tanggal dari rentang [dari, sampai]. Minggu dan hari libur dilewati (bukan error).
 * Hasil `diproses` urut naik.
 */
export function susunTanggalEdit(dari: string, sampai: string, liburSet: ReadonlySet<string>): RencanaTanggal {
  if (!tanggalValid(dari) || !tanggalValid(sampai)) {
    return { ok: false, message: "Format tanggal tidak valid." };
  }
  if (sampai < dari) {
    return { ok: false, message: '"Sampai Tanggal" tidak boleh lebih awal dari "Dari Tanggal".' };
  }

  const diproses: string[] = [];
  const dilewati: string[] = [];
  let cur = dari;
  let jumlah = 0;
  while (cur <= sampai) {
    jumlah++;
    if (jumlah > MAX_RENTANG_HARI) {
      return { ok: false, message: `Rentang tanggal terlalu panjang (maks ${MAX_RENTANG_HARI} hari).` };
    }
    if (isoWeekday(cur) === 7 || liburSet.has(cur)) dilewati.push(cur);
    else diproses.push(cur);
    cur = addDaysJakarta(cur, 1);
  }
  return { ok: true, diproses, dilewati };
}

const NAMA_CLOUD_VALID = /^[A-Za-z0-9_-]+$/;
/** Host pengiriman (delivery) Cloudinary yang dipakai aplikasi: secure_url hasil upload berbentuk
 *  https://res.cloudinary.com/<cloud_name>/image/upload/... (lihat LampiranUploader). */
export const HOST_CLOUDINARY = "res.cloudinary.com";
const MAKS_PANJANG_URL = 2048;

export type HasilLampiran =
  /** nilai: null = kolom lampiran tidak diubah, "" = hapus lampiran, selain itu = URL yang sudah divalidasi. */
  | { ok: true; nilai: string | null }
  | { ok: false; httpStatus: 400 | 500; message: string };

/**
 * Lampiran dari form:
 *  - kosong        -> tidak diubah (nilai null)
 *  - "__HAPUS__"   -> hapus lampiran (nilai "")
 *  - selain itu    -> HARUS URL Cloudinary milik aplikasi ini, kalau tidak: galat (TIDAK diam-diam dianggap "tidak diubah").
 *
 * URL diterima hanya jika, setelah di-parse dengan new URL():
 *  - protokol https, tanpa username/password, tanpa port
 *  - hostname persis res.cloudinary.com (bukan subdomain/domain yang sekadar memuat teks "cloudinary.com")
 *  - path diawali /<cloud_name>/image/upload/ dan masih ada bagian setelahnya
 * `cloudName` = NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME (nama yang sama dengan yang dipakai LampiranUploader).
 * Kalau kosong/tidak valid, URL ditolak dengan galat konfigurasi (gagal tertutup).
 * Yang dikembalikan adalah bentuk URL yang sudah dinormalisasi (url.href).
 */
export function parseLampiranForm(raw: string, cloudName: string | null | undefined): HasilLampiran {
  const v = raw.trim();
  if (v === "__HAPUS__") return { ok: true, nilai: "" };
  if (!v) return { ok: true, nilai: null };

  const nama = (cloudName ?? "").trim();
  if (!NAMA_CLOUD_VALID.test(nama)) {
    return {
      ok: false,
      httpStatus: 500,
      message: "Konfigurasi Cloudinary di server belum lengkap, sehingga lampiran tidak dapat disimpan.",
    };
  }

  const tolak = (alasan: string): HasilLampiran => ({
    ok: false,
    httpStatus: 400,
    message: `URL lampiran tidak valid: ${alasan}`,
  });

  if (v.length > MAKS_PANJANG_URL) return tolak("terlalu panjang.");

  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return tolak("format URL salah.");
  }

  if (u.protocol !== "https:") return tolak("harus memakai HTTPS.");
  if (u.username || u.password || u.port) return tolak("tidak boleh memuat kredensial atau port.");
  if (u.hostname !== HOST_CLOUDINARY) return tolak("bukan alamat Cloudinary yang dipakai aplikasi ini.");

  const awalan = `/${nama}/image/upload/`;
  if (!u.pathname.startsWith(awalan) || u.pathname.length === awalan.length) {
    return tolak("bukan file dari akun Cloudinary aplikasi ini.");
  }

  return { ok: true, nilai: u.href };
}

// ── INPUT & HASIL RPC ───────────────────────────────────────────────

/**
 * ID numerik positif yang ketat (mis. siswa_id): hanya digit ASCII, tanpa nol di depan, tanpa spasi/tanda/
 * desimal/eksponen, dan harus berupa integer aman JavaScript. parseInt("1abc") menghasilkan 1 sehingga
 * tidak dipakai. Mengembalikan null kalau tidak valid (termasuk nilai non-string seperti File).
 */
export function parseIdPositif(raw: unknown): number | null {
  if (typeof raw !== "string" || !/^[1-9][0-9]*$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

export interface PeriodeBaruEdit {
  tapel: string;
  semester: string;
  sumber_tapel: string;
  sumber_semester: string;
}
export interface BarisHasilEdit {
  o_tanggal: string;
  o_diubah: boolean;
  o_periode_baru: PeriodeBaruEdit | null;
}

/**
 * Pastikan hasil edit_manual_absensi sesuai yang diminta: sebuah array dengan TEPAT satu baris per tanggal
 * yang dikirim (tanpa kurang, lebih, atau ganda), tiap baris berbentuk benar. Kalau tidak, route tidak
 * boleh menjawab "ok". `alasan` hanya untuk log server.
 */
export function validasiHasilEdit(
  data: unknown,
  diharapkan: readonly string[]
): { ok: true; baris: BarisHasilEdit[] } | { ok: false; alasan: string } {
  if (!Array.isArray(data)) return { ok: false, alasan: "hasil bukan array" };
  if (data.length !== diharapkan.length) {
    return { ok: false, alasan: `jumlah baris ${data.length}, diharapkan ${diharapkan.length}` };
  }

  const sisa = new Set(diharapkan);
  const baris: BarisHasilEdit[] = [];
  for (const item of data) {
    if (typeof item !== "object" || item === null) return { ok: false, alasan: "baris bukan objek" };
    const r = item as Record<string, unknown>;
    if (typeof r.o_tanggal !== "string") return { ok: false, alasan: "o_tanggal bukan string" };
    if (typeof r.o_diubah !== "boolean") return { ok: false, alasan: "o_diubah bukan boolean" };
    if (!sisa.delete(r.o_tanggal)) return { ok: false, alasan: `tanggal ${r.o_tanggal} tidak diharapkan atau ganda` };

    let periode: PeriodeBaruEdit | null = null;
    if (r.o_periode_baru !== null && r.o_periode_baru !== undefined) {
      const p = r.o_periode_baru as Record<string, unknown>;
      if (
        typeof p !== "object" ||
        typeof p.tapel !== "string" ||
        typeof p.semester !== "string" ||
        typeof p.sumber_tapel !== "string" ||
        typeof p.sumber_semester !== "string"
      ) {
        return { ok: false, alasan: "o_periode_baru berbentuk salah" };
      }
      periode = {
        tapel: p.tapel,
        semester: p.semester,
        sumber_tapel: p.sumber_tapel,
        sumber_semester: p.sumber_semester,
      };
    }
    baris.push({ o_tanggal: r.o_tanggal, o_diubah: r.o_diubah, o_periode_baru: periode });
  }
  return { ok: true, baris };
}

// ── PULIHKAN ────────────────────────────────────────────────────────

export type KodePulihkan = "ok" | "tidak_ada_edit" | "sudah_dipulihkan" | "kedaluwarsa" | "sudah_berubah";

export interface ResponsPulihkan {
  ok: boolean;
  httpStatus: number;
  message: string;
}

/** Terjemahkan kode hasil fungsi SQL pulihkan_edit_manual ke respons API. Kode asing = kesalahan server. */
export function responsPulihkan(kode: string | null | undefined): ResponsPulihkan {
  switch (kode) {
    case "ok":
      return { ok: true, httpStatus: 200, message: "Data absensi berhasil dipulihkan seperti sebelum diedit." };
    case "tidak_ada_edit":
      return { ok: false, httpStatus: 404, message: "Tidak ada edit manual yang bisa dipulihkan untuk tanggal ini." };
    case "sudah_dipulihkan":
      return { ok: false, httpStatus: 409, message: "Edit manual terakhir sudah dipulihkan sebelumnya." };
    case "kedaluwarsa":
      return { ok: false, httpStatus: 409, message: "Masa pemulihan untuk edit ini sudah lewat." };
    case "sudah_berubah":
      return {
        ok: false,
        httpStatus: 409,
        message: "Data sudah berubah sejak edit yang dipilih. Muat ulang Rekap, lalu pilih Pulihkan dari edit terbaru.",
      };
    default:
      return { ok: false, httpStatus: 500, message: "Hasil pemulihan tidak dikenali." };
  }
}
