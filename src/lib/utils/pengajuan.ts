/**
 * Aturan murni (tanpa I/O) untuk pengajuan izin/sakit orang tua (migrasi 027): validasi bentuk input,
 * pemetaan hasil PIN & galat database ke respons HTTP, dan pratinjau nasib tiap hari.
 *
 * PRINSIP: aturan BISNIS (maks hari, batas mundur/maju, lampiran wajib, tumpang tindih, dst.) hidup di SQL
 * (ajukan_pengajuan_izin) sebagai satu-satunya sumber kebenaran. Di sini hanya bentuk input (tipe, format tanggal,
 * PIN 6 digit) supaya tidak ada dua tempat yang bisa berbeda pendapat. Konstanta di ATURAN_PENGAJUAN hanya SALINAN
 * untuk ditampilkan di UI; pengajuan.kontrak.test.ts membandingkannya dengan file SQL sehingga tidak bisa diam-diam melenceng.
 */
import { parseLampiranForm, tanggalValid } from "./absen-edit";

export const JENIS_PENGAJUAN = ["izin", "sakit"] as const;
export type JenisPengajuan = (typeof JENIS_PENGAJUAN)[number];

export const STATUS_PENGAJUAN = ["menunggu", "disetujui", "disetujui_sebagian", "ditolak", "dibatalkan"] as const;
export type StatusPengajuan = (typeof STATUS_PENGAJUAN)[number];

export const STATUS_PENGAJUAN_LABEL: Record<StatusPengajuan, string> = {
  menunggu: "Menunggu persetujuan",
  disetujui: "Disetujui",
  disetujui_sebagian: "Disetujui sebagian",
  ditolak: "Ditolak",
  dibatalkan: "Dibatalkan",
};

export const HASIL_HARI = ["direncanakan", "ditulis", "scan_menang", "sudah_tercatat", "dialpha"] as const;
export type HasilHari = (typeof HASIL_HARI)[number];

export const HASIL_HARI_LABEL: Record<HasilHari, string> = {
  direncanakan: "Akan dicatat otomatis pada harinya bila siswa tidak scan",
  ditulis: "Sudah dicatat sebagai izin/sakit",
  scan_menang: "Siswa tercatat hadir (scan lebih diutamakan)",
  sudah_tercatat: "Sudah tercatat izin/sakit",
  dialpha: "Tidak disetujui, dicatat Alpha",
};

/** Salinan konstanta di migrasi 027 (ajukan_pengajuan_izin). Hanya untuk tampilan; SQL tetap yang memutuskan. */
export const ATURAN_PENGAJUAN = {
  maksHariSakit: 14,
  maksMundurHari: 7,
  maksMajuHari: 30,
  maksMenunggu: 3,
  lampiranWajibLebihDariHari: 2,
  alasanMin: 5,
  alasanMaks: 300,
} as const;

/** Folder Cloudinary khusus lampiran pengajuan orang tua (terpisah dari lampiran guru dan foto siswa). */
export const FOLDER_LAMPIRAN_PENGAJUAN = "si-absen/pengajuan";
export const FORMAT_LAMPIRAN_PENGAJUAN = "jpg,jpeg,png,webp";

const MAKS_BYTE_BODY = 20_000;
const MAKS_PANJANG_ALASAN_MENTAH = 2_000; // batas pengaman payload; batas bisnis 300 karakter dijaga SQL
const MAKS_PANJANG_CATATAN = 500;
export const MAKS_SISWA_PER_PERMINTAAN_PIN = 100;
export const MAKS_HARI_PER_PENGAJUAN = 31;

export interface Galat {
  ok: false;
  status: 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 503;
  message: string;
  kode?: string;
  /** Dikirim ke klien apa adanya (mis. sisa percobaan PIN). */
  tambahan?: Record<string, unknown>;
  /** Detik, untuk header Retry-After pada 429. */
  retryAfter?: number;
}

// ── BODY JSON ───────────────────────────────────────────────────────────────────────────────────────

/**
 * Baca body JSON dengan aman: wajib Content-Type application/json (formulir lintas-situs tidak bisa mengirimnya tanpa
 * preflight CORS, jadi ini sekaligus lapisan tambahan terhadap CSRF), ukuran dibatasi, dan harus berupa objek.
 * Mengembalikan null untuk semua kasus tidak sah.
 */
