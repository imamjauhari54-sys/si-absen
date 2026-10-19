import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { assertBolehAksesSiswa } from "@/lib/auth/akses-kelas";
import { supabaseAdmin } from "@/lib/supabase/server";
import { parseIdPositif, responsPulihkan, tanggalValid } from "@/lib/utils/absen-edit";

/**
 * Pulihkan edit manual yang DIKONFIRMASI pengguna untuk satu siswa pada satu tanggal.
 *
 * Form wajib membawa edit_id: ID edit yang dilihat pengguna di modal konfirmasi (o_edit_id dari
 * daftar_bisa_pulihkan). Database hanya memulihkan kalau edit itu MASIH edit terakhir; kalau sudah ada edit
 * yang lebih baru hasilnya sudah_berubah dan data tidak diubah (edit baru tidak dipulihkan diam-diam).
 *
 * Hak akses sama persis dengan edit (admin: semua siswa; guru: hanya siswa kelas wali-nya, dibaca dari DB).
 * Semua syarat (edit terakhir, belum dipulihkan, masa pemulihan, data belum diubah proses lain) diputuskan
 * ATOMIK di database oleh pulihkan_edit_manual (migrasi 019); route ini hanya memeriksa akses dan
 * menerjemahkan kode hasilnya. Tidak mengirim notifikasi WhatsApp.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "guru")) {
    return NextResponse.json({ status: "error", message: "Unauthorized" }, { status: 403 });
  }

  const form = await req.formData();
  const siswaId = parseIdPositif(form.get("siswa_id")); // integer positif ketat; "1abc" ditolak
  const editId = parseIdPositif(form.get("edit_id")); // wajib; integer positif ketat
  const tanggal = String(form.get("tanggal") || "");
  if (siswaId === null || editId === null || !tanggalValid(tanggal)) {
    return NextResponse.json({ status: "error", message: "Data tidak valid" }, { status: 400 });
  }

  const akses = await assertBolehAksesSiswa(session, siswaId);
  if (!akses.ok) {
    return NextResponse.json({ status: "error", message: akses.message }, { status: akses.status });
  }

  const { data, error } = await supabaseAdmin.rpc("pulihkan_edit_manual", {
    p_siswa_id: siswaId,
    p_tanggal: tanggal,
    p_edit_id: editId,
    p_pemulih_id: session.userId,
    p_pemulih_nama: session.nama || session.username,
  });
  if (error) {
    // Detail hanya ke log server; browser menerima pesan umum yang aman.
    console.error("[absen/pulihkan] RPC pulihkan_edit_manual gagal:", { code: error.code, message: error.message, details: error.details, hint: error.hint });
    return NextResponse.json({ status: "error", message: "Gagal memulihkan data. Silakan coba lagi." }, { status: 500 });
  }

  // pulihkan_edit_manual selalu mengembalikan TEPAT satu baris berisi o_kode. Bentuk lain = gagal tertutup:
  // jangan pernah menjawab sukses (kode tak dikenal otomatis menjadi 500 di responsPulihkan).
  const baris = Array.isArray(data) && data.length === 1 ? (data[0] as { o_kode?: unknown } | null) : null;
  const kode = typeof baris?.o_kode === "string" ? baris.o_kode : undefined;
  const hasil = responsPulihkan(kode);
  if (hasil.httpStatus === 500) {
    console.error("[absen/pulihkan] hasil RPC pulihkan_edit_manual tidak sesuai:", JSON.stringify(data));
  }
  return NextResponse.json(
    { status: hasil.ok ? "ok" : "error", message: hasil.message },
    { status: hasil.httpStatus }
  );
}
