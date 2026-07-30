import { supabaseAdmin } from "@/lib/supabase/server";
import { addDaysJakarta, hariSingkat } from "@/lib/utils/tanggal";
import type { AbsensiSetting, RecentScan, StatusAbsen, Student, TrenHarian } from "@/types";

export async function getNamaSekolah(fallback: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("settings")
    .select("value")
    .eq("key", "nama_sekolah")
    .maybeSingle();
  return data?.value || fallback;
}

export async function getFotoUser(username: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("users")
    .select("foto")
    .eq("username", username)
    .maybeSingle();
  return data?.foto || null;
}

export async function getAbsensiSetting(): Promise<AbsensiSetting> {
  const { data } = await supabaseAdmin.from("absensi_setting").select("*").limit(1).maybeSingle();
  return {
    jam_masuk: data?.jam_masuk ?? "07:00:00",
    batas_terlambat: data?.batas_terlambat ?? "07:15:00",
    jam_pulang_mulai: data?.jam_pulang_mulai ?? "11:30:00",
    tapel: data?.tapel ?? "2025/2026",
    semester: data?.semester ?? "genap",
    durasi_kunci_menit: data?.durasi_kunci_menit ?? 120,
    toleransi_pagi_menit: data?.toleransi_pagi_menit ?? 60,
  };
}

export async function cekHariLibur(
  today: string
): Promise<{ isLibur: boolean; pesanLibur: string }> {
  // Minggu selalu libur
  const d = new Date(`${today}T00:00:00Z`);
  if (d.getUTCDay() === 0) {
    return { isLibur: true, pesanLibur: "Libur Akhir Pekan (Minggu)" };
  }

  const { data } = await supabaseAdmin
    .from("hari_libur")
    .select("keterangan")
    .eq("tanggal", today)
    .maybeSingle();

  if (data) return { isLibur: true, pesanLibur: data.keterangan };
  return { isLibur: false, pesanLibur: "" };
}

export interface StatHariIni {
  hadir: number;
  terlambat: number;
  izin: number;
  sakit: number;
  alpha: number;
}

/** Ambil total siswa (opsional filter kelas untuk guru) & statistik status hari ini. */
export async function getStatistikHariIni(
  today: string,
  kelas: string,
  isAdmin: boolean
): Promise<{ totalSiswa: number; stat: StatHariIni }> {
  let studentsQuery = supabaseAdmin.from("students").select("id", { count: "exact", head: true });
  if (!isAdmin && kelas) studentsQuery = studentsQuery.eq("class", kelas);
  const { count } = await studentsQuery;
  const totalSiswa = count ?? 0;

  let studentIds: number[] | null = null;
  if (!isAdmin && kelas) {
    const { data } = await supabaseAdmin.from("students").select("id").eq("class", kelas);
    studentIds = (data ?? []).map((s) => s.id);
  }

  let absensiQuery = supabaseAdmin.from("absensi").select("status").eq("tanggal", today);
  if (studentIds) absensiQuery = absensiQuery.in("siswa_id", studentIds);
  const { data: rows } = await absensiQuery;

  const stat: StatHariIni = { hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpha: 0 };
  for (const r of rows ?? []) {
    const st = (r.status as StatusAbsen)?.toLowerCase() as keyof StatHariIni;
    if (st in stat) stat[st]++;
  }

  return { totalSiswa, stat };
}

/** Tren kehadiran (hadir+terlambat) 7 hari terakhir. */
export async function getTren7Hari(
  today: string,
  kelas: string,
  isAdmin: boolean,
  totalSiswa: number
): Promise<TrenHarian[]> {
  let studentIds: number[] | null = null;
  if (!isAdmin && kelas) {
    const { data } = await supabaseAdmin.from("students").select("id").eq("class", kelas);
    studentIds = (data ?? []).map((s) => s.id);
  }

  const mulai = addDaysJakarta(today, -6);
  let query = supabaseAdmin
    .from("absensi")
    .select("tanggal, status")
    .gte("tanggal", mulai)
    .lte("tanggal", today)
    .in("status", ["hadir", "terlambat"]);
  if (studentIds) query = query.in("siswa_id", studentIds);
  const { data: rows } = await query;

  const perTanggal = new Map<string, number>();
  for (const r of rows ?? []) {
    perTanggal.set(r.tanggal, (perTanggal.get(r.tanggal) ?? 0) + 1);
  }

  const tren: TrenHarian[] = [];
  for (let i = 6; i >= 0; i--) {
    const tgl = addDaysJakarta(today, -i);
    tren.push({
      tgl: hariSingkat(tgl),
      n: perTanggal.get(tgl) ?? 0,
      total: totalSiswa,
      isToday: i === 0,
    });
  }
  return tren;
}

/** 6 aktivitas absen terbaru hari ini (selain alpha). */
export async function getRecentScans(today: string, kelas: string, isAdmin: boolean): Promise<RecentScan[]> {
  let studentIds: number[] | null = null;
  if (!isAdmin && kelas) {
    const { data } = await supabaseAdmin.from("students").select("id").eq("class", kelas);
    studentIds = (data ?? []).map((s) => s.id);
  }

  let query = supabaseAdmin
    .from("absensi")
    .select("jam_masuk, status, created_at, students(name, class, foto)")
    .eq("tanggal", today)
    .neq("status", "alpha")
    .order("created_at", { ascending: false })
    .limit(6);
  if (studentIds) query = query.in("siswa_id", studentIds);
  const { data } = await query;

  return (data ?? []).map((r) => {
    // Supabase JS mengembalikan relasi 1-1 sebagai objek (atau array tergantung FK);
    // handle keduanya biar aman.
    const s = Array.isArray(r.students) ? r.students[0] : r.students;
    return {
      jam_masuk: r.jam_masuk,
      status: r.status as StatusAbsen,
      created_at: r.created_at,
      name: s?.name ?? "-",
      class: s?.class ?? "-",
      foto: s?.foto ?? null,
    };
  });
}

/** Siswa yang belum ada record absensi hari ini (maks 8, untuk kartu "Perlu Perhatian"). */
export async function getBelumAbsen(
  today: string,
  kelas: string,
  isAdmin: boolean
): Promise<{ belum: Student[]; belumRecord: number }> {
  let studentsQuery = supabaseAdmin.from("students").select("id, name, class, foto");
  if (!isAdmin && kelas) studentsQuery = studentsQuery.eq("class", kelas);
  const { data: allStudents } = await studentsQuery.order("class").order("name");
  const students = allStudents ?? [];

  const { data: absenRows } = await supabaseAdmin
    .from("absensi")
    .select("siswa_id")
    .eq("tanggal", today);
  const sudahAbsenIds = new Set((absenRows ?? []).map((r) => r.siswa_id));

  const belumSemua = students.filter((s) => !sudahAbsenIds.has(s.id));
  return { belum: belumSemua.slice(0, 8), belumRecord: belumSemua.length };
}
