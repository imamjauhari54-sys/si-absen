import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const periode = req.nextUrl.searchParams.get("periode") || "";
  if (!periode) {
    return NextResponse.json({ success: false, error: "Periode wajib diisi" }, { status: 400 });
  }

  // Ambil siswa_id yang punya absensi di periode ini, lalu kelasnya (dua query,
  // hindari join eksplisit biar tidak bergantung nama relasi FK Supabase).
  let absensiQuery = supabaseAdmin.from("absensi").select("siswa_id");
  if (periode !== "all") {
    absensiQuery = absensiQuery.gte("tanggal", `${periode}-01`).lte("tanggal", `${periode}-31`);
  }
  const { data: absenRows } = await absensiQuery;
  const siswaIds = Array.from(new Set((absenRows ?? []).map((r) => r.siswa_id)));

  if (siswaIds.length === 0) {
    return NextResponse.json({ success: true, kelas: [], count: 0 });
  }

  const { data: students } = await supabaseAdmin.from("students").select("class").in("id", siswaIds);
  const kelasList = Array.from(new Set((students ?? []).map((s) => s.class).filter(Boolean))).sort();

  return NextResponse.json({ success: true, kelas: kelasList, count: kelasList.length });
}
