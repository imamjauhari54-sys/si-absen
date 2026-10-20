import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import { catatLog } from "@/lib/data/log-aktivitas";
import { parseTanggalKeluar } from "@/lib/utils/tanggal-keluar";
import { formatTglIndo, todayJakarta } from "@/lib/utils/tanggal";

/**
 * Ubah tanggal keluar siswa non-aktif (halaman Siswa Nonaktif). Tanggal kosong = hapus tanggal keluar,
 * artinya siswa dihitung penuh sepanjang tapel terakhirnya. Mengubah ini langsung memengaruhi rekap.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ status: "error", message: "Akses ditolak" }, { status: 403 });
  }

  const { id } = await params;
  const siswaId = parseInt(id, 10);
  if (!siswaId) return NextResponse.json({ status: "error", message: "ID tidak valid" }, { status: 400 });

  const form = await req.formData();
  const tanggal = parseTanggalKeluar(form.get("tanggal"), todayJakarta());
  if (!tanggal.ok) return NextResponse.json({ status: "error", message: tanggal.message });

  const { data: siswa } = await supabaseAdmin.from("students").select("name, class, status").eq("id", siswaId).maybeSingle();
  if (!siswa) return NextResponse.json({ status: "error", message: "Siswa tidak ditemukan." });
  if (siswa.status === "aktif") {
    return NextResponse.json({ status: "error", message: "Siswa ini masih aktif." });
  }

  const { error } = await supabaseAdmin.rpc("ubah_tanggal_keluar", { p_id: siswaId, p_tanggal: tanggal.value });
  if (error) {
    const message =
      error.code === "PGRST202" ? "Fitur ini butuh migrasi 021 (ubah_tanggal_keluar) dijalankan dulu." : error.message;
    return NextResponse.json({ status: "error", message });
  }

  await catatLog(
    session.userId,
    "ubah_tanggal_keluar",
    siswa.name,
    tanggal.value
      ? `Mengubah tanggal keluar siswa "${siswa.name}" (Kelas ${siswa.class}) menjadi ${formatTglIndo(tanggal.value)}.`
      : `Menghapus tanggal keluar siswa "${siswa.name}" (Kelas ${siswa.class}).`
  );
  revalidateTag("siswa", "max");

  return NextResponse.json({ status: "ok" });
}
