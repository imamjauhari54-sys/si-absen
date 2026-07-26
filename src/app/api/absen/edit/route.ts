import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import { addDaysJakarta, isoWeekday } from "@/lib/utils/tanggal";

const STATUS_VALID = ["hadir", "terlambat", "izin", "sakit", "alpha"];
const MAX_RENTANG_HARI = 92; // ~3 bulan, jaga-jaga input keliru

/** Proses 1 tanggal saja — dipanggil per hari dari loop rentang di bawah. */
async function prosesSatuTanggal(
  siswaId: number,
  tanggal: string,
  statusBaru: string,
  keterangan: string,
  lampiranUrl: string | null,
  adminId: number,
  namaAdmin: string
): Promise<{ ok: boolean; message?: string }> {
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
    const updatePayload: Record<string, unknown> = { status: statusBaru, keterangan, jam_masuk: jamMasukDb };
    if (lampiranUrl !== null) updatePayload.lampiran = lampiranUrl || null;
    const { error } = await supabaseAdmin.from("absensi").update(updatePayload).eq("siswa_id", siswaId).eq("tanggal", tanggal);
    if (error) dbError = error.message;
  } else {
    const { error } = await supabaseAdmin.from("absensi").insert({
      siswa_id: siswaId,
      tanggal,
      status: statusBaru,
      keterangan,
      jam_masuk: jamMasukDb,
      lampiran: lampiranUrl || null,
      tapel,
      semester,
      scan_oleh: namaAdmin,
    });
    if (error) dbError = error.message;
  }

  if (dbError) return { ok: false, message: dbError };

  if (statusLama !== statusBaru) {
    await supabaseAdmin.from("absensi_log").insert({
      admin_id: adminId,
      siswa_id: siswaId,
      tanggal_absen: tanggal,
      status_lama: statusLama,
      status_baru: statusBaru,
      keterangan,
    });
  }

  return { ok: true };
}

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
  const tanggalDari = String(form.get("tanggal") || "");
  // Opsional — kalau kosong, dianggap cuma 1 hari (sama seperti tanggalDari).
  const tanggalSampai = String(form.get("tanggal_sampai") || "") || tanggalDari;
  const statusBaru = String(form.get("status") || "");
  const keterangan = String(form.get("keterangan") || "").trim();

  // lampiran_url: kosong = tidak diubah, "__HAPUS__" = hapus lampiran lama,
  // URL Cloudinary = simpan sebagai lampiran baru.
  const lampiranRaw = String(form.get("lampiran_url") || "").trim();
  let lampiranUrl: string | null = null; // null = jangan ubah kolom lampiran
  if (lampiranRaw === "__HAPUS__") {
    lampiranUrl = "";
  } else if (lampiranRaw) {
    const valid = /^https:\/\/[^/]*\.?cloudinary\.com\//.test(lampiranRaw);
    lampiranUrl = valid ? lampiranRaw : null;
  }

  if (!siswaId || !tanggalDari || !STATUS_VALID.includes(statusBaru)) {
    return NextResponse.json({ status: "error", message: "Data status tidak valid" });
  }
  if (tanggalSampai < tanggalDari) {
    return NextResponse.json({ status: "error", message: '"Sampai Tanggal" tidak boleh lebih awal dari "Dari Tanggal".' });
  }

  // Kumpulkan semua tanggal dalam rentang, sekaligus tandai mana yang harus
  // dilewati (Minggu / hari libur) tanpa menggagalkan seluruh proses.
  const { data: liburRows } = await supabaseAdmin
    .from("hari_libur")
    .select("tanggal")
    .gte("tanggal", tanggalDari)
    .lte("tanggal", tanggalSampai);
  const liburSet = new Set((liburRows ?? []).map((r) => r.tanggal));

  const daftarTanggal: string[] = [];
  let cur = tanggalDari;
  let pengaman = 0;
  while (cur <= tanggalSampai) {
    daftarTanggal.push(cur);
    cur = addDaysJakarta(cur, 1);
    pengaman++;
    if (pengaman > MAX_RENTANG_HARI) {
      return NextResponse.json({ status: "error", message: `Rentang tanggal terlalu panjang (maks ${MAX_RENTANG_HARI} hari).` });
    }
  }

  const diproses: string[] = [];
  const dilewati: string[] = [];
  for (const tgl of daftarTanggal) {
    if (isoWeekday(tgl) === 7 || liburSet.has(tgl)) {
      dilewati.push(tgl);
      continue;
    }
    const hasil = await prosesSatuTanggal(siswaId, tgl, statusBaru, keterangan, lampiranUrl, session.userId, session.nama || "Guru");
    if (!hasil.ok) {
      return NextResponse.json({ status: "error", message: "Gagal DB: " + hasil.message });
    }
    diproses.push(tgl);
  }

  if (diproses.length === 0) {
    return NextResponse.json({
      status: "error",
      message: "Semua tanggal di rentang ini adalah hari Minggu/libur — tidak ada yang diproses.",
    });
  }

  return NextResponse.json({
    status: "ok",
    message: "Berhasil",
    diproses: diproses.length,
    dilewati: dilewati.length,
    tanggalDiproses: diproses,
  });
}
