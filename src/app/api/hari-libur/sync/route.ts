import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { syncLiburNasional } from "@/lib/data/hari-libur";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ status: "error", message: "Akses ditolak" }, { status: 403 });
  }

  const form = await req.formData();
  const tahun = parseInt(String(form.get("tahun") || ""), 10);
  const tahunSekarang = new Date().getFullYear();
  if (!tahun || tahun < 2000 || tahun > tahunSekarang + 5) {
    return NextResponse.json({ status: "error", message: "Tahun tidak valid." });
  }

  const result = await syncLiburNasional(tahun);
  if (!result.ok) return NextResponse.json({ status: "error", message: result.message });
  return NextResponse.json({ status: "ok", jumlah: result.jumlah, tahun });
}
