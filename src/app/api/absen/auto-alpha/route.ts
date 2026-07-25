import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import { todayJakarta } from "@/lib/utils/tanggal";
import { kirimNotifAlpha } from "@/lib/wa/notifikasi";

/**
 * Diakses dengan salah satu dari dua cara:
 * 1. Session admin lewat tombol manual di dashboard (method POST).
 * 2. Vercel Cron (lihat vercel.json) — Vercel SELALU memanggil cron pakai
 *    method GET, bukan POST, dan menyertakan header
 *    "Authorization: Bearer <CRON_SECRET>" secara otomatis kalau env var
 *    CRON_SECRET diisi di Vercel project settings.
 * CRON_SECRET wajib diisi di .env untuk mengaktifkan jalur kedua ini —
 * kalau kosong, hanya session admin yang bisa memicu endpoint ini.
 */
function isCronAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${cronSecret}`;
}

async function prosesAutoAlpha(req: NextRequest) {
  const session = await getSession();
  const isAdminSession = !!session && session.role === "admin";
  const isCron = isCronAuthorized(req);

  if (!isAdminSession && !isCron) {
    return NextResponse.json({ status: "error", message: "Akses ditolak!" }, { status: 403 });
  }

  const today = todayJakarta();

  // Hari Minggu
  const d = new Date(`${today}T00:00:00Z`);
  if (d.getUTCDay() === 0) {
    return NextResponse.json({ status: "error", message: "Hari ini adalah hari Minggu!" });
  }

  // Hari libur
  const { data: libur } = await supabaseAdmin
    .from("hari_libur")
    .select("id")
    .eq("tanggal", today)
    .maybeSingle();
  if (libur) {
    return NextResponse.json({ status: "error", message: "Hari ini adalah hari libur sekolah!" });
  }

  // Setting tapel & semester
  const { data: setting } = await supabaseAdmin
    .from("absensi_setting")
    .select("tapel, semester")
    .limit(1)
    .maybeSingle();
  if (!setting) {
    return NextResponse.json({ status: "error", message: "Pengaturan Tahun Pelajaran belum diatur!" });
  }

  // Siswa yang belum absen hari ini
  const { data: allStudents } = await supabaseAdmin.from("students").select("id, name, class").eq("status", "aktif");
  const { data: absenRows } = await supabaseAdmin.from("absensi").select("siswa_id").eq("tanggal", today);
  const sudahIds = new Set((absenRows ?? []).map((r) => r.siswa_id));
  const belum = (allStudents ?? []).filter((s) => !sudahIds.has(s.id));

  if (belum.length > 0) {
    const rows = belum.map((s) => ({
      siswa_id: s.id,
      tanggal: today,
      status: "alpha",
      keterangan: "Tanpa Keterangan (Sistem)",
      tapel: setting.tapel,
      semester: setting.semester,
      scan_oleh: "admin",
    }));
    const { error } = await supabaseAdmin
      .from("absensi")
      .upsert(rows, { onConflict: "siswa_id,tanggal", ignoreDuplicates: true });
    if (error) {
      return NextResponse.json({ status: "error", message: error.message }, { status: 500 });
    }
    for (const s of belum) {
      kirimNotifAlpha(s.id, s.name, s.class, today); // fire and forget, tidak menunggu satu-satu
    }
  }

  return NextResponse.json({
    status: "ok",
    message: `Berhasil memproses ${belum.length} siswa menjadi Alpha.`,
  });
}

// Vercel Cron selalu memanggil pakai GET (lihat vercel.json)
export async function GET(req: NextRequest) {
  return prosesAutoAlpha(req);
}

// Tombol manual admin di dashboard memanggil pakai POST
export async function POST(req: NextRequest) {
  return prosesAutoAlpha(req);
}
