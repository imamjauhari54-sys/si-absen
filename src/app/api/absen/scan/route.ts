import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prosesAbsen } from "@/lib/data/scan";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ status: "error", message: "Akses ditolak" }, { status: 403 });
  }

  const form = await req.formData();
  const manual = !!form.get("manual");
  const token = String(form.get("token") || "").trim() || undefined;
  const siswaIdRaw = form.get("siswa_id");
  const siswaId = siswaIdRaw ? parseInt(String(siswaIdRaw), 10) : undefined;
  const scannerId = String(form.get("scanner_id") || "unknown").trim();

  const userAgent = req.headers.get("user-agent") || "";
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  try {
    const result = await prosesAbsen({
      manual,
      token,
      siswaId,
      scannerId,
      adminId: session.userId,
      userAgent,
      ip,
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[api/absen/scan]", e);
    return NextResponse.json({ status: "error", message: "Terjadi kesalahan server" }, { status: 500 });
  }
}
