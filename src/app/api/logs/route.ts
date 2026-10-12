import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import { formatWaktuWib } from "@/lib/utils/tanggal";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ status: "error", message: "Akses ditolak" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("absensi_log")
    .select(
      "id, admin_id, siswa_id, status_lama, status_baru, keterangan, created_at, users(name, foto), students(name, class)"
    )
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ status: "error", message: error.message }, { status: 500 });
  }

  const logs = (data ?? []).map((row) => {
    const admin = Array.isArray(row.users) ? row.users[0] : row.users;
    const siswa = Array.isArray(row.students) ? row.students[0] : row.students;
    return {
      id: row.id,
      admin_id: row.admin_id,
      siswa_id: row.siswa_id,
      status_lama: row.status_lama,
      status_baru: row.status_baru,
      keterangan: row.keterangan,
      created_at: formatWaktuWib(row.created_at, { kapital: true }),
      nama_admin: admin?.name || `User (ID:${row.admin_id})`,
      foto_admin: admin?.foto ?? null,
      nama_siswa: siswa?.name ?? null,
      kelas_siswa: siswa?.class ?? null,
    };
  });

  return NextResponse.json({ status: "ok", data: logs });
}
