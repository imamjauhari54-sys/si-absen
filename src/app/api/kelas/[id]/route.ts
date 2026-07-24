import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { renameKelasMaster, hapusKelasMaster } from "@/lib/data/kelas";
import { catatLog } from "@/lib/data/log-aktivitas";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ status: "error", message: "Akses ditolak" }, { status: 403 });
  }

  const { id } = await params;
  const kelasId = parseInt(id, 10);
  if (!kelasId) return NextResponse.json({ status: "error", message: "ID tidak valid" }, { status: 400 });

  const form = await req.formData();
  const nama = String(form.get("nama") || "");

  const { error } = await renameKelasMaster(kelasId, nama);
  if (error) return NextResponse.json({ status: "error", message: error });

  await catatLog(session.userId, "edit_kelas", nama, `Mengganti nama kelas menjadi: ${nama}`);
  return NextResponse.json({ status: "ok" });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ status: "error", message: "Akses ditolak" }, { status: 403 });
  }

  const { id } = await params;
  const kelasId = parseInt(id, 10);
  if (!kelasId) return NextResponse.json({ status: "error", message: "ID tidak valid" }, { status: 400 });

  const { error } = await hapusKelasMaster(kelasId);
  if (error) return NextResponse.json({ status: "error", message: error });

  await catatLog(session.userId, "hapus_kelas", `ID:${kelasId}`, "Menghapus kelas dari daftar master.");
  return NextResponse.json({ status: "ok" });
}
