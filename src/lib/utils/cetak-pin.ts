/**
 * Logika murni halaman kelola/cetak PIN orang tua. PIN polos hanya hidup di memori halaman setelah dibuat/direset
 * (tidak ke URL, localStorage, atau log) dan hilang saat halaman ditutup.
 */
export interface PinBaru {
  siswaId: number;
  nama: string;
  kelas: string;
  pin: string;
}

export const SLIP_PER_HALAMAN = 8;

/** 482913 -> "482 913" (lebih mudah dibaca dan disalin orang tua). */
export function formatPinTampil(pin: string): string {
  return /^[0-9]{6}$/.test(pin) ? `${pin.slice(0, 3)} ${pin.slice(3)}` : pin;
}

export function bagiHalaman<T>(daftar: readonly T[], per: number = SLIP_PER_HALAMAN): T[][] {
  const n = Math.max(1, Math.floor(per));
  const out: T[][] = [];
  for (let i = 0; i < daftar.length; i += n) out.push(daftar.slice(i, i + n));
  return out;
}

/** Validasi jawaban API (jangan percaya bentuknya): hanya entri lengkap dengan PIN 6 digit yang dipakai. */
export function bacaPinBaru(mentah: unknown): PinBaru[] {
  if (!Array.isArray(mentah)) return [];
  const out: PinBaru[] = [];
  for (const r of mentah) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (typeof o.siswaId !== "number" || typeof o.pin !== "string" || !/^[0-9]{6}$/.test(o.pin)) continue;
    out.push({ siswaId: o.siswaId, nama: typeof o.nama === "string" ? o.nama : "", kelas: typeof o.kelas === "string" ? o.kelas : "", pin: o.pin });
  }
  return out;
}

/** Gabungkan PIN dari beberapa pembuatan; untuk siswa yang sama PIN terbaru menang (yang lama sudah mati di server). */
export function gabungPin(lama: readonly PinBaru[], baru: readonly PinBaru[]): PinBaru[] {
  const peta = new Map<number, PinBaru>();
  for (const p of lama) peta.set(p.siswaId, p);
  for (const p of baru) peta.set(p.siswaId, p);
  return [...peta.values()].sort((a, b) => a.nama.localeCompare(b.nama, "id"));
}

export type KeadaanPin = "belum" | "baru" | "belum_dibagikan" | "dibagikan" | "terkunci";

export const LABEL_KEADAAN_PIN: Record<KeadaanPin, string> = {
  belum: "Belum ada PIN",
  baru: "PIN baru (belum ditandai dibagikan)",
  belum_dibagikan: "Belum dibagikan",
  dibagikan: "Sudah dibagikan",
  terkunci: "Terkunci sementara",
};

export function keadaanPin(s: { pinDiatur: boolean; dibagikanPada: string | null; terkunciSampai: string | null }, adaPinBaru: boolean): KeadaanPin {
  if (!s.pinDiatur) return "belum";
  if (s.terkunciSampai) return "terkunci";
  if (adaPinBaru) return "baru";
  return s.dibagikanPada ? "dibagikan" : "belum_dibagikan";
}
