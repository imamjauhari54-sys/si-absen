import { cache } from "react";
import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";
import { addDaysJakarta, hariSingkat } from "@/lib/utils/tanggal";
import type { AbsensiSetting, RecentScan, StatusAbsen, Student, TrenHarian } from "@/types";

// KATEGORI A (data master, jarang berubah): nama sekolah cuma berubah saat
// admin simpan di halaman Setting. Di-cache pakai tag "settings" supaya bisa
// di-invalidate presisi lewat revalidateTag("settings") di
// simpanInfoSekolahAction, tanpa perlu nunggu time-based expiry.
async function _getNamaSekolah(fallback: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("settings")
    .select("value")
    .eq("key", "nama_sekolah")
    .maybeSingle();
  return data?.value || fallback;
}
export async function getNamaSekolah(fallback: string): Promise<string> {
  return unstable_cache(_getNamaSekolah, ["nama-sekolah"], { tags: ["settings"] })(fallback);
}

// KATEGORI A: foto user berubah hanya saat user ganti profil (jarang).
// Cache per-username lewat tag supaya invalidation presisi ke user terkait.
async function _getFotoUser(username: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("users")
    .select("foto")
    .eq("username", username)
    .maybeSingle();
  return data?.foto || null;
}
export async function getFotoUser(username: string): Promise<string | null> {
  return unstable_cache(_getFotoUser, ["foto-user"], { tags: [`user-${username}`] })(username);
}

// KATEGORI A: absensi_setting (jam masuk/batas terlambat/dst) cuma berubah
// saat admin simpan di halaman Setting > Jadwal, tapi sebelumnya di-query
// ulang di SETIAP request scan QR (lihat src/lib/data/scan.ts) dan setiap
// buka dashboard. Di-cache dengan tag "absensi-setting", di-invalidate lewat
// revalidateTag di simpanJadwalAction.
async function _getAbsensiSetting(): Promise<AbsensiSetting> {
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
export async function getAbsensiSetting(): Promise<AbsensiSetting> {
  return unstable_cache(_getAbsensiSetting, ["absensi-setting"], { tags: ["absensi-setting"] })();
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

/**
 * TEMUAN AUDIT #4: getStatistikHariIni, getTren7Hari, getRecentScans, dan
 * getBelumAbsen masing-masing tadinya menjalankan query terpisah ke tabel
 * "students" dengan filter kelas yang SAMA persis, walau dipanggil bersamaan
 * lewat Promise.all di dashboard/page.tsx — untuk role guru, 1x buka
 * dashboard = sampai 4 query redundan ke "students".
 *
 * Dibungkus React cache() supaya di-memoize PER REQUEST (bukan cache lintas
 * request seperti data master lain di file ini) — begitu salah satu fungsi
 * di bawah memanggilnya duluan, panggilan berikutnya di request yang sama
 * otomatis reuse hasilnya tanpa query Supabase kedua/ketiga/keempat kali.
 */
const getSiswaKelasUntukDashboard = cache(async (kelas: string, isAdmin: boolean) => {
  if (isAdmin || !kelas) return null;
  const { data } = await supabaseAdmin.from("students").select("id, name, class, foto").eq("class", kelas);
  return data ?? [];
});

/** Ambil total siswa (opsional filter kelas untuk guru) & statistik status hari ini. */
export async function getStatistikHariIni(
  today: string,
  kelas: string,
  isAdmin: boolean
): Promise<{ totalSiswa: number; stat: StatHariIni }> {
  const siswaKelas = await getSiswaKelasUntukDashboard(kelas, isAdmin);
  const studentIds = siswaKelas ? siswaKelas.map((s) => s.id) : null;

  let totalSiswa: number;
  if (studentIds) {
    totalSiswa = studentIds.length;
  } else {
    const { count } = await supabaseAdmin.from("students").select("id", { count: "exact", head: true });
    totalSiswa = count ?? 0;
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
  const siswaKelas = await getSiswaKelasUntukDashboard(kelas, isAdmin);
  const studentIds = siswaKelas ? siswaKelas.map((s) => s.id) : null;

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
  const siswaKelas = await getSiswaKelasUntukDashboard(kelas, isAdmin);
  const studentIds = siswaKelas ? siswaKelas.map((s) => s.id) : null;

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
  const siswaKelas = await getSiswaKelasUntukDashboard(kelas, isAdmin);
  let students: Student[];
  if (siswaKelas) {
    students = [...siswaKelas].sort((a, b) => a.class.localeCompare(b.class) || a.name.localeCompare(b.name));
  } else {
    const { data: allStudents } = await supabaseAdmin
      .from("students")
      .select("id, name, class, foto")
      .order("class")
      .order("name");
    students = allStudents ?? [];
  }

  const { data: absenRows } = await supabaseAdmin
    .from("absensi")
    .select("siswa_id")
    .eq("tanggal", today);
  const sudahAbsenIds = new Set((absenRows ?? []).map((r) => r.siswa_id));

  const belumSemua = students.filter((s) => !sudahAbsenIds.has(s.id));
  return { belum: belumSemua.slice(0, 8), belumRecord: belumSemua.length };
}
