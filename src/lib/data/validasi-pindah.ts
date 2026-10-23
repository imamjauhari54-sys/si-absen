import { supabaseAdmin } from "@/lib/supabase/server";
import { getLiburSet } from "@/lib/data/hari-libur";
import { periksaTanggalPindah, type HasilPeriksaTanggalPindah } from "@/lib/utils/tanggal-keluar";

/** Tapel terakhir siswa (baris riwayat_kelas terbaru) — tempat tanggal pindah disimpan saat siswa non-aktif. */
export async function getTapelTerakhirSiswa(siswaId: number): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("riwayat_kelas")
    .select("tapel")
    .eq("siswa_id", siswaId)
    .order("tapel", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.tapel as string | undefined) ?? null;
}

/** Ambil data pendukung lalu periksa tanggal pindah (lihat periksaTanggalPindah). */
export async function validasiTanggalPindah(siswaId: number, tanggal: string, tapel: string): Promise<HasilPeriksaTanggalPindah> {
  const [{ data: absensi }, liburSet] = await Promise.all([
    supabaseAdmin.from("absensi").select("tanggal").eq("siswa_id", siswaId).eq("tapel", tapel).gte("tanggal", tanggal),
    getLiburSet(tanggal),
  ]);
  const libur = new Set([...liburSet]);
  return periksaTanggalPindah({
    tanggal,
    tapel,
    tanggalAbsensiSesudah: (absensi ?? []).map((r) => r.tanggal as string),
    liburSet: libur,
  });
}
