import { supabaseAdmin } from "@/lib/supabase/server";
import type { Role, UserRow } from "@/types";
import { DEVELOPER_USERNAME } from "@/lib/auth/developer";

/**
 * Daftar semua pengguna (admin & guru) beserta kelas yang diampu (khusus guru).
 * Akun developer (lihat src/lib/auth/developer.ts) SENGAJA di-exclude di sini
 * supaya tidak muncul di halaman Manajemen Pengguna.
 */
export async function getUsersList(search = ""): Promise<UserRow[]> {
  let query = supabaseAdmin
    .from("users")
    .select("id, name, username, role, foto")
    .neq("username", DEVELOPER_USERNAME)
    .order("name", { ascending: true });
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

export interface MengajarRow {
  id: number;
  class: string;
  mapel: string;
}

/**
 * Semua penugasan mengajar mapel di luar wali kelas, untuk SEMUA guru
 * sekaligus (1 query), dikelompokkan per guru_id. Dipakai supaya halaman
 * Manajemen Pengguna bisa langsung sediakan data ini ke tiap modal Edit
 * Pengguna tanpa perlu fetch tambahan pas modalnya dibuka.
 */
export async function getAllMengajarMap(): Promise<Record<number, MengajarRow[]>> {
  const { data } = await supabaseAdmin
    .from("guru_mengajar_kelas")
    .select("id, guru_id, class, mapel")
    .neq("mapel", "Guru Kelas")
    .order("class", { ascending: true });

  const map: Record<number, MengajarRow[]> = {};
  for (const row of data ?? []) {
    if (!map[row.guru_id]) map[row.guru_id] = [];
    map[row.guru_id].push({ id: row.id, class: row.class, mapel: row.mapel });
  }
  return map;
}

/** Cek live ke DB apakah user ini wajib ganti password dulu sebelum lanjut pakai aplikasi. */
export async function cekWajibGantiPassword(userId: number): Promise<boolean> {
  const { data } = await supabaseAdmin.from("users").select("must_change_password").eq("id", userId).maybeSingle();
  return data?.must_change_password === true;
}