export async function bacaBodyJson(req: Request): Promise<Record<string, unknown> | null> {
  const tipe = (req.headers.get("content-type") ?? "").toLowerCase();
  if (!tipe.startsWith("application/json")) return null;
  let teks: string;
  try {
    teks = await req.text();
  } catch {
    return null;
  }
  if (teks.length === 0 || teks.length > MAKS_BYTE_BODY) return null;
  try {
    const nilai: unknown = JSON.parse(teks);
    return nilai !== null && typeof nilai === "object" && !Array.isArray(nilai) ? (nilai as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const GALAT_BODY: Galat = { ok: false, status: 400, message: "Permintaan tidak valid." };

// ── PIN ─────────────────────────────────────────────────────────────────────────────────────────────

export function parsePin(raw: unknown): string | null {
  return typeof raw === "string" && /^[0-9]{6}$/.test(raw) ? raw : null;
}

const GALAT_PIN_FORMAT: Galat = { ok: false, status: 400, kode: "PIN_FORMAT", message: "PIN harus 6 digit angka." };

function formatWaktuWib(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const wib = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return `${wib.toISOString().slice(11, 16)} WIB`;
}

/**
 * Terjemahkan jsonb hasil verifikasi_pin_ortu / atur_pin_ortu menjadi galat HTTP. null = PIN benar.
 * Pesan sengaja tidak membedakan "siswa tidak ada" dari alasan lain di luar yang perlu diketahui orang tua.
 */
export function petakanHasilPin(hasil: unknown, sekarang: Date = new Date()): Galat | null {
  if (hasil === null || typeof hasil !== "object") {
    return { ok: false, status: 500, message: "Gagal memeriksa PIN. Silakan coba lagi." };
  }
  const h = hasil as Record<string, unknown>;
  if (h.ok === true) return null;
  const kode = typeof h.kode === "string" ? h.kode : "";
  switch (kode) {
    case "PIN_SALAH": {
      const sisa = typeof h.sisa_percobaan === "number" ? h.sisa_percobaan : undefined;
      return {
        ok: false, status: 403, kode,
        message: sisa !== undefined ? `PIN salah. Sisa percobaan: ${sisa}.` : "PIN salah.",
        ...(sisa !== undefined ? { tambahan: { sisa_percobaan: sisa } } : {}),
      };
    }
    case "TERKUNCI": {
      let sampai: string | undefined = typeof h.terkunci_sampai === "string" ? h.terkunci_sampai : undefined;
      const menit = typeof h.menit === "number" ? h.menit : undefined;
      if (!sampai && menit !== undefined) sampai = new Date(sekarang.getTime() + menit * 60_000).toISOString();
      const detik = sampai ? Math.max(1, Math.ceil((new Date(sampai).getTime() - sekarang.getTime()) / 1000)) : undefined;
      const jam = sampai ? formatWaktuWib(sampai) : "";
      return {
        ok: false, status: 429, kode,
        message: jam
          ? `Terlalu banyak PIN salah. Coba lagi setelah pukul ${jam}, atau minta wali kelas mereset PIN.`
          : "Terlalu banyak PIN salah. Coba lagi nanti, atau minta wali kelas mereset PIN.",
        ...(sampai ? { tambahan: { terkunci_sampai: sampai } } : {}),
        ...(detik ? { retryAfter: detik } : {}),
      };
    }
    case "PIN_BELUM_DIATUR":
      return { ok: false, status: 409, kode, message: "PIN belum dibuat. Minta wali kelas membuatkan PIN terlebih dahulu." };
    case "SISWA_TIDAK_AKTIF":
      return { ok: false, status: 403, kode, message: "Siswa tidak aktif." };
    case "PIN_FORMAT":
      return GALAT_PIN_FORMAT;
    case "PIN_TERLALU_MUDAH":
      return { ok: false, status: 422, kode, message: "PIN terlalu mudah ditebak (mis. 123456 atau angka kembar). Pilih PIN lain." };
    default:
      return { ok: false, status: 500, message: "Gagal memeriksa PIN. Silakan coba lagi." };
  }
}

// ── GALAT DATABASE ──────────────────────────────────────────────────────────────────────────────────

export interface GalatDb {
  code?: string | null;
  message?: string | null;
  hint?: string | null;
}

/** SQLSTATE edit_manual_absensi (migrasi 019) bila siswa tidak punya riwayat kelas pada tapel itu. */
const KODE_RIWAYAT_KELAS_KOSONG = "EM001";

/** PGRST202/PGRST205 = fungsi/tabel tidak ada di schema cache PostgREST; 42883/42P01 = tidak ada di Postgres: migrasi 027 belum dijalankan. */
export function fiturBelumAktif(kode: string | null | undefined): boolean {
  return kode === "PGRST202" || kode === "PGRST205" || kode === "42883" || kode === "42P01";
}

/**
 * Petakan galat RPC/query menjadi respons. `raise exception` biasa di fungsi SQL berkode P0001 dan pesannya adalah
 * kalimat Indonesia yang memang ditulis untuk pengguna (mis. "Alasan minimal 5 karakter.") sehingga diteruskan apa
 * adanya sebagai 422. Kode lain TIDAK diteruskan: detail hanya untuk log server.
 */
export function petakanGalatDb(err: GalatDb): Galat {
  const kode = err.code ?? "";
  if (kode === "P0001") {
    return { ok: false, status: 422, message: (err.message ?? "").trim() || "Permintaan ditolak." };
  }
  if (kode === KODE_RIWAYAT_KELAS_KOSONG) {
    return {
      ok: false, status: 422, kode: "riwayat_kelas_kosong",
      message: err.message || "Siswa tidak memiliki riwayat kelas pada tapel untuk tanggal ini. Tidak ada perubahan yang disimpan.",
    };
  }
  if (kode === "23505") {
    return { ok: false, status: 409, message: "Tanggal tersebut baru saja dipakai pengajuan lain. Muat ulang lalu coba lagi." };
  }
  if (kode === "40001" || kode === "40P01" || kode === "55P03") {
    return { ok: false, status: 409, message: "Sistem sedang sibuk memproses permintaan lain. Coba lagi sebentar." };
  }
  if (fiturBelumAktif(kode)) {
    return { ok: false, status: 503, message: "Fitur pengajuan izin belum aktif di server (migrasi 027 belum dijalankan)." };
  }
  return { ok: false, status: 500, message: "Terjadi kesalahan di server. Silakan coba lagi." };
}

// ── INPUT: LAMPIRAN ─────────────────────────────────────────────────────────────────────────────────

/**
 * Lampiran pengajuan: kosong = tidak ada (null). Selain itu wajib URL Cloudinary milik aplikasi ini DAN berada di
 * folder lampiran pengajuan. Sentinel "__HAPUS__" milik form guru tidak berlaku di sini.
 */
export function parseLampiranPengajuan(raw: unknown, cloudName: string | null | undefined):
  { ok: true; nilai: string | null } | Galat {
  if (raw === undefined || raw === null || raw === "") return { ok: true, nilai: null };
  if (typeof raw !== "string" || raw.trim() === "__HAPUS__") {
    return { ok: false, status: 400, message: "URL lampiran tidak valid." };
  }
  const r = parseLampiranForm(raw, cloudName);
  if (!r.ok) return { ok: false, status: r.httpStatus, message: r.message };
  if (r.nilai === null || r.nilai === "") return { ok: true, nilai: null };
  if (!new URL(r.nilai).pathname.includes(`/${FOLDER_LAMPIRAN_PENGAJUAN}/`)) {
    return { ok: false, status: 400, message: "URL lampiran tidak valid: bukan file yang diunggah lewat form pengajuan." };
  }
  return { ok: true, nilai: r.nilai };
}

// ── INPUT: PORTAL ───────────────────────────────────────────────────────────────────────────────────

export interface InputAjukan {
  jenis: JenisPengajuan;
  dari: string;
  sampai: string;
  alasan: string;
  lampiran: string | null;
  pin: string;
}

export function parseAjukan(body: Record<string, unknown>, cloudName: string | null | undefined): { ok: true; nilai: InputAjukan } | Galat {
  const jenis = body.jenis;
  if (typeof jenis !== "string" || !(JENIS_PENGAJUAN as readonly string[]).includes(jenis)) {
    return { ok: false, status: 400, message: "Jenis pengajuan harus izin atau sakit." };
  }
  const dari = body.tanggal_dari;
  if (typeof dari !== "string" || !tanggalValid(dari)) {
    return { ok: false, status: 400, message: "Tanggal tidak valid." };
  }
  // Izin satu hari: tanggal_sampai boleh dikosongkan. Sakit wajib mengisi rentang sendiri.
  const sampaiMentah = body.tanggal_sampai;
  let sampai: string;
  if (sampaiMentah === undefined || sampaiMentah === null || sampaiMentah === "") {
    if (jenis === "sakit") return { ok: false, status: 400, message: "Tanggal sampai wajib diisi untuk sakit." };
    sampai = dari;
  } else if (typeof sampaiMentah === "string" && tanggalValid(sampaiMentah)) {
    sampai = sampaiMentah;
  } else {
    return { ok: false, status: 400, message: "Tanggal tidak valid." };
  }
  if (sampai < dari) return { ok: false, status: 400, message: "Tanggal sampai tidak boleh sebelum tanggal dari." };

  const alasan = body.alasan;
  if (typeof alasan !== "string") return { ok: false, status: 400, message: "Alasan wajib diisi." };
  if (alasan.length > MAKS_PANJANG_ALASAN_MENTAH) return { ok: false, status: 400, message: `Alasan maksimal ${ATURAN_PENGAJUAN.alasanMaks} karakter.` };

  const lampiran = parseLampiranPengajuan(body.lampiran_url, cloudName);
  if ("status" in lampiran) return lampiran;

  const pin = parsePin(body.pin);
  if (!pin) return GALAT_PIN_FORMAT;

  return { ok: true, nilai: { jenis: jenis as JenisPengajuan, dari, sampai, alasan, lampiran: lampiran.nilai, pin } };
}

export function parseBatal(body: Record<string, unknown>): { ok: true; pin: string } | Galat {
  const pin = parsePin(body.pin);
  return pin ? { ok: true, pin } : GALAT_PIN_FORMAT;
}

/**
 * Ganti PIN oleh orang tua. PIN baru tidak boleh sama dengan yang lama (percuma) dan kerumitannya (angka kembar,
 * urutan) diperiksa database lewat atur_pin_ortu.
 */
export function parseGantiPin(body: Record<string, unknown>): { ok: true; pinLama: string; pinBaru: string } | Galat {
  const pinLama = parsePin(body.pin_lama);
  const pinBaru = parsePin(body.pin_baru);
  if (!pinLama || !pinBaru) return GALAT_PIN_FORMAT;
  if (pinLama === pinBaru) return { ok: false, status: 422, kode: "PIN_SAMA", message: "PIN baru harus berbeda dari PIN lama." };
  return { ok: true, pinLama, pinBaru };
}

// ── INPUT: ADMIN / WALI KELAS ───────────────────────────────────────────────────────────────────────

export interface InputPutuskan {
  keputusan: "setujui" | "tolak";
  /** null = semua hari diajukan disetujui. */
  hari: string[] | null;
  catatan: string | null;
}

export function parsePutuskan(body: Record<string, unknown>): { ok: true; nilai: InputPutuskan } | Galat {
  const k = body.keputusan;
  if (k !== "setujui" && k !== "tolak") return { ok: false, status: 400, message: "Keputusan harus setujui atau tolak." };

  let hari: string[] | null = null;
  if (body.hari !== undefined && body.hari !== null) {
    if (!Array.isArray(body.hari) || body.hari.length > MAKS_HARI_PER_PENGAJUAN) {
      return { ok: false, status: 400, message: "Daftar hari tidak valid." };
    }
    if (k === "tolak") return { ok: false, status: 400, message: "Penolakan berlaku untuk seluruh pengajuan; jangan kirim daftar hari." };
    const unik = new Set<string>();
    for (const t of body.hari) {
      if (typeof t !== "string" || !tanggalValid(t)) return { ok: false, status: 400, message: "Ada tanggal yang tidak valid." };
      unik.add(t);
    }
    hari = [...unik].sort();
    if (hari.length === 0) return { ok: false, status: 400, message: "Pilih minimal satu hari untuk disetujui, atau tolak pengajuan." };
  }

  let catatan: string | null = null;
  if (body.catatan !== undefined && body.catatan !== null) {
    if (typeof body.catatan !== "string") return { ok: false, status: 400, message: "Catatan tidak valid." };
    const c = body.catatan.trim();
    if (c.length > MAKS_PANJANG_CATATAN) return { ok: false, status: 400, message: `Catatan maksimal ${MAKS_PANJANG_CATATAN} karakter.` };
    catatan = c === "" ? null : c;
  }
  return { ok: true, nilai: { keputusan: k, hari, catatan } };
}

export type AksiPin = "buat" | "reset" | "tandai_dibagikan";

export function parseAksiPin(body: Record<string, unknown>): { ok: true; aksi: AksiPin; siswaIds: number[] } | Galat {
  const a = body.action;
  if (a !== "buat" && a !== "reset" && a !== "tandai_dibagikan") {
    return { ok: false, status: 400, message: "Aksi tidak dikenal." };
  }
  const ids = body.siswa_ids;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAKS_SISWA_PER_PERMINTAAN_PIN) {
    return { ok: false, status: 400, message: `Pilih 1 sampai ${MAKS_SISWA_PER_PERMINTAAN_PIN} siswa.` };
  }
  const unik = new Set<number>();
  for (const id of ids) {
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) {
      return { ok: false, status: 400, message: "Daftar siswa tidak valid." };
    }
    unik.add(id);
  }
  return { ok: true, aksi: a, siswaIds: [...unik].sort((x, y) => x - y) };
}

/** Parameter angka positif dari query string ("page", dst.) dengan batas atas; nilai buruk jatuh ke bawaan. */
export function parseHalaman(raw: string | null, bawaan: number, maks: number): number {
  if (raw === null || !/^[1-9][0-9]{0,5}$/.test(raw)) return bawaan;
  return Math.min(Number(raw), maks);
}

// ── PRATINJAU PER HARI ──────────────────────────────────────────────────────────────────────────────

export type StatusAbsensiAda = "hadir" | "terlambat" | "izin" | "sakit" | "alpha" | null;

/**
 * Nasib satu hari BILA DISETUJUI sekarang. Cermin persis cabang di putuskan_pengajuan_izin (migrasi 027); pengajuan.kontrak.test.ts
 * menjaga agar keduanya tidak berpisah jalan.
 *  - hadir/terlambat            -> scan_menang   (tidak ditimpa)
 *  - izin/sakit                 -> sudah_tercatat
 *  - tanpa catatan & hari lampau, atau Alpha & hari ini/lampau -> ditulis (izin/sakit dicatat sekarang)
 *  - selain itu (hari ini tanpa catatan, mendatang, Alpha mendatang) -> direncanakan (cron akhir hari)
 */
export function pratinjauHariDisetujui(tanggal: string, absensi: StatusAbsensiAda, hariIni: string): HasilHari {
  if (absensi === "hadir" || absensi === "terlambat") return "scan_menang";
  if (absensi === "izin" || absensi === "sakit") return "sudah_tercatat";
  if (absensi === null && tanggal < hariIni) return "ditulis";
  if (absensi === "alpha" && tanggal <= hariIni) return "ditulis";
  return "direncanakan";
}

/**
 * Nasib satu hari yang TIDAK disetujui (ditolak, atau tidak dipilih pada persetujuan sebagian), sesuai evaluasi_alpha_pengajuan:
 * hari lampau tanpa catatan dicatat Alpha; selain itu absensi dibiarkan mengikuti aturan normal.
 */
export function pratinjauHariTidakDisetujui(tanggal: string, absensi: StatusAbsensiAda, hariIni: string): "dialpha" | "tidak_berubah" {
  return absensi === null && tanggal < hariIni ? "dialpha" : "tidak_berubah";
}

export interface HariPratinjau {
  tanggal: string;
  /** Catatan absensi yang sudah ada pada tanggal itu (null = belum ada). */
  absensi: StatusAbsensiAda;
  /** Bila disetujui. */
  jikaDisetujui: HasilHari;
  /** Bila tidak disetujui. */
  jikaTidak: "dialpha" | "tidak_berubah";
}

export function susunPratinjauHari(tanggalList: readonly string[], absensiPerTanggal: ReadonlyMap<string, StatusAbsensiAda>, hariIni: string): HariPratinjau[] {
  return [...tanggalList].sort().map((tanggal) => {
    const absensi = absensiPerTanggal.get(tanggal) ?? null;
    return {
      tanggal,
      absensi,
      jikaDisetujui: pratinjauHariDisetujui(tanggal, absensi, hariIni),
      jikaTidak: pratinjauHariTidakDisetujui(tanggal, absensi, hariIni),
    };
  });
}
