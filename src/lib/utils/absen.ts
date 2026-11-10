import { supabaseAdmin } from "@/lib/supabase/server";
import { addDaysJakarta, todayJakarta } from "@/lib/utils/tanggal";
import { hitungAlphaBerturut } from "@/lib/utils/alpha-berturut";
import { ambilSemua } from "@/lib/utils/ambil-semua";
import { getLiburSet } from "@/lib/data/hari-libur";
import { ambilJedaSejak } from "@/lib/data/jeda";
import { ambilMenungguBanyak } from "@/lib/data/rekap-siswa";
import { dalamJeda } from "@/lib/utils/siswa-harian";
import type { AlphaBerturut } from "@/types";

export { hitungAlphaBerturut } from "@/lib/utils/alpha-berturut";

/**
 * Deteksi siswa yang alpha berturut-turut >= minHari, dihitung mundur dari
 * hari valid terakhir (hari dengan minimal 1 record absensi, bukan Minggu, bukan hari libur).
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

  // STEP 1: daftar siswa AKTIF (difilter kelas kalau ada). Siswa yang sudah pindah/lulus tidak lagi
  // perlu ditindaklanjuti, jadi tidak ikut peringatan alpha berturut-turut.
  let studentsQuery = supabaseAdmin.from("students").select("id, name, class, foto").eq("status", "aktif");
  if (kelas) studentsQuery = studentsQuery.eq("class", kelas);
  const { data: students } = await studentsQuery.order("class").order("name");
  if (!students || students.length === 0) return [];

  const studentIds = students.map((s) => s.id);

  // STEP 2: absensi dalam rentang tanggal untuk siswa-siswa tsb.
  // Dipaginasi: 14 hari x >70 siswa sudah melewati batas 1000 baris PostgREST,
  // dan baris yang terpotong membuat rentetan alpha salah hitung.
  const [rows, tanggalLibur, jedaMap, menungguMap] = await Promise.all([
    ambilSemua<{ siswa_id: number; tanggal: string; status: string; keterangan: string | null }>((dari, sampai) =>
      supabaseAdmin
        .from("absensi")
        .select("siswa_id, tanggal, status, keterangan")
        .in("siswa_id", studentIds)
        .gte("tanggal", batas)
        .lte("tanggal", today)
        .order("id")
        .range(dari, sampai)
    ),
    getLiburSet(batas, today),
    ambilJedaSejak(batas),
    ambilMenungguBanyak(studentIds, batas, today),
  ]);

  if (rows.length === 0) return [];

  // Hari jeda (migrasi 025) dan hari MENUNGGU persetujuan pengajuan (migrasi 027) tidak dihitung untuk siswa itu:
  // dilewati, bukan Alpha dan bukan pemutus rentetan. Pengajuan yang ditolak/dibatalkan tidak lagi Menunggu.
  return hitungAlphaBerturut(students, rows, minHari, tanggalLibur, {
    abaikan: (siswaId, tanggal) => dalamJeda(jedaMap.get(siswaId), tanggal) || !!menungguMap.get(siswaId)?.has(tanggal),
  });
}
