import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { updateScannerLabel, deleteScanner } from "@/lib/data/scanner";
import { catatLog } from "@/lib/data/log-aktivitas";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ scannerId: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ status: "error", message: "Akses ditolak" }, { status: 403 });
  }

  const { scannerId } = await params;
  const form = await req.formData();
  const label = String(form.get("label") || "");

  try {
    await updateScannerLabel(scannerId, label);
    await catatLog(session.userId, "rename_scanner", scannerId, `Mengganti nama device scanner jadi "${label.trim() || "(kosong)"}".`);
    return NextResponse.json({ status: "ok" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gagal menyimpan nama device.";
    return NextResponse.json({ status: "error", message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ scannerId: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ status: "error", message: "Akses ditolak" }, { status: 403 });
  }

  const { scannerId } = await params;

  try {
    await deleteScanner(scannerId);
    await catatLog(session.userId, "hapus_scanner", scannerId, `Menghapus device scanner dari daftar monitoring.`);
    return NextResponse.json({ status: "ok" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gagal menghapus device.";
    return NextResponse.json({ status: "error", message }, { status: 500 });
  }
}
