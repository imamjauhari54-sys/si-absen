import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { StudentFull } from "@/types";

export interface SiswaStats {
  total: number;
  laki: number;
  pr: number;
  berqr: number;
}

function buatToken(id: number, name: string): string {
  const raw = `${id}${name}SIELISA_ABSEN_2025${Math.floor(1000 + Math.random() * 9000)}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export interface StudentsPageResult {
  list: StudentFull[];
  semuaKelas: string[];
  stats: SiswaStats;
  totalPages: number;
  page: number;
}

/**
 * Versi paginasi sungguhan (pakai .range() + count di level database) untuk
 * halaman daftar Data Siswa. Beda dengan getStudentsList() yang narik SEMUA
 * baris sekaligus (dipakai khusus buat cetak ID card massal, yang memang
 * butuh semua siswa dalam 1x proses) — di sini kita cuma ambil data
 * sebanyak satu halaman tabel, plus hitung total/laki-laki lewat query
 * COUNT ringan (tanpa transfer data baris), supaya makin banyak siswa nggak
 * bikin halaman ini makin lambat.
 */
export async function getStudentsPage(
  kelasFilter: string,
  search: string,
  page: number,
  pageSize: number
): Promise<StudentsPageResult> {
  // Daftar semua kelas (untuk pill filter admin) — cuma ambil 1 kolom, ringan.
  // Hanya dari siswa aktif, supaya kelas yang isinya cuma siswa yang sudah
  // lulus/pindah semua tidak nongol lagi di pill filter.
  const { data: kelasRows } = await supabaseAdmin.from("students").select("class").eq("status", "aktif");
  const semuaKelas = Array.from(new Set((kelasRows ?? []).map((r) => r.class))).sort();

  function applyFilter<T>(q: T): T {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = q as any;
    query = query.eq("status", "aktif"); // hanya siswa aktif — yang sudah lulus/pindah punya halaman sendiri
    if (kelasFilter) query = query.eq("class", kelasFilter);
    if (search) query = query.or(`name.ilike.%${search}%,nisn.ilike.%${search}%`);
    return query;
  }

  const [totalRes, lakiRes] = await Promise.all([
    applyFilter(supabaseAdmin.from("students").select("id", { count: "exact", head: true })),
    applyFilter(supabaseAdmin.from("students").select("id", { count: "exact", head: true }).eq("jenis_kelamin", "L")),
  ]);
  const total = totalRes.count ?? 0;
  const laki = lakiRes.count ?? 0;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageAman = Math.min(Math.max(1, page), totalPages);
  const from = (pageAman - 1) * pageSize;
  const to = from + pageSize - 1;

  const query = applyFilter(
    supabaseAdmin.from("students").select("id, name, class, nisn, foto, jenis_kelamin, no_hp_ortu")
  );
  const { data: students } = await query.order("class").order("name").range(from, to);
  const baseList = students ?? [];

  let berqr = 0;
  let list: StudentFull[] = [];

  if (baseList.length > 0) {
    const ids = baseList.map((s) => s.id);
    const { data: tokenRows } = await supabaseAdmin
      .from("absensi_qr_token")
      .select("siswa_id, token")
      .in("siswa_id", ids);
    const tokenMap = new Map((tokenRows ?? []).map((t) => [t.siswa_id, t.token as string]));

    // Auto-generate token untuk siswa di halaman ini yang belum punya.
    const perluToken = baseList.filter((s) => !tokenMap.has(s.id));
    if (perluToken.length > 0) {
      const inserts = perluToken.map((s) => {
        const token = buatToken(s.id, s.name);
        tokenMap.set(s.id, token);
        return { siswa_id: s.id, token };
      });
      await supabaseAdmin.from("absensi_qr_token").upsert(inserts, { onConflict: "siswa_id", ignoreDuplicates: true });
    }

    list = baseList.map((s) => ({
      id: s.id,
      name: s.name,
      class: s.class,
      foto: s.foto,
      nisn: s.nisn,
      jenis_kelamin: s.jenis_kelamin,
      no_hp_ortu: s.no_hp_ortu ?? null,
      token: tokenMap.get(s.id) ?? null,
    }));
  }

  // Jumlah siswa (di keseluruhan hasil filter, bukan cuma halaman ini) yang
  // sudah punya token QR — dihitung lewat COUNT ringan, bukan fetch semua
  // baris. Kalau jumlah hasil filter sangat besar, ini tetap butuh daftar ID
  // (1 kolom) untuk di-JOIN manual ke tabel token, tapi jauh lebih ringan
  // dibanding menarik seluruh kolom siswa.
  if (total > 0) {
    const { data: idRows } = await applyFilter(supabaseAdmin.from("students").select("id"));
    const allIds = (idRows ?? []).map((r: { id: number }) => r.id);
    if (allIds.length > 0) {
      const { count } = await supabaseAdmin
        .from("absensi_qr_token")
        .select("siswa_id", { count: "exact", head: true })
        .in("siswa_id", allIds);
      berqr = count ?? 0;
    }
  }

  return {
    list,
    semuaKelas,
    stats: { total, laki, pr: total - laki, berqr },
    totalPages,
    page: pageAman,
  };
}

/**
 * Port dari query utama siswa.php: daftar siswa + token QR (LEFT JOIN
 * absensi_qr_token), auto-generate token untuk siswa yang belum punya.
 *
 * CATATAN: fungsi ini menarik SEMUA baris yang cocok filter sekaligus (tanpa
 * batas), jadi khusus dipakai untuk kebutuhan yang memang butuh semua data
 * sekaligus (cetak ID card massal). Untuk daftar/tabel di halaman Data Siswa,
 * pakai getStudentsPage() di atas yang sudah true pagination.
 */
export async function getStudentsList(
  kelasFilter: string,
  search: string
): Promise<{ list: StudentFull[]; semuaKelas: string[] }> {
  // Daftar semua kelas (untuk pill filter admin) — hanya dari siswa aktif.
  const { data: kelasRows } = await supabaseAdmin.from("students").select("class").eq("status", "aktif");
  const semuaKelas = Array.from(new Set((kelasRows ?? []).map((r) => r.class))).sort();

  let query = supabaseAdmin
    .from("students")
    .select("id, name, class, nisn, foto, jenis_kelamin, no_hp_ortu")
    .eq("status", "aktif");
  if (kelasFilter) query = query.eq("class", kelasFilter);
  if (search) query = query.or(`name.ilike.%${search}%,nisn.ilike.%${search}%`);
  const { data: students } = await query.order("class").order("name");
  const baseList = students ?? [];

  if (baseList.length === 0) return { list: [], semuaKelas };

  const ids = baseList.map((s) => s.id);
  const { data: tokenRows } = await supabaseAdmin
    .from("absensi_qr_token")
    .select("siswa_id, token")
    .in("siswa_id", ids);
  const tokenMap = new Map((tokenRows ?? []).map((t) => [t.siswa_id, t.token as string]));

  // Auto-generate token untuk siswa yang belum punya
  const perluToken = baseList.filter((s) => !tokenMap.has(s.id));
  if (perluToken.length > 0) {
    const inserts = perluToken.map((s) => {
      const token = buatToken(s.id, s.name);
      tokenMap.set(s.id, token);
      return { siswa_id: s.id, token };
    });
    // Setara INSERT IGNORE: kalau ada race condition bentrok siswa_id unique,
    // biarkan gagal senyap dan token yang dipakai di response tetap konsisten
    // untuk request ini (token baru akan ke-generate ulang di request berikutnya
    // kalau insert ini gagal, karena tidak tersimpan).
    await supabaseAdmin.from("absensi_qr_token").upsert(inserts, { onConflict: "siswa_id", ignoreDuplicates: true });
  }

  const list: StudentFull[] = baseList.map((s) => ({
    id: s.id,
    name: s.name,
    class: s.class,
    foto: s.foto,
    nisn: s.nisn,
    jenis_kelamin: s.jenis_kelamin,
    no_hp_ortu: s.no_hp_ortu ?? null,
    token: tokenMap.get(s.id) ?? null,
  }));

  return { list, semuaKelas };
}

/**
 * Port dari query cetak_idcard.php: mode cetak 1 siswa (by id) atau banyak
 * (by kelas/search). Reuse logic yang sama dengan getStudentsList tapi
 * dengan opsi filter by id tunggal.
 */
export async function getStudentsForPrint(opts: {
  id?: number;
  kelas?: string;
  search?: string;
}): Promise<StudentFull[]> {
  if (opts.id) {
    const query = supabaseAdmin
      .from("students")
      .select("id, name, class, nisn, foto, jenis_kelamin, no_hp_ortu")
      .eq("id", opts.id);
    const { data: students } = await query;
    const baseList = students ?? [];
    if (baseList.length === 0) return [];

    const { data: tokenRows } = await supabaseAdmin
      .from("absensi_qr_token")
      .select("siswa_id, token")
      .eq("siswa_id", opts.id);
    let token = tokenRows?.[0]?.token ?? null;

    if (!token) {
      token = buatToken(baseList[0].id, baseList[0].name);
      await supabaseAdmin
        .from("absensi_qr_token")
        .upsert([{ siswa_id: baseList[0].id, token }], { onConflict: "siswa_id", ignoreDuplicates: true });
    }

    const s = baseList[0];
    return [
      {
        id: s.id,
        name: s.name,
        class: s.class,
        foto: s.foto,
        nisn: s.nisn,
        jenis_kelamin: s.jenis_kelamin,
        no_hp_ortu: s.no_hp_ortu ?? null,
        token,
      },
    ];
  }

  const { list } = await getStudentsList(opts.kelas ?? "", opts.search ?? "");
  return list;
}

/**
 * Daftar siswa yang statusnya sudah 'lulus' atau 'pindah' (soft-deleted),
 * untuk halaman "Siswa Nonaktif". Tidak perlu token QR di sini karena siswa
 * nonaktif tidak boleh dipakai buat scan absen lagi.
 */
export async function getInactiveStudents(search: string): Promise<StudentFull[]> {
  let query = supabaseAdmin
    .from("students")
    .select("id, name, class, nisn, foto, jenis_kelamin, no_hp_ortu, status")
    .in("status", ["lulus", "pindah"]);
  if (search) query = query.or(`name.ilike.%${search}%,nisn.ilike.%${search}%`);
  const { data } = await query.order("class").order("name");

  return (data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    class: s.class,
    foto: s.foto,
    nisn: s.nisn,
    jenis_kelamin: s.jenis_kelamin,
    no_hp_ortu: s.no_hp_ortu ?? null,
    token: null,
    status: s.status as "lulus" | "pindah",
  }));
}

export function hitungStatistikSiswa(list: StudentFull[]): SiswaStats {
  const total = list.length;
  const laki = list.filter((s) => (s.jenis_kelamin ?? "").toLowerCase() === "l").length;
  const berqr = list.filter((s) => !!s.token).length;
  return { total, laki, pr: total - laki, berqr };
}
