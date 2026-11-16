/**
 * Logika murni form pengajuan di portal orang tua (tanpa React/jaringan, jadi bisa dites).
 *
 * Ini hanya BANTUAN TAMPILAN (umpan balik cepat sebelum kirim). Yang memutuskan tetap SQL: pesan galat dari server
 * selalu ditampilkan apa adanya bila lolos pemeriksaan di sini tetapi ditolak di sana.
 */
import { ATURAN_PENGAJUAN, type HasilHari, type JenisPengajuan, type StatusPengajuan } from "./pengajuan";

export const MAKS_BYTE_LAMPIRAN = 5 * 1024 * 1024;
export const TIPE_LAMPIRAN_DIIZINKAN = ["image/jpeg", "image/png", "image/webp"] as const;

const MS_HARI = 86_400_000;
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

function keUtc(tgl: string): number {
  const [y, m, d] = tgl.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
function dariUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function tambahHari(tgl: string, n: number): string {
  return dariUtc(keUtc(tgl) + n * MS_HARI);
}

/** Selisih hari kalender (sampai - dari). */
export function selisihHari(dari: string, sampai: string): number {
  return Math.round((keUtc(sampai) - keUtc(dari)) / MS_HARI);
}

/** Bentuk YYYY-MM-DD dan benar-benar ada di kalender. */
export function tanggalAda(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return dariUtc(keUtc(s)) === s;
}

/**
 * Hari sekolah dalam rentang: Senin-Sabtu, bukan hari libur (cermin hari_sekolah_rentang di SQL: hanya Minggu dan
 * hari_libur yang dikecualikan). Rentang dibatasi 62 hari agar input aneh tidak membuat loop panjang.
 */
export function hitungHariSekolah(dari: string, sampai: string, libur: ReadonlySet<string>): number {
  if (!tanggalAda(dari) || !tanggalAda(sampai) || sampai < dari) return 0;
  const total = Math.min(selisihHari(dari, sampai), 62);
  let n = 0;
  for (let i = 0; i <= total; i++) {
    const t = tambahHari(dari, i);
    if (new Date(keUtc(t)).getUTCDay() !== 0 && !libur.has(t)) n++;
  }
  return n;
}

/** Batas pilihan tanggal pada kalender form (atribut min/max). */
export function batasTanggalForm(hariIni: string): { min: string; max: string } {
  return { min: tambahHari(hariIni, -ATURAN_PENGAJUAN.maksMundurHari), max: tambahHari(hariIni, ATURAN_PENGAJUAN.maksMajuHari) };
}

export interface IsiForm {
  jenis: JenisPengajuan | "";
  dari: string;
  sampai: string;
  alasan: string;
  pin: string;
  /** Berkas lampiran yang dipilih (hanya sifatnya, bukan isinya). */
  berkas: { type: string; size: number } | null;
}

export type KolomForm = "jenis" | "dari" | "sampai" | "alasan" | "pin" | "lampiran";
export type GalatForm = Partial<Record<KolomForm, string>>;

/** Tanggal akhir yang dipakai: izin selalu satu hari. */
export function tanggalSampaiEfektif(f: Pick<IsiForm, "jenis" | "dari" | "sampai">): string {
  return f.jenis === "izin" ? f.dari : f.sampai;
}

/** Lampiran wajib: sakit dengan hari sekolah lebih dari batas. */
export function lampiranWajib(f: Pick<IsiForm, "jenis" | "dari" | "sampai">, libur: ReadonlySet<string>): boolean {
  if (f.jenis !== "sakit") return false;
  return hitungHariSekolah(f.dari, f.sampai, libur) > ATURAN_PENGAJUAN.lampiranWajibLebihDariHari;
}

export function validasiForm(f: IsiForm, hariIni: string, libur: ReadonlySet<string>): GalatForm {
  const g: GalatForm = {};
  const { min, max } = batasTanggalForm(hariIni);

  if (f.jenis !== "izin" && f.jenis !== "sakit") g.jenis = "Pilih izin atau sakit.";

  if (!tanggalAda(f.dari)) g.dari = "Pilih tanggal.";
  else if (f.dari < min) g.dari = `Paling lama ${ATURAN_PENGAJUAN.maksMundurHari} hari ke belakang.`;
  else if (f.dari > max) g.dari = `Paling jauh ${ATURAN_PENGAJUAN.maksMajuHari} hari ke depan.`;

  if (f.jenis === "sakit") {
    if (!tanggalAda(f.sampai)) g.sampai = "Pilih tanggal sampai.";
    else if (!g.dari && f.sampai < f.dari) g.sampai = "Tidak boleh sebelum tanggal dari.";
    else if (f.sampai > max) g.sampai = `Paling jauh ${ATURAN_PENGAJUAN.maksMajuHari} hari ke depan.`;
    else if (!g.dari && selisihHari(f.dari, f.sampai) + 1 > ATURAN_PENGAJUAN.maksHariSakit) {
      g.sampai = `Sakit paling lama ${ATURAN_PENGAJUAN.maksHariSakit} hari per pengajuan.`;
    }
  }

  const alasan = f.alasan.trim();
  if (alasan.length < ATURAN_PENGAJUAN.alasanMin) g.alasan = `Alasan minimal ${ATURAN_PENGAJUAN.alasanMin} karakter.`;
  else if (alasan.length > ATURAN_PENGAJUAN.alasanMaks) g.alasan = `Alasan maksimal ${ATURAN_PENGAJUAN.alasanMaks} karakter.`;

  if (f.berkas) {
    if (!(TIPE_LAMPIRAN_DIIZINKAN as readonly string[]).includes(f.berkas.type)) g.lampiran = "Hanya foto JPG, PNG, atau WebP.";
    else if (f.berkas.size > MAKS_BYTE_LAMPIRAN) g.lampiran = "Ukuran foto maksimal 5 MB.";
  } else if (!g.dari && !g.sampai && lampiranWajib(f, libur)) {
    g.lampiran = `Foto surat dokter wajib untuk sakit lebih dari ${ATURAN_PENGAJUAN.lampiranWajibLebihDariHari} hari sekolah.`;
  }

  if (!/^[0-9]{6}$/.test(f.pin)) g.pin = "PIN 6 digit angka.";
  return g;
}

// ── TAMPILAN ───────────────────────────────────────────────────────────────────────────────────────

export function formatTanggalPendek(tgl: string): string {
  const [y, m, d] = tgl.split("-").map(Number);
  const hari = HARI[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${hari}, ${d} ${BULAN[m - 1]} ${y}`;
}

/** "Sen, 16 Nov 2026" atau "16-18 Nov 2026" / "30 Nov - 2 Des 2026" / lintas tahun. */
export function ringkasRentang(dari: string, sampai: string): string {
  if (dari === sampai) return formatTanggalPendek(dari);
  const [y1, m1, d1] = dari.split("-").map(Number);
  const [y2, m2, d2] = sampai.split("-").map(Number);
  if (y1 !== y2) return `${d1} ${BULAN[m1 - 1]} ${y1} - ${d2} ${BULAN[m2 - 1]} ${y2}`;
  if (m1 !== m2) return `${d1} ${BULAN[m1 - 1]} - ${d2} ${BULAN[m2 - 1]} ${y2}`;
  return `${d1}-${d2} ${BULAN[m2 - 1]} ${y2}`;
}

export const GAYA_STATUS: Record<StatusPengajuan, string> = {
  menunggu: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800",
  disetujui: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800",
  disetujui_sebagian: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-800",
  ditolak: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800",
  dibatalkan: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700",
};

/** Keterangan singkat per hari untuk orang tua (bukan istilah teknis SQL). */
export function keteranganHari(
  h: { disetujui: boolean | null; aktif: boolean; hasil: HasilHari | null },
  status: StatusPengajuan,
  jenis: JenisPengajuan
): { teks: string; nada: "tunggu" | "baik" | "netral" | "buruk" } {
  const j = jenis === "sakit" ? "Sakit" : "Izin";
  if (status === "menunggu") return { teks: "Menunggu persetujuan", nada: "tunggu" };
  if (status === "dibatalkan") return { teks: "Dibatalkan", nada: "netral" };
  if (h.disetujui === false) return { teks: h.hasil === "dialpha" ? "Tidak disetujui (Alpha)" : "Tidak disetujui", nada: "buruk" };
  switch (h.hasil) {
    case "ditulis":
    case "sudah_tercatat":
      return { teks: `Tercatat ${j}`, nada: "baik" };
    case "scan_menang":
      return { teks: "Siswa tercatat hadir", nada: "baik" };
    case "direncanakan":
      return { teks: `Disetujui, dicatat ${j} otomatis pada harinya`, nada: "baik" };
    default:
      return { teks: "Disetujui", nada: "baik" };
  }
}
