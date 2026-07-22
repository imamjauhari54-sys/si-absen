import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import { todayJakarta } from "@/lib/utils/tanggal";

export async function POST() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
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
  const { data: allStudents } = await supabaseAdmin.from("students").select("id");
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
    const { error } = await supabaseAdmin.from("absensi").insert(rows);
    if (error) {
      return NextResponse.json({ status: "error", message: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    status: "ok",
    message: `Berhasil memproses ${belum.length} siswa menjadi Alpha.`,
  });
}
