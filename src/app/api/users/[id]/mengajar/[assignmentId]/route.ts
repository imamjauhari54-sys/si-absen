import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import { catatLog } from "@/lib/data/log-aktivitas";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ status: "error", message: "Akses ditolak" }, { status: 403 });
  }

  const { assignmentId } = await params;
  const rowId = parseInt(assignmentId, 10);
  if (!rowId) return NextResponse.json({ status: "error", message: "ID tidak valid" }, { status: 400 });

  const { data: row } = await supabaseAdmin
    .from("guru_mengajar_kelas")
    .select("class, mapel, guru_id, users(name)")
    .eq("id", rowId)
    .maybeSingle();

  const { error } = await supabaseAdmin.from("guru_mengajar_kelas").delete().eq("id", rowId);
  if (error) return NextResponse.json({ status: "error", message: error.message });

  if (row) {
    const guru = Array.isArray(row.users) ? row.users[0] : row.users;
    await catatLog(
      session.userId,
      "hapus_mengajar",
      guru?.name ?? `Guru #${row.guru_id}`,
      `Menghapus penugasan mengajar "${row.mapel}" di Kelas ${row.class} untuk ${guru?.name ?? "guru"}.`
    );
  }

  return NextResponse.json({ status: "ok" });
}
