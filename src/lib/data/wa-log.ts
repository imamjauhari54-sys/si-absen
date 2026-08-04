import { supabaseAdmin } from "@/lib/supabase/server";

export type TipeWaLog = "absen" | "alpha";

export interface WaLogRow {
  id: number;
  namaSiswa: string;
  nomorHp: string | null;
  tipe: TipeWaLog;
  status: "terkirim" | "gagal";
  errorMessage: string | null;
  createdAt: string;
}

/**
 * Catat 1 percobaan kirim WA — dipanggil untuk SETIAP percobaan, baik yang
 * berhasil maupun gagal. Sengaja "fire and forget" & fail-safe sendiri:
 * kalau justru pencatatan lognya yang gagal (misal tabel belum ke-migrate),
 * jangan sampai ikut menggagalkan proses absensi utama — cukup console.error
 * biar ketauan di server log.
 */
export async function catatWaLog(params: {
  siswaId: number;
  namaSiswa: string;
  nomorHp: string | null;
  tipe: TipeWaLog;
  status: "terkirim" | "gagal";
  errorMessage?: string;
}): Promise<void> {
  try {
    await supabaseAdmin.from("wa_log").insert({
      siswa_id: params.siswaId,
      nama_siswa: params.namaSiswa,
      nomor_hp: params.nomorHp,
      tipe: params.tipe,
      status: params.status,
      error_message: params.errorMessage ?? null,
    });
  } catch (e) {
    console.error("[wa_log] gagal mencatat log WA:", e);
  }
}

/** Daftar log WA terbaru, untuk halaman admin. */
export async function getWaLog(limit = 100): Promise<WaLogRow[]> {
  const { data } = await supabaseAdmin
    .from("wa_log")
    .select("id, nama_siswa, nomor_hp, tipe, status, error_message, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((r) => ({
    id: r.id,
    namaSiswa: r.nama_siswa,
    nomorHp: r.nomor_hp,
    tipe: r.tipe as TipeWaLog,
    status: r.status as "terkirim" | "gagal",
    errorMessage: r.error_message,
    createdAt: r.created_at,
  }));
}

/** Ringkasan cepat buat badge peringatan di dashboard: berapa gagal 24 jam terakhir. */
export async function hitungWaGagal24Jam(): Promise<number> {
  const sejak = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabaseAdmin
    .from("wa_log")
    .select("id", { count: "exact", head: true })
    .eq("status", "gagal")
    .gte("created_at", sejak);
  return count ?? 0;
}
