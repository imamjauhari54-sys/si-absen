import { supabaseAdmin } from "@/lib/supabase/server";
import { formatWaktuWib } from "@/lib/utils/tanggal";

export interface LogAktivitasRow {
  id: number;
  aksi: string;
  target: string | null;
  keterangan: string | null;
  createdAt: string;
  namaAdmin: string;
  fotoAdmin: string | null;
}

/**
 * Catat 1 baris log aktivitas umum (di luar log ubah status absensi yang sudah
 * ada duluan di tabel `absensi_log`). Sengaja "fire and forget" — kalau gagal
 * dicatat, jangan sampai gagalkan aksi utamanya (mis. tambah pengguna tetap
 * berhasil walau logging-nya error).
 */
export async function catatLog(adminId: number, aksi: string, target: string, keterangan: string): Promise<void> {
  try {
    await supabaseAdmin.from("log_aktivitas").insert({ admin_id: adminId, aksi, target, keterangan });
  } catch {
    // sengaja diabaikan, logging tidak boleh menggagalkan aksi utama
  }
}

export interface LogAktivitasPageResult {
  rows: LogAktivitasRow[];
  total: number;
  totalPages: number;
  page: number;
}

/**
 * Versi paginasi sungguhan (pakai .range() + count di level database) untuk
 * halaman Log Aktivitas. Sebelumnya cuma pakai .limit(100) tetap — bikin
 * baris di luar 100 log terbaru tidak bisa dilihat sama sekali begitu log
 * terus bertambah tiap ada aksi admin.
 */
export async function getLogAktivitasPage(page: number, pageSize: number): Promise<LogAktivitasPageResult> {
  const { count } = await supabaseAdmin.from("log_aktivitas").select("id", { count: "exact", head: true });
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageAman = Math.min(Math.max(1, page), totalPages);
  const from = (pageAman - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data } = await supabaseAdmin
    .from("log_aktivitas")
    .select("id, aksi, target, keterangan, created_at, users(name, foto)")
    .order("created_at", { ascending: false })
    .range(from, to);

  const rows: LogAktivitasRow[] = (data ?? []).map((row) => {
    const admin = Array.isArray(row.users) ? row.users[0] : row.users;
    return {
      id: row.id,
      aksi: row.aksi,
      target: row.target,
      keterangan: row.keterangan,
      createdAt: formatWaktuWib(row.created_at),
      namaAdmin: admin?.name || "Sistem",
      fotoAdmin: admin?.foto ?? null,
    };
  });

  return { rows, total, totalPages, page: pageAman };
}
