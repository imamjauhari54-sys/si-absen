import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import { catatLog } from "@/lib/data/log-aktivitas";

const ALASAN_VALID = ["lulus", "pindah"] as const;

/**
 * Soft-delete: pindahkan siswa ke status non-aktif (lulus/pindah). Baris di
 * `students` TIDAK dihapus, begitu juga seluruh riwayat di `absensi` /
 * `absensi_log` — supaya tetap bisa dibuka lagi untuk laporan/akreditasi.
 * Siswa dengan status ini otomatis tidak lagi muncul di daftar Data Siswa,
 * tidak bisa dipakai scan absen, dan tidak kena auto-alpha harian.
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
  const alasan = String(form.get("alasan") || "").trim();
  if (!ALASAN_VALID.includes(alasan as (typeof ALASAN_VALID)[number])) {
    return NextResponse.json({ status: "error", message: "Alasan tidak valid. Pilih Lulus atau Pindah." });
  }

  const { data: siswa } = await supabaseAdmin.from("students").select("name, class, status").eq("id", siswaId).maybeSingle();
  if (!siswa) return NextResponse.json({ status: "error", message: "Siswa tidak ditemukan." });
  if (siswa.status !== "aktif") {
    return NextResponse.json({ status: "error", message: "Siswa ini sudah berstatus non-aktif." });
  }

  const { error } = await supabaseAdmin.from("students").update({ status: alasan }).eq("id", siswaId);
  if (error) return NextResponse.json({ status: "error", message: error.message });

  const labelAlasan = alasan === "lulus" ? "Lulus" : "Pindah";
  await catatLog(
    session.userId,
    "nonaktifkan_siswa",
    siswa.name,
    `Menonaktifkan siswa "${siswa.name}" (Kelas ${siswa.class}) — alasan: ${labelAlasan}.`
  );
  revalidateTag("siswa", "max");

  return NextResponse.json({ status: "ok" });
}
