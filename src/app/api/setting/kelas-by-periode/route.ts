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
  if (periode !== "all" && !/^\d{4}-(0[1-9]|1[0-2])$/.test(periode)) {
    return NextResponse.json({ success: false, error: "Format periode tidak valid" }, { status: 400 });
  }

  // Kelas yang punya absensi pada periode itu, menurut kelas siswa PADA SAAT ITU (riwayat_kelas,
  // migrasi 016) — bukan kelas sekarang, supaya tetap benar setelah kenaikan kelas.
  const { data, error } = await supabaseAdmin.rpc("kelas_by_periode", { p_bulan: periode });
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const kelasList = ((data ?? []) as { kelas: string }[]).map((r) => r.kelas);
  return NextResponse.json({ success: true, kelas: kelasList, count: kelasList.length });
}
