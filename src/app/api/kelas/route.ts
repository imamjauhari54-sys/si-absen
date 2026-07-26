import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { tambahKelasMaster } from "@/lib/data/kelas";
import { catatLog } from "@/lib/data/log-aktivitas";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ status: "error", message: "Akses ditolak" }, { status: 403 });
  }

  const form = await req.formData();
  const nama = String(form.get("nama") || "");

  const { error } = await tambahKelasMaster(nama);
  if (error) return NextResponse.json({ status: "error", message: error });

  await catatLog(session.userId, "tambah_kelas", nama, `Menambahkan kelas baru: ${nama}`);
  return NextResponse.json({ status: "ok" });
}
