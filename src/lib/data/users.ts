import { supabaseAdmin } from "@/lib/supabase/server";
import type { Role, UserRow } from "@/types";

/** Daftar semua pengguna (admin & guru) beserta kelas yang diampu (khusus guru). */
export async function getUsersList(search = ""): Promise<UserRow[]> {
  let query = supabaseAdmin.from("users").select("id, name, username, role, foto").order("name", { ascending: true });
  if (search) query = query.or(`name.ilike.%${search}%,username.ilike.%${search}%`);

  const { data: users } = await query;
  const list = users ?? [];
  if (list.length === 0) return [];

  const { data: kelasRows } = await supabaseAdmin
    .from("guru_mengajar_kelas")
    .select("guru_id, class")
    .eq("mapel", "Guru Kelas")
    .in(
      "guru_id",
      list.map((u) => u.id)
    );

  const kelasMap = new Map<number, string>();
  for (const row of kelasRows ?? []) kelasMap.set(row.guru_id, row.class);

  return list.map((u) => ({
    id: u.id,
    name: u.name,
    username: u.username,
    role: (u.role === "admin" ? "admin" : "guru") as Role,
    foto: u.foto,
    kelas: kelasMap.get(u.id) ?? null,
  }));
}

/** Daftar kelas unik yang sudah pernah dipilih sebagai wali kelas (termasuk yang belum ada siswanya). */
export async function getSemuaKelasGuru(): Promise<string[]> {
  const { data } = await supabaseAdmin.from("guru_mengajar_kelas").select("class").eq("mapel", "Guru Kelas");
  return Array.from(new Set((data ?? []).map((r) => r.class as string)));
}

/** Cek live ke DB apakah user ini wajib ganti password dulu sebelum lanjut pakai aplikasi. */
export async function cekWajibGantiPassword(userId: number): Promise<boolean> {
  const { data } = await supabaseAdmin.from("users").select("must_change_password").eq("id", userId).maybeSingle();
  return data?.must_change_password === true;
}
