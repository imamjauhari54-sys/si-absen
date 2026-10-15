import "server-only";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getKelasWali } from "@/lib/data/wali-kelas";
import { putuskanAksesSiswa } from "@/lib/utils/absen-scan";
import type { SessionPayload } from "@/types";

/**
 * Otorisasi per kelas — SATU pintu untuk semua halaman & API.
 *
 * Prinsip:
 *  1. Kelas guru dibaca dari DATABASE (getKelasWali), bukan session.kelas, karena JWT bisa basi
 *     sampai 8 jam setelah admin memindahkan guru.
 *  2. FAIL-CLOSED: guru tanpa kelas wali = tidak boleh apa pun. Jangan pernah meneruskan kelas
 *     kosong ("") ke query data, karena di banyak fungsi data string kosong berarti "semua kelas".
 */

/** Batas akses sebuah sesi: admin = semua kelas; guru = satu kelas (atau null kalau bukan wali kelas). */
export type BatasKelas = { semua: true } | { semua: false; kelas: string | null };

export async function getBatasKelas(session: SessionPayload): Promise<BatasKelas> {
  if (session.role === "admin") return { semua: true };
  if (session.role !== "guru") return { semua: false, kelas: null };
  return { semua: false, kelas: await getKelasWali(session.userId) };
}

/** Kelas wali dari DB untuk guru; null untuk admin (tidak dibatasi) atau guru tanpa kelas. */
export async function getKelasWaliSesi(session: SessionPayload): Promise<string | null> {
  return session.role === "guru" ? getKelasWali(session.userId) : null;
}

export type HasilAksesSiswa =
  | { ok: true; siswa: { id: number; name: string; class: string; status: string | null } }
  | { ok: false; status: 403 | 404; message: string };

/** Cek apakah sesi boleh mengakses satu siswa (baca kelas siswa & kelas wali langsung dari DB). */
export async function assertBolehAksesSiswa(session: SessionPayload, siswaId: number): Promise<HasilAksesSiswa> {
  const [{ data: siswa }, kelasWali] = await Promise.all([
    supabaseAdmin.from("students").select("id, name, class, status").eq("id", siswaId).maybeSingle(),
    getKelasWaliSesi(session),
  ]);
  const putusan = putuskanAksesSiswa(session.role, kelasWali, siswa ?? null);
  if (!putusan.ok) return putusan;
  return { ok: true, siswa: siswa! };
}

/**
 * Untuk Server Component halaman. Admin -> "" (artinya semua kelas, filter dari query string).
 * Guru -> kelas wali dari DB. Guru tanpa kelas -> redirect ke /tanpa-kelas (tidak pernah
 * mengembalikan "" untuk guru, jadi tidak mungkin bocor jadi "semua kelas").
 */
export async function kelasHalamanAtauRedirect(session: SessionPayload): Promise<string> {
  if (session.role === "admin") return "";
  const kelas = await getKelasWali(session.userId);
  if (!kelas) redirect("/tanpa-kelas");
  return kelas;
}
