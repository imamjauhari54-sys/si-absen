import { formatWaktuWib } from "@/lib/utils/tanggal";

/**
 * Asal sebuah baris absensi, untuk subtext di bawah status pada Rekap Harian.
 *
 *  - "edit"     : ada edit manual yang belum dipulihkan (tabel absensi_edit_manual, migrasi 019), atau
 *                 scan_oleh berisi nama guru (data lama, menurut komentar skema migrasi 001).
 *  - "scan"     : dibuat lewat halaman scan — QR ("sistem_otomatis") atau cari manual ("manual_scanner").
 *  - "otomatis" : alpha yang dibuat pekerjaan auto-alpha (scan_oleh = "admin").
 *  - null       : asal tidak diketahui; tidak ditampilkan (tidak menebak).
 *
 * Pengecekan edit manual DIDAHULUKAN: edit manual sengaja tidak mengubah scan_oleh, jadi baris hasil
 * scan yang dikoreksi guru masih berisi "sistem_otomatis". Setelah edit dipulihkan, label kembali
 * mengikuti scan_oleh.
 */
export type SumberAbsen = "scan" | "edit" | "otomatis";

export const LABEL_SUMBER: Record<SumberAbsen, string> = {
  scan: "scan",
  edit: "edit guru",
  otomatis: "otomatis",
};

const SCAN_OLEH_SCAN = new Set(["sistem_otomatis", "manual_scanner"]);
const SCAN_OLEH_AUTO_ALPHA = "admin";

export function tentukanSumberAbsen(a: { scanOleh: string | null | undefined; adaEditManual: boolean }): SumberAbsen | null {
  if (a.adaEditManual) return "edit";
  const s = (a.scanOleh ?? "").trim();
  if (!s) return null;
  if (SCAN_OLEH_SCAN.has(s)) return "scan";
  if (s === SCAN_OLEH_AUTO_ALPHA) return "otomatis";
  return "edit"; // nama guru dari data lama
}

/** Teks tooltip yang menjelaskan label; null kalau tidak ada subtext. */
export function keteranganSumber(
  sumber: SumberAbsen | null,
  info: { scanOleh?: string | null; editorNama?: string | null; dieditAt?: string | null }
): string | null {
  if (!sumber) return null;
  if (sumber === "otomatis") return "Dibuat otomatis oleh sistem (auto-alpha)";
  if (sumber === "scan") {
    return info.scanOleh === "manual_scanner" ? "Dicari manual di halaman scan" : "Scan QR";
  }
  // edit
  if (info.editorNama || info.dieditAt) {
    const bagian = [
      info.editorNama ? `oleh ${info.editorNama}` : null,
      info.dieditAt ? `${formatWaktuWib(info.dieditAt)} WIB` : null,
    ].filter(Boolean);
    return `Diedit ${bagian.join(", ")}`;
  }
  return info.scanOleh ? `Diubah oleh ${info.scanOleh}` : "Diedit manual";
}
