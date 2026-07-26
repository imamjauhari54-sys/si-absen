import { formatTglIndo, isoWeekday } from "@/lib/utils/tanggal";
import type { AlphaBerturut } from "@/types";

export type SiswaRingkas = { id: number; name: string; class: string; foto: string | null };
export type BarisAbsensi = { siswa_id: number; tanggal: string; status: string };

/**
 * Bagian "hitung" murni dari cekAlphaBerturut (lihat src/lib/utils/absen.ts)
 * — tanpa database, cuma ngolah data yang sudah ada. Sengaja dipisah ke
 * modul sendiri (tidak import supabaseAdmin sama sekali) supaya bisa
 * di-unit-test tanpa perlu mocking Supabase atau env var database.
 *
 * Port 1:1 dari fungsi cekAlphaBerturut() di includes/cek_alpha.php.
 */
export function hitungAlphaBerturut(
  students: SiswaRingkas[],
  rows: BarisAbsensi[],
  minHari: number
): AlphaBerturut[] {
  if (rows.length === 0) return [];

  // hari_valid = tanggal yang punya minimal 1 record, bukan Minggu
  const tanggalSet = new Set<string>();
  for (const r of rows) {
    if (isoWeekday(r.tanggal) !== 7) tanggalSet.add(r.tanggal);
  }
  const hariValid = Array.from(tanggalSet).sort((a, b) => (a < b ? 1 : -1)); // desc

  if (hariValid.length < minHari) return [];

  // map siswa_id -> tanggal -> status (hanya untuk hari_valid)
  const hariValidSet = new Set(hariValid);
  const mapAbsen = new Map<number, Map<string, string>>();
  for (const r of rows) {
    if (!hariValidSet.has(r.tanggal)) continue;
    if (!mapAbsen.has(r.siswa_id)) mapAbsen.set(r.siswa_id, new Map());
    mapAbsen.get(r.siswa_id)!.set(r.tanggal, r.status);
  }

  // hitung alpha berturut-turut per siswa, mundur dari hari_valid terbaru
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
