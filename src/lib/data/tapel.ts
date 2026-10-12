import { supabaseAdmin } from "@/lib/supabase/server";
import { urutkanTapelTerbaru, validTapel } from "@/lib/utils/tapel";

/**
 * Daftar tapel dari master (tabel tahun_pelajaran, migrasi 015), terbaru dulu.
 * Tidak di-cache: tabelnya kecil dan hanya dibaca di halaman Pengaturan/filter.
 * Kalau query gagal (mis. migrasi belum dijalankan) mengembalikan array kosong,
 * pemanggil bertanggung jawab menyertakan tapel aktif.
 */
export async function getDaftarTapel(): Promise<string[]> {
  const { data, error } = await supabaseAdmin.from("tahun_pelajaran").select("nama");
  if (error) return [];
  return urutkanTapelTerbaru((data ?? []).map((r) => r.nama));
}

export async function tapelAdaDiMaster(nama: string): Promise<boolean> {
  if (!validTapel(nama)) return false;
  const { data } = await supabaseAdmin.from("tahun_pelajaran").select("nama").eq("nama", nama).maybeSingle();
  return !!data;
}

/** Tambah tapel ke master. `duplikat` true kalau tapel itu sudah ada. */
export async function tambahTapel(nama: string): Promise<{ error: string | null; duplikat: boolean }> {
  if (!validTapel(nama)) return { error: "Format tapel tidak valid.", duplikat: false };
  const { error } = await supabaseAdmin.from("tahun_pelajaran").insert({ nama });
  if (error) {
    // 23505 = unique_violation (primary key nama)
    if (error.code === "23505") return { error: null, duplikat: true };
    return { error: error.message, duplikat: false };
  }
  return { error: null, duplikat: false };
}
