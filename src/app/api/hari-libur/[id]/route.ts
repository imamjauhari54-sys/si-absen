import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { deleteHariLibur } from "@/lib/data/hari-libur";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ status: "error", message: "Akses ditolak" }, { status: 403 });
  }

  const { id } = await params;
  const numId = parseInt(id, 10);
  if (!numId) return NextResponse.json({ status: "error", message: "ID tidak valid" }, { status: 400 });

  const result = await deleteHariLibur(numId);
  if (!result.ok) return NextResponse.json({ status: "error", message: result.message });
  return NextResponse.json({ status: "ok" });
}
