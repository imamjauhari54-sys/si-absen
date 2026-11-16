import "server-only";
import { assertBolehAksesSiswa } from "@/lib/auth/akses-kelas";
import { ambilSiswaIdPengajuan } from "@/lib/data/pengajuan";
import type { SessionPayload } from "@/types";

export type HasilAksesPengajuan =
  | { ok: true; siswaId: number }
  | { ok: false; status: 403 | 404; message: string };

/**
 * Otorisasi per pengajuan: admin = semua; guru = hanya pengajuan siswa di kelas wali-nya (dibaca dari DB, bukan JWT).
 * Memakai pintu yang sama dengan edit absensi (assertBolehAksesSiswa). Untuk guru, "pengajuan tidak ada" dan "pengajuan
 * kelas lain" dijawab SAMA (403) supaya ID pengajuan tidak bisa ditebak-tebak; hanya admin yang dapat 404.
 */
export async function assertBolehAksesPengajuan(session: SessionPayload, pengajuanId: number): Promise<HasilAksesPengajuan> {
  const siswaId = await ambilSiswaIdPengajuan(pengajuanId);
  if (siswaId === null) {
    return session.role === "admin"
      ? { ok: false, status: 404, message: "Pengajuan tidak ditemukan" }
      : { ok: false, status: 403, message: "Pengajuan ini bukan dari kelas Anda." };
  }
  const akses = await assertBolehAksesSiswa(session, siswaId);
  if (!akses.ok) return { ok: false, status: akses.status, message: akses.message };
  return { ok: true, siswaId };
}
