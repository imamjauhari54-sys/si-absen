import { supabaseAdmin } from "@/lib/supabase/server";
import { addDaysJakarta, todayJakarta } from "@/lib/utils/tanggal";
import { hitungAlphaBerturut } from "@/lib/utils/alpha-berturut";
import type { AlphaBerturut } from "@/types";

export { hitungAlphaBerturut } from "@/lib/utils/alpha-berturut";

/**
 * Deteksi siswa yang alpha berturut-turut >= minHari, dihitung mundur dari
 * hari valid terakhir (hari dengan minimal 1 record absensi, bukan Minggu).
 *
 * Wrapper tipis: ambil data dari database, lalu serahkan perhitungannya ke
 * hitungAlphaBerturut() di alpha-berturut.ts (fungsi murni, ada unit test-nya
 * di alpha-berturut.test.ts).
 */
export async function cekAlphaBerturut(
  kelas = "",
  minHari = 3,
  cekHari = 14
): Promise<AlphaBerturut[]> {
  const today = todayJakarta();
  const batas = addDaysJakarta(today, -cekHari);

  // STEP 1: daftar siswa (difilter kelas kalau ada)
  let studentsQuery = supabaseAdmin.from("students").select("id, name, class, foto");
  if (kelas) studentsQuery = studentsQuery.eq("class", kelas);
  const { data: students } = await studentsQuery.order("class").order("name");
  if (!students || students.length === 0) return [];

  const studentIds = students.map((s) => s.id);

  // STEP 2: absensi dalam rentang tanggal untuk siswa-siswa tsb
  const { data: rows } = await supabaseAdmin
    .from("absensi")
    .select("siswa_id, tanggal, status")
    .in("siswa_id", studentIds)
    .gte("tanggal", batas)
    .lte("tanggal", today);

  if (!rows || rows.length === 0) return [];

  return hitungAlphaBerturut(students, rows, minHari);
}
