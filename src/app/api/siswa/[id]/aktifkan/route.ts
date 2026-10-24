import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import { tanggalValid } from "@/lib/utils/absen-edit";
import { todayJakarta } from "@/lib/utils/tanggal";
import { parseAktifkanInput, parseIdSiswa, pesanGalatAktifkan } from "@/lib/utils/aktifkan-kembali";

/**
 * Aktifkan kembali siswa nonaktif (migrasi 025). Semua perubahan terjadi di SATU fungsi SQL (aktifkan_siswa):
 * status, pengisian Alpha (mode A), riwayat, dan Log Aktivitas dalam satu transaksi — route ini TIDAK
 * mencatat log sendiri (akan dobel) dan TIDAK memakai UPDATE students langsung (itu yang dulu menghapus tanggal pindah).
 *
 *  - GET  ?kembali=YYYY-MM-DD : pratinjau dampak (hanya baca), dipanggil modal sebelum admin mengonfirmasi.
 *  - POST mode, kembali       : jalankan. Permintaan ganda / admin lain lebih dulu -> status "sudah_aktif" (bukan galat).
 */

async function wajibAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") return null;
  return session;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await wajibAdmin())) {
    return NextResponse.json({ status: "error", message: "Akses ditolak" }, { status: 403 });
  }
  const siswaId = parseIdSiswa((await params).id);
  if (!siswaId) return NextResponse.json({ status: "error", message: "ID tidak valid" }, { status: 400 });

  const kembaliRaw = req.nextUrl.searchParams.get("kembali")?.trim() || null;
  if (kembaliRaw && !tanggalValid(kembaliRaw)) {
    return NextResponse.json({ status: "error", message: "Tanggal kembali tidak valid." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.rpc("pratinjau_aktifkan_siswa", { p_id: siswaId, p_kembali: kembaliRaw });
  if (error) return NextResponse.json(pesanGalatAktifkan(error));
  return NextResponse.json({ status: "ok", pratinjau: data });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await wajibAdmin();
  if (!session) {
    return NextResponse.json({ status: "error", message: "Akses ditolak" }, { status: 403 });
  }
  const siswaId = parseIdSiswa((await params).id);
  if (!siswaId) return NextResponse.json({ status: "error", message: "ID tidak valid" }, { status: 400 });

  const form = await req.formData();
  const masukan = parseAktifkanInput({ mode: form.get("mode"), kembali: form.get("kembali") }, todayJakarta());
  if (!masukan.ok) return NextResponse.json({ status: "error", message: masukan.message });

  const { data, error } = await supabaseAdmin.rpc("aktifkan_siswa", {
    p_id: siswaId,
    p_mode: masukan.mode,
    p_kembali: masukan.kembali,
    p_admin_id: session.userId,
  });
  if (error) {
    const galat = pesanGalatAktifkan(error);
    // "sudah aktif" = permintaan ganda atau admin lain lebih dulu: daftar cukup dimuat ulang.
    if (galat.status === "sudah_aktif") revalidateTag("siswa", "max");
    return NextResponse.json(galat);
  }

  revalidateTag("siswa", "max");
  return NextResponse.json({ status: "ok", hasil: data });
}
