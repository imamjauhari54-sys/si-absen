import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import { catatLog } from "@/lib/data/log-aktivitas";

/** Kebalikan dari nonaktifkan: balikin status siswa ke 'aktif'. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ status: "error", message: "Akses ditolak" }, { status: 403 });
  }

  const { id } = await params;
  const siswaId = parseInt(id, 10);
  if (!siswaId) return NextResponse.json({ status: "error", message: "ID tidak valid" }, { status: 400 });

  const { data: siswa } = await supabaseAdmin.from("students").select("name, class, status, nisn").eq("id", siswaId).maybeSingle();
  if (!siswa) return NextResponse.json({ status: "error", message: "Siswa tidak ditemukan." });
  if (siswa.status === "aktif") {
    return NextResponse.json({ status: "error", message: "Siswa ini sudah aktif." });
  }

  const { error } = await supabaseAdmin.from("students").update({ status: "aktif" }).eq("id", siswaId);
  if (error) {
    // Kemungkinan besar bentrok NISN dengan siswa aktif lain yang kebetulan
    // memakai NISN yang sama (lihat idx_students_nisn_aktif di migration).
    const message = error.message.includes("nisn")
      ? "Gagal mengaktifkan: NISN siswa ini sudah dipakai siswa aktif lain. Ubah/kosongkan NISN dulu."
      : error.message;
    return NextResponse.json({ status: "error", message });
  }

  await catatLog(
    session.userId,
    "aktifkan_siswa",
    siswa.name,
    `Mengaktifkan kembali siswa "${siswa.name}" (Kelas ${siswa.class}).`
  );

  return NextResponse.json({ status: "ok" });
}
