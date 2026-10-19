import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { assertBolehAksesSiswa } from "@/lib/auth/akses-kelas";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  KODE_SQL_RIWAYAT_KELAS_KOSONG,
  parseIdPositif,
  parseLampiranForm,
  statusValid,
  susunTanggalEdit,
  tanggalValid,
  validasiHasilEdit,
} from "@/lib/utils/absen-edit";

/**
 * Edit manual absensi (admin: semua siswa; guru: hanya siswa kelas wali-nya).
 *
 * Seluruh penulisan dikerjakan di database oleh fungsi edit_manual_absensi (migrasi 019) dalam SATU
 * transaksi: kondisi sebelum edit disimpan sebagai snapshot (dasar tombol Pulihkan), jam diatur
 * sesuai status, dan log dicatat. Konsekuensinya rentang tanggal bersifat semua-atau-tidak-sama-sekali.
 *
 * Periode (tapel & semester) TIDAK ditentukan di sini dan TIDAK memakai setting aktif: database
 * menentukannya per tanggal. Baris yang sudah ada mempertahankan periodenya; baris baru memakai
 * periode dari data absensi tanggal itu, atau kalender bila tidak ada. Jika siswa tidak punya
 * riwayat_kelas pada tapel itu, database menolak dengan EM001 dan route ini menjawab HTTP 422.
 *
 * Aturan jam: hadir/terlambat mempertahankan jam yang ada; izin/sakit/alpha mengosongkannya; edit
 * manual tidak pernah membuat jam. scan_oleh tidak pernah diisi/diubah oleh edit manual. Edit manual
 * TIDAK mengirim notifikasi WhatsApp (sengaja tidak ada pemanggilan ke lib/wa di route ini).
 */

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "guru")) {
    return NextResponse.json({ status: "error", message: "Unauthorized" }, { status: 403 });
  }

  const form = await req.formData();
  const action = String(form.get("action") || "");
  if (action !== "edit_status") {
    return NextResponse.json({ status: "error", message: "Invalid Action" });
  }

  const siswaId = parseIdPositif(form.get("siswa_id")); // integer positif ketat; "1abc" ditolak
  const tanggalDari = String(form.get("tanggal") || "");
  // Opsional — kalau kosong, dianggap cuma 1 hari (sama seperti tanggalDari).
  const tanggalSampai = String(form.get("tanggal_sampai") || "") || tanggalDari;
  const statusBaru = String(form.get("status") || "");
  const keterangan = String(form.get("keterangan") || "").trim();

  if (siswaId === null || !tanggalValid(tanggalDari) || !statusValid(statusBaru)) {
    return NextResponse.json({ status: "error", message: "Data status tidak valid" });
  }
  if (!tanggalValid(tanggalSampai)) {
    return NextResponse.json({ status: "error", message: "Format tanggal tidak valid." });
  }
  if (tanggalSampai < tanggalDari) {
    return NextResponse.json({ status: "error", message: '"Sampai Tanggal" tidak boleh lebih awal dari "Dari Tanggal".' });
  }

  // lampiran_url: kosong = tidak diubah (null), "__HAPUS__" = hapus lampiran lama (""), selain itu harus
  // URL Cloudinary milik aplikasi ini. URL yang tidak valid DITOLAK (tidak lagi diam-diam dianggap "tidak diubah").
  const lampiran = parseLampiranForm(String(form.get("lampiran_url") || ""), process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME);
  if (!lampiran.ok) {
    return NextResponse.json({ status: "error", message: lampiran.message }, { status: lampiran.httpStatus });
  }
  const lampiranUrl = lampiran.nilai;

  // Otorisasi per siswa: guru hanya boleh mengubah siswa di kelas wali-nya (dibaca dari DB).
  // Dicek SEBELUM query/tulis apa pun.
  const akses = await assertBolehAksesSiswa(session, siswaId);
  if (!akses.ok) {
    return NextResponse.json({ status: "error", message: akses.message }, { status: akses.status });
  }

  // Minggu / hari libur dilewati tanpa menggagalkan seluruh proses. Kalau query hari libur GAGAL, proses
  // dihentikan (tidak boleh dilanjutkan dengan daftar libur kosong, nanti tanggal libur dianggap hari kerja).
  const { data: liburRows, error: liburError } = await supabaseAdmin
    .from("hari_libur")
    .select("tanggal")
    .gte("tanggal", tanggalDari)
    .lte("tanggal", tanggalSampai);
  if (liburError || !liburRows) {
    console.error("[absen/edit] gagal membaca hari_libur:", liburError?.message ?? "data kosong tanpa error");
    return NextResponse.json(
      { status: "error", message: "Gagal memeriksa data hari libur. Tidak ada perubahan yang disimpan, silakan coba lagi." },
      { status: 500 }
    );
  }
  const liburSet = new Set<string>((liburRows as { tanggal: string }[]).map((r) => r.tanggal));

  const rencana = susunTanggalEdit(tanggalDari, tanggalSampai, liburSet);
  if (!rencana.ok) {
    return NextResponse.json({ status: "error", message: rencana.message });
  }
  if (rencana.diproses.length === 0) {
    return NextResponse.json({
      status: "error",
      message: "Semua tanggal di rentang ini adalah hari Minggu/libur — tidak ada yang diproses.",
    });
  }

  const { data, error } = await supabaseAdmin.rpc("edit_manual_absensi", {
    p_siswa_id: siswaId,
    p_tanggal: rencana.diproses,
    p_status: statusBaru,
    p_keterangan: keterangan,
    p_lampiran: lampiranUrl,
    p_editor_id: session.userId,
    p_editor_nama: session.nama || session.username,
  });
  if (error) {
    // Siswa tidak punya riwayat_kelas pada tapel hasil penentuan: bukan kegagalan server, jelaskan penyebabnya.
    if (error.code === KODE_SQL_RIWAYAT_KELAS_KOSONG) {
      return NextResponse.json(
        {
          status: "error",
          kode: "riwayat_kelas_kosong",
          message: error.message || "Siswa tidak memiliki riwayat kelas pada tapel untuk tanggal ini. Tidak ada perubahan yang disimpan.",
          ...(error.hint ? { saran: error.hint } : {}),
        },
        { status: 422 }
      );
    }
    // Detail hanya ke log server; browser menerima pesan umum yang aman.
    console.error("[absen/edit] RPC edit_manual_absensi gagal:", { code: error.code, message: error.message, details: error.details, hint: error.hint });
    return NextResponse.json({ status: "error", message: "Gagal menyimpan perubahan. Silakan coba lagi." }, { status: 500 });
  }

  // RPC sukses belum tentu hasilnya utuh: wajib satu baris per tanggal yang dikirim. Kalau tidak, jangan menjawab "ok".
  const cek = validasiHasilEdit(data, rencana.diproses);
  if (!cek.ok) {
    console.error("[absen/edit] hasil RPC edit_manual_absensi tidak sesuai:", cek.alasan);
    return NextResponse.json(
      {
        status: "error",
        message: "Hasil dari database tidak lengkap, sehingga hasil edit tidak dapat dipastikan. Muat ulang Rekap untuk memeriksa datanya sebelum mengulang.",
      },
      { status: 500 }
    );
  }

  const hasil = cek.baris;
  const diubah = hasil.filter((r) => r.o_diubah).length;
  const barisBaru = hasil.filter((r) => r.o_periode_baru).length;
  // Tanggal baris baru yang tapel/semesternya terpaksa dari kalender (tidak ada data absensi pada tanggal itu).
  const periodeKalender = hasil
    .filter((r) => r.o_periode_baru && (r.o_periode_baru.sumber_tapel === "kalender" || r.o_periode_baru.sumber_semester === "kalender"))
    .map((r) => r.o_tanggal);

  return NextResponse.json({
    status: "ok",
    message: "Berhasil",
    diproses: rencana.diproses.length,
    diubah,
    dilewati: rencana.dilewati.length,
    tanggalDiproses: rencana.diproses,
    barisBaru,
    periodeKalender,
  });
}
