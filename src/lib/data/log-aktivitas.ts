import { supabaseAdmin } from "@/lib/supabase/server";

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

const BULAN_INDO = ["", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function formatWaktu(iso: string) {
  const d = new Date(iso);
  const tgl = String(d.getDate()).padStart(2, "0");
  const bln = BULAN_INDO[d.getMonth() + 1];
  const jam = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${tgl} ${bln}, ${jam}`;
}

export async function getLogAktivitas(limit = 20): Promise<LogAktivitasRow[]> {
  const { data } = await supabaseAdmin
    .from("log_aktivitas")
    .select("id, aksi, target, keterangan, created_at, users(name, foto)")
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => {
    const admin = Array.isArray(row.users) ? row.users[0] : row.users;
    return {
      id: row.id,
      aksi: row.aksi,
      target: row.target,
      keterangan: row.keterangan,
      createdAt: formatWaktu(row.created_at),
      namaAdmin: admin?.name || "Sistem",
      fotoAdmin: admin?.foto ?? null,
    };
  });
}
