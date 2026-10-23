import { supabaseAdmin } from "@/lib/supabase/server";
import { ambilSemua } from "@/lib/utils/ambil-semua";

/**
 * Id semua siswa yang TIDAK berstatus aktif (lulus/pindah). Dipaginasi (batas 1000 baris PostgREST)
 * dan tanpa .in() berisi ribuan id, jadi aman untuk sekolah besar.
 */
export async function ambilNonaktifIds(): Promise<Set<number>> {
  const rows = await ambilSemua<{ id: number }>((dari, sampai) =>
    supabaseAdmin.from("students").select("id").neq("status", "aktif").order("id").range(dari, sampai)
  );
  return new Set(rows.map((r) => r.id));
}

/**
 * Tanggal pindah satu siswa per tapel (riwayat_kelas.nonaktif_pada, migrasi 020): tapel -> tanggal
 * siswa tampil sampai tanggal itu (absensi pada tanggal itu tidak dihitung). Tapel tanpa tanggal pindah tidak ada di peta. Kalau kolomnya belum
 * ada (migrasi 020 belum dijalankan), hasilnya kosong supaya halaman tetap berfungsi.
 */
export async function ambilBatasPindahSiswa(siswaId: number): Promise<Map<string, string>> {
  const peta = new Map<string, string>();
  const { data, error } = await supabaseAdmin
    .from("riwayat_kelas")
    .select("tapel, nonaktif_pada")
    .eq("siswa_id", siswaId)
    .not("nonaktif_pada", "is", null);
  if (error) {
    console.error("[ambilBatasPindahSiswa]", error.message);
    return peta;
  }
  for (const r of data ?? []) if (r.nonaktif_pada) peta.set(r.tapel as string, r.nonaktif_pada as string);
  return peta;
}
