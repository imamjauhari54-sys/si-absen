import { supabaseAdmin } from "@/lib/supabase/server";
import { addDaysJakarta, formatTglIndo, isoWeekday, todayJakarta } from "@/lib/utils/tanggal";
import type { AlphaBerturut } from "@/types";

/**
 * Port 1:1 dari fungsi cekAlphaBerturut() di includes/cek_alpha.php.
 * Deteksi siswa yang alpha berturut-turut >= minHari, dihitung mundur dari
 * hari valid terakhir (hari dengan minimal 1 record absensi, bukan Minggu).
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

  // STEP 3: tentukan hari_valid = tanggal yang punya minimal 1 record, bukan Minggu
  const tanggalSet = new Set<string>();
  for (const r of rows) {
    if (isoWeekday(r.tanggal) !== 7) tanggalSet.add(r.tanggal);
  }
  const hariValid = Array.from(tanggalSet).sort((a, b) => (a < b ? 1 : -1)); // desc

  if (hariValid.length < minHari) return [];

  // STEP 4: map siswa_id -> tanggal -> status (hanya untuk hari_valid)
  const hariValidSet = new Set(hariValid);
  const mapAbsen = new Map<number, Map<string, string>>();
  for (const r of rows) {
    if (!hariValidSet.has(r.tanggal)) continue;
    if (!mapAbsen.has(r.siswa_id)) mapAbsen.set(r.siswa_id, new Map());
    mapAbsen.get(r.siswa_id)!.set(r.tanggal, r.status);
  }

  // STEP 5: hitung alpha berturut-turut per siswa, mundur dari hari_valid terbaru
  const hasil: AlphaBerturut[] = [];
  for (const s of students) {
    let berturut = 0;
    let tglMulai = "";
    for (const tgl of hariValid) {
      const status = mapAbsen.get(s.id)?.get(tgl);
      if (status === "alpha") {
        berturut++;
        tglMulai = tgl;
      } else {
        break; // status hadir/izin/sakit/null memutus rentetan
      }
    }
    if (berturut >= minHari) {
      hasil.push({
        id: s.id,
        nama: s.name,
        kelas: s.class,
        foto: s.foto,
        hari: berturut,
        sejak: tglMulai,
        sejakFmt: formatTglIndo(tglMulai),
      });
    }
  }

  hasil.sort((a, b) => b.hari - a.hari);
  return hasil;
}
