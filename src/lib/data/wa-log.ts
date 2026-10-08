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

export interface WaLogPageResult {
  rows: WaLogRow[];
  total: number;
  totalPages: number;
  page: number;
}

/**
 * Versi paginasi sungguhan (pakai .range() + count di level database) untuk
 * halaman Log Notifikasi WA. Sebelumnya cuma pakai .limit(100/150) tetap —
 * begitu jumlah percobaan kirim WA (yang dicatat untuk SETIAP absen siswa)
 * lewat dari batas itu, log-log lama jadi tidak bisa diakses lagi.
 */
export async function getWaLogPage(page: number, pageSize: number): Promise<WaLogPageResult> {
  const { count } = await supabaseAdmin.from("wa_log").select("id", { count: "exact", head: true });
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageAman = Math.min(Math.max(1, page), totalPages);
  const from = (pageAman - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data } = await supabaseAdmin
    .from("wa_log")
    .select("id, nama_siswa, nomor_hp, tipe, status, error_message, created_at")
    .order("created_at", { ascending: false })
    .range(from, to);

  const rows: WaLogRow[] = (data ?? []).map((r) => ({
    id: r.id,
    namaSiswa: r.nama_siswa,
    nomorHp: r.nomor_hp,
    tipe: r.tipe as TipeWaLog,
    status: r.status as "terkirim" | "gagal",
    errorMessage: r.error_message,
    createdAt: r.created_at,
  }));

  return { rows, total, totalPages, page: pageAman };
}

/** Jumlah gagal kirim WA di antara SELURUH log (bukan cuma halaman yang sedang tampil), untuk badge peringatan. */
export async function hitungWaGagalTotal(): Promise<number> {
  const { count } = await supabaseAdmin.from("wa_log").select("id", { count: "exact", head: true }).eq("status", "gagal");
  return count ?? 0;
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
