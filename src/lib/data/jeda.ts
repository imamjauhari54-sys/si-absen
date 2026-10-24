import { supabaseAdmin } from "@/lib/supabase/server";
import { ambilSemua } from "@/lib/utils/ambil-semua";
import { kelompokkanJeda, type JedaSiswa } from "@/lib/utils/siswa-harian";

/**
 * Jeda tertutup siswa (riwayat_status_siswa, mode kembali_setelah_jeda, migrasi 025): [tanggal pindah, tanggal kembali).
 * Aturan memakainya ada di siswa-harian.ts; angka semester dihitung database (hari_dihitung_siswa,
 * rekap_history_siswa) dengan aturan yang sama. Kalau tabelnya belum ada (migrasi 025 belum dijalankan)
 * hasilnya kosong — memang belum mungkin ada jeda.
 */
type BarisJeda = { siswa_id: number; pindah_pada: string | null; kembali_pada: string | null; alasan: "lulus" | "pindah" | null };

const KOLOM = "siswa_id, pindah_pada, kembali_pada, alasan";

/** Semua jeda pada satu tapel: siswa_id -> daftar jeda. Dipakai Rekap Harian/Bulanan dan History. */
export async function ambilJedaTapel(tapel: string): Promise<Map<number, JedaSiswa[]>> {
  if (!tapel) return new Map();
  try {
    const rows = await ambilSemua<BarisJeda>((dari, sampai) =>
      supabaseAdmin
        .from("riwayat_status_siswa")
        .select(KOLOM)
        .eq("mode", "kembali_setelah_jeda")
        .eq("tapel", tapel)
        .order("id")
        .range(dari, sampai)
    );
    return kelompokkanJeda(rows);
  } catch (e) {
    console.error("[ambilJedaTapel]", e instanceof Error ? e.message : e);
    return new Map();
  }
}

/** Semua jeda satu siswa (semua tapel; tanggalnya absolut). Dipakai Portal Siswa. */
export async function ambilJedaSiswa(siswaId: number): Promise<JedaSiswa[]> {
  const { data, error } = await supabaseAdmin
    .from("riwayat_status_siswa")
    .select(KOLOM)
    .eq("mode", "kembali_setelah_jeda")
    .eq("siswa_id", siswaId)
    .order("pindah_pada");
  if (error) {
    console.error("[ambilJedaSiswa]", error.message);
    return [];
  }
  return kelompokkanJeda((data ?? []) as BarisJeda[]).get(siswaId) ?? [];
}
