/**
 * Isi pesan WhatsApp keputusan pengajuan izin/sakit (murni, tanpa akses database).
 * PRIVASI: alasan pengajuan (bisa berisi info kesehatan) dan lampiran TIDAK PERNAH masuk pesan; hanya jenis, tanggal,
 * keputusan, dan catatan yang memang ditulis wali kelas untuk orang tua.
 */
import { formatTanggalPendek } from "@/lib/utils/pengajuan-form";

export type StatusKeputusan = "disetujui" | "disetujui_sebagian" | "ditolak";

export const STATUS_KEPUTUSAN: readonly StatusKeputusan[] = ["disetujui", "disetujui_sebagian", "ditolak"];

export function statusKeputusanValid(s: unknown): s is StatusKeputusan {
  return typeof s === "string" && (STATUS_KEPUTUSAN as readonly string[]).includes(s);
}

export interface HariKeputusan {
  tanggal: string;
  disetujui: boolean | null;
  hasil: string | null;
}

export interface DataPesanKeputusan {
  namaSiswa: string;
  kelas: string;
  jenis: "izin" | "sakit";
  status: StatusKeputusan;
  hari: readonly HariKeputusan[];
  catatan: string | null;
  namaSekolah: string;
}

/** Sampai 5 tanggal disebut satu per satu; lebih dari itu diringkas supaya pesan tetap pendek. */
export function sebutTanggal(tanggal: readonly string[]): string {
  const t = [...tanggal].sort();
  if (t.length === 0) return "-";
  if (t.length <= 5) return t.map(formatTanggalPendek).join(", ");
  return `${t.length} hari (${formatTanggalPendek(t[0])} s.d. ${formatTanggalPendek(t[t.length - 1])})`;
}

export function susunPesanKeputusan(d: DataPesanKeputusan): string {
  const jenis = d.jenis === "sakit" ? "SAKIT" : "IZIN";
  const semua = d.hari.map((h) => h.tanggal);
  const setuju = d.hari.filter((h) => h.disetujui === true).map((h) => h.tanggal);
  const tidak = d.hari.filter((h) => h.disetujui === false).map((h) => h.tanggal);
  const alpha = d.hari.filter((h) => h.disetujui === false && h.hasil === "dialpha").map((h) => h.tanggal);

  const kepala = `Assalamu'alaikum, pengajuan *${jenis}* untuk Ananda *${d.namaSiswa}* (Kelas ${d.kelas})`;
  const baris: string[] = [];
  if (d.status === "disetujui") {
    baris.push(`${kepala} pada ${sebutTanggal(semua)} telah *DISETUJUI* oleh wali kelas.`);
  } else if (d.status === "disetujui_sebagian") {
    baris.push(`${kepala} telah *DISETUJUI SEBAGIAN* oleh wali kelas.`);
    baris.push(`Disetujui: ${sebutTanggal(setuju)}.`);
    baris.push(`Tidak disetujui: ${sebutTanggal(tidak)}.`);
  } else {
    baris.push(`${kepala} pada ${sebutTanggal(semua)} *TIDAK DISETUJUI* oleh wali kelas.`);
  }
  if (d.status !== "disetujui" && alpha.length > 0) {
    baris.push(`Tanggal yang sudah lewat tanpa keterangan dicatat Alpha: ${sebutTanggal(alpha)}.`);
  }
  const catatan = (d.catatan ?? "").replace(/\s+/g, " ").trim();
  if (catatan) baris.push(`Catatan wali kelas: ${catatan}`);

  return `${baris.join("\n")}\n\n${d.namaSekolah}\n_Pesan otomatis dari SI-ABSEN, mohon tidak dibalas._`;
}
