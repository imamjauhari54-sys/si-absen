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

/**
 * Port dari query utama siswa.php: daftar siswa + token QR (LEFT JOIN
 * absensi_qr_token), auto-generate token untuk siswa yang belum punya.
 */
export async function getStudentsList(
  kelasFilter: string,
  search: string
): Promise<{ list: StudentFull[]; semuaKelas: string[] }> {
  // Daftar semua kelas (untuk pill filter admin)
  const { data: kelasRows } = await supabaseAdmin.from("students").select("class");
  const semuaKelas = Array.from(new Set((kelasRows ?? []).map((r) => r.class))).sort();

  let query = supabaseAdmin.from("students").select("id, name, class, nisn, foto, jenis_kelamin, no_hp_ortu");
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

export function hitungStatistikSiswa(list: StudentFull[]): SiswaStats {
  const total = list.length;
  const laki = list.filter((s) => (s.jenis_kelamin ?? "").toLowerCase() === "l").length;
  const berqr = list.filter((s) => !!s.token).length;
  return { total, laki, pr: total - laki, berqr };
}
