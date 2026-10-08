import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Role, UserRow } from "@/types";
import { DEVELOPER_USERNAME } from "@/lib/auth/developer";

/**
 * Daftar semua pengguna (admin & guru) beserta kelas yang diampu (khusus guru).
 * Akun developer (lihat src/lib/auth/developer.ts) SENGAJA di-exclude di sini
 * supaya tidak muncul di halaman Manajemen Pengguna.
 */
export interface UsersPageResult {
  list: UserRow[];
  total: number;
  jumlahAdmin: number;
  jumlahGuru: number;
  totalPages: number;
  page: number;
}

/**
 * Versi paginasi sungguhan (pakai .range() + count di level database) untuk
 * halaman Manajemen Pengguna. total/jumlahAdmin/jumlahGuru dihitung lewat
 * COUNT ringan atas SELURUH hasil filter (bukan cuma satu halaman tabel),
 * supaya KPI ringkas di atas tabel tetap akurat walau jumlah guru+admin
 * makin banyak dan tabelnya sendiri dipaginasi.
 */
export async function getUsersPage(search: string, page: number, pageSize: number): Promise<UsersPageResult> {
  function applyFilter<T>(q: T): T {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = q as any;
    query = query.neq("username", DEVELOPER_USERNAME);
    if (search) query = query.or(`name.ilike.%${search}%,username.ilike.%${search}%`);
    return query;
  }

  const [{ count: total }, { count: jumlahAdmin }] = await Promise.all([
    applyFilter(supabaseAdmin.from("users").select("id", { count: "exact", head: true })),
    applyFilter(supabaseAdmin.from("users").select("id", { count: "exact", head: true }).eq("role", "admin")),
  ]);
  const totalAman = total ?? 0;
  const jumlahAdminAman = jumlahAdmin ?? 0;
  const jumlahGuru = totalAman - jumlahAdminAman;

  const totalPages = Math.max(1, Math.ceil(totalAman / pageSize));
  const pageAman = Math.min(Math.max(1, page), totalPages);
  const from = (pageAman - 1) * pageSize;
  const to = from + pageSize - 1;

  const query = applyFilter(supabaseAdmin.from("users").select("id, name, username, role, foto"));
  const { data: users } = await query.order("name", { ascending: true }).range(from, to);
  const baseList = users ?? [];

  let kelasMap = new Map<number, string>();
  if (baseList.length > 0) {
    const { data: kelasRows } = await supabaseAdmin
      .from("guru_mengajar_kelas")
      .select("guru_id, class")
      .eq("mapel", "Guru Kelas")
      .in(
        "guru_id",
        baseList.map((u) => u.id)
      );
    kelasMap = new Map((kelasRows ?? []).map((row) => [row.guru_id, row.class]));
  }

  const list: UserRow[] = baseList.map((u) => ({
    id: u.id,
    name: u.name,
    username: u.username,
    role: (u.role === "admin" ? "admin" : "guru") as Role,
    foto: u.foto,
    kelas: kelasMap.get(u.id) ?? null,
  }));

  return { list, total: totalAman, jumlahAdmin: jumlahAdminAman, jumlahGuru, totalPages, page: pageAman };
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
 * Semua penugasan mengajar mapel di luar wali kelas untuk sekumpulan guru
 * (1 query), dikelompokkan per guru_id. Dipakai supaya halaman Manajemen
 * Pengguna bisa langsung sediakan data ini ke tiap modal Edit Pengguna tanpa
 * perlu fetch tambahan pas modalnya dibuka.
 *
 * Sengaja discope ke `guruIds` (guru-guru yang sedang tampil di halaman
 * tabel yang sudah dipaginasi), BUKAN semua guru sekolah sekaligus — supaya
 * query ini tetap ringan berapa pun jumlah guru yang menumpuk seiring waktu.
 */
export async function getAllMengajarMap(guruIds: number[]): Promise<Record<number, MengajarRow[]>> {
  if (guruIds.length === 0) return {};

  const { data } = await supabaseAdmin
    .from("guru_mengajar_kelas")
    .select("id, guru_id, class, mapel")
    .neq("mapel", "Guru Kelas")
    .in("guru_id", guruIds)
    .order("class", { ascending: true });

  const map: Record<number, MengajarRow[]> = {};
  for (const row of data ?? []) {
    if (!map[row.guru_id]) map[row.guru_id] = [];
    map[row.guru_id].push({ id: row.id, class: row.class, mapel: row.mapel });
  }
  return map;
}

async function _cekWajibGantiPassword(userId: number): Promise<boolean> {
  const { data } = await supabaseAdmin.from("users").select("must_change_password").eq("id", userId).maybeSingle();
  return data?.must_change_password === true;
}

/**
 * Cek apakah user ini wajib ganti password dulu sebelum lanjut pakai aplikasi.
 * Dipanggil di (app)/layout.tsx SETIAP navigasi halaman, jadi tanpa cache ini
 * jadi 1 query Supabase tambahan di setiap pindah menu (TEMUAN AUDIT #1).
 * Sengaja pakai revalidate pendek (60 detik), BUKAN cache tanpa batas waktu
 * seperti data master lain — ini flag keamanan yang wajar untuk tetap
 * dicek ulang scara berkala, bukan cuma di-invalidate manual saat berubah.
 */
export async function cekWajibGantiPassword(userId: number): Promise<boolean> {
  return unstable_cache(_cekWajibGantiPassword, ["wajib-ganti-password"], {
    tags: [`user-id-${userId}`],
    revalidate: 60,
  })(userId);
}
