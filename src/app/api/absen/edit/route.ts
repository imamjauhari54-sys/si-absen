import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isoWeekday } from "@/lib/utils/tanggal";

const STATUS_VALID = ["hadir", "terlambat", "izin", "sakit", "alpha"];

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "guru")) {
    return NextResponse.json({ status: "error", message: "Unauthorized" }, { status: 403 });
  }

  const form = await req.formData();
  const action = String(form.get("action") || "");
  if (action !== "edit_status") {
    return NextResponse.json({ status: "error", message: "Invalid Action" });
  }

  const siswaId = parseInt(String(form.get("siswa_id") || "0"), 10);
  const tanggal = String(form.get("tanggal") || "");
  const statusBaru = String(form.get("status") || "");
  const keterangan = String(form.get("keterangan") || "").trim();

  // Validasi hari Minggu
  if (tanggal && isoWeekday(tanggal) === 7) {
    return NextResponse.json({ status: "error", message: "Tidak bisa edit absen di hari Minggu!" });
  }

  // Validasi hari libur
  const { data: libur } = await supabaseAdmin.from("hari_libur").select("id").eq("tanggal", tanggal).maybeSingle();
  if (libur) {
    return NextResponse.json({ status: "error", message: "Tanggal ini adalah hari libur sekolah!" });
  }

  if (!siswaId || !tanggal || !STATUS_VALID.includes(statusBaru)) {
    return NextResponse.json({ status: "error", message: "Data status tidak valid" });
  }

  // Jam masuk: hadir/terlambat catat jam sekarang (WIB), selain itu null
  let jamMasukDb: string | null = null;
  if (statusBaru === "hadir" || statusBaru === "terlambat") {
    const nowWib = new Date(Date.now() + 7 * 60 * 60 * 1000);
    jamMasukDb = nowWib.toISOString().slice(11, 19);
  }

  const { data: settingRow } = await supabaseAdmin.from("absensi_setting").select("tapel, semester").limit(1).maybeSingle();
  const tapel = settingRow?.tapel ?? "2025/2026";
  const semester = settingRow?.semester ?? "genap";

  const { data: dataLama } = await supabaseAdmin
    .from("absensi")
    .select("status")
    .eq("siswa_id", siswaId)
    .eq("tanggal", tanggal)
    .maybeSingle();

  const statusLama = dataLama?.status ?? "Belum Absen";

  let dbError: string | null = null;
  if (dataLama) {
    const { error } = await supabaseAdmin
      .from("absensi")
      .update({ status: statusBaru, keterangan, jam_masuk: jamMasukDb })
      .eq("siswa_id", siswaId)
      .eq("tanggal", tanggal);
    if (error) dbError = error.message;
  } else {
    const scanOleh = session.nama || "Guru";
    const { error } = await supabaseAdmin.from("absensi").insert({
      siswa_id: siswaId,
      tanggal,
      status: statusBaru,
      keterangan,
      jam_masuk: jamMasukDb,
      tapel,
      semester,
      scan_oleh: scanOleh,
    });
    if (error) dbError = error.message;
  }

  if (dbError) {
    return NextResponse.json({ status: "error", message: "Gagal DB: " + dbError });
  }

  // Catat ke log kalau status berubah
  if (statusLama !== statusBaru) {
    await supabaseAdmin.from("absensi_log").insert({
      admin_id: session.userId,
      siswa_id: siswaId,
      tanggal_absen: tanggal,
      status_lama: statusLama,
      status_baru: statusBaru,
      keterangan,
    });
  }

  return NextResponse.json({ status: "ok", message: "Berhasil" });
}
