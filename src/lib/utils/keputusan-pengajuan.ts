/**
 * Logika murni layar persetujuan (wali kelas/admin): pilihan hari, isi permintaan ke API, ringkasan akibat.
 * Aturan bisnis TETAP di SQL (putuskan_pengajuan_izin); di sini hanya mencegah kiriman yang pasti ditolak
 * dan menjelaskan akibatnya kepada pengambil keputusan sebelum menekan tombol.
 */
import type { HariPratinjau, StatusAbsensiAda } from "./pengajuan";

export const MAKS_CATATAN = 300;

export type ModeKeputusan = "semua" | "sebagian" | "tolak";

export const LABEL_ABSENSI: Record<NonNullable<StatusAbsensiAda>, string> = {
  hadir: "Hadir",
  terlambat: "Terlambat",
  izin: "Izin",
  sakit: "Sakit",
  alpha: "Alpha",
};

export interface IsiKeputusan {
  mode: ModeKeputusan;
  /** Tanggal yang dicentang (hanya dipakai mode "sebagian"). */
  terpilih: ReadonlySet<string>;
  catatan: string;
}

export type BodyPutuskan = { keputusan: "setujui"; hari?: string[]; catatan?: string } | { keputusan: "tolak"; catatan?: string };

/** null = valid. Pesan siap tampil. */
export function validasiKeputusan(i: IsiKeputusan, semuaHari: readonly string[]): string | null {
  if (i.catatan.trim().length > MAKS_CATATAN) return `Catatan maksimal ${MAKS_CATATAN} karakter.`;
  if (i.mode === "sebagian") {
    const sah = i.terpilih.size > 0 && [...i.terpilih].every((t) => semuaHari.includes(t));
    if (!sah) return "Pilih minimal satu hari untuk disetujui, atau pilih Tolak.";
  }
  return null;
}

/**
 * Permintaan ke API. "Sebagian" yang ternyata memilih SEMUA hari dikirim sebagai setujui penuh (tanpa daftar hari),
 * supaya statusnya "Disetujui", bukan "Disetujui sebagian".
 */
export function bangunBodyPutuskan(i: IsiKeputusan, semuaHari: readonly string[]): BodyPutuskan {
  const catatan = i.catatan.trim();
  const tambahan = catatan ? { catatan } : {};
  if (i.mode === "tolak") return { keputusan: "tolak", ...tambahan };
  if (i.mode === "semua") return { keputusan: "setujui", ...tambahan };
  const pilih = semuaHari.filter((t) => i.terpilih.has(t));
  if (pilih.length === semuaHari.length) return { keputusan: "setujui", ...tambahan };
  return { keputusan: "setujui", hari: pilih, ...tambahan };
}

export interface RingkasanAkibat {
  disetujui: number;
  /** Hari lampau yang akan dicatat Alpha karena tidak disetujui dan belum punya catatan. */
  dialpha: number;
  /** Hari disetujui yang tidak mengubah apa pun (sudah ada catatan lain: scan/hadir/dst). */
  tidakBerubah: number;
  /** Hari disetujui yang baru dicatat nanti (hari ini/mendatang). */
  dijadwalkan: number;
}

/** Hitung akibat keputusan atas pratinjau per hari. Mode tolak: semua hari "tidak disetujui". */
export function ringkasAkibat(pratinjau: readonly HariPratinjau[], mode: ModeKeputusan, terpilih: ReadonlySet<string>): RingkasanAkibat {
  const r: RingkasanAkibat = { disetujui: 0, dialpha: 0, tidakBerubah: 0, dijadwalkan: 0 };
  for (const h of pratinjau) {
    const setuju = mode === "semua" || (mode === "sebagian" && terpilih.has(h.tanggal));
    if (setuju) {
      r.disetujui++;
      if (h.jikaDisetujui === "direncanakan") r.dijadwalkan++;
      else if (h.jikaDisetujui !== "ditulis") r.tidakBerubah++;
    } else if (h.jikaTidak === "dialpha") {
      r.dialpha++;
    }
  }
  return r;
}

export function kalimatAkibat(r: RingkasanAkibat): string[] {
  const out: string[] = [];
  if (r.disetujui > 0) out.push(`${r.disetujui} hari disetujui.`);
  if (r.dijadwalkan > 0) out.push(`${r.dijadwalkan} hari ke depan akan dicatat otomatis saat harinya tiba.`);
  if (r.tidakBerubah > 0) out.push(`${r.tidakBerubah} hari sudah punya catatan lain dan tidak diubah.`);
  if (r.dialpha > 0) out.push(`${r.dialpha} hari lampau tanpa catatan akan dicatat Alpha.`);
  return out;
}

/** Keterangan satu baris pratinjau untuk satu hari. */
export function keteranganPratinjau(h: HariPratinjau): { ada: string | null; setuju: string; tidak: string } {
  const setuju: Record<HariPratinjau["jikaDisetujui"], string> = {
    direncanakan: "Dicatat otomatis saat harinya tiba",
    ditulis: "Dicatat sekarang",
    scan_menang: "Sudah ada catatan hadir, tidak diubah",
    sudah_tercatat: "Sudah ada catatan, tidak diubah",
    dialpha: "Dicatat Alpha",
  };
  return {
    ada: h.absensi ? LABEL_ABSENSI[h.absensi] : null,
    setuju: setuju[h.jikaDisetujui],
    tidak: h.jikaTidak === "dialpha" ? "Dicatat Alpha" : "Tidak berubah",
  };
}
