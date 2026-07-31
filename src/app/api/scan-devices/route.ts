import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getScanDevices } from "@/lib/data/scanner";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ status: "error", message: "Akses ditolak" }, { status: 403 });
  }

  try {
    const devices = await getScanDevices();
    return NextResponse.json({ status: "ok", data: devices });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gagal memuat data device";
    return NextResponse.json({ status: "error", message }, { status: 500 });
  }
}
