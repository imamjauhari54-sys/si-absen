import { NextRequest } from "next/server";
import { getStudentSession } from "@/lib/auth/student-session";
import { verifikasiPinOrtu } from "@/lib/auth/pin-ortu";
import { supabaseAdmin } from "@/lib/supabase/server";
import { ambilPengajuanSiswa, ambilStatusPinSiswa, GalatBaca } from "@/lib/data/pengajuan";
import { jawabGalat, jawabOk } from "@/lib/api/respons";
import { segarkanPenandaPengajuan } from "@/lib/data/penanda-pengajuan";
import { ATURAN_PENGAJUAN, bacaBodyJson, GALAT_BODY, parseAjukan, petakanGalatDb } from "@/lib/utils/pengajuan";

/**
 * API Portal Siswa: pengajuan izin/sakit oleh orang tua (migrasi 027).
 *
 * Path ada di bawah /portal-siswa sehingga TIDAK dicegat proxy sesi admin (sesi siswa terpisah, dijaga di sini).
 * Identitas siswa SELALU dari sesi (JWT bertanda tangan), tidak pernah dari body/query.
 *
 * GET  : read-only seperti portal lain (cukup sesi NISN). Sengaja TIDAK memuat alasan dan URL lampiran, karena bisa
 *        berisi info kesehatan sedangkan NISN bukan rahasia yang kuat.
 * POST : mengajukan. WAJIB PIN 6 digit acak yang dibuat wali kelas/admin. Urutan: bentuk input -> PIN -> aturan bisnis
 *        (semua di SQL: ajukan_pengajuan_izin, atomik dan aman dari klik ganda/permintaan bersamaan).
 *        Pengajuan TIDAK PERNAH langsung mengubah absensi.
 */

export async function GET() {
  const sesi = await getStudentSession();
  if (!sesi) return jawabGalat({ ok: false, status: 401, message: "Sesi berakhir. Silakan masuk kembali." });
  try {
    const [pengajuan, pin] = await Promise.all([ambilPengajuanSiswa(sesi.siswaId), ambilStatusPinSiswa(sesi.siswaId)]);
    return jawabOk({ pengajuan, pin, aturan: ATURAN_PENGAJUAN });
  } catch (e) {
    const kode = e instanceof GalatBaca ? e.kodeDb : null;
    console.error("[portal/pengajuan GET] gagal:", e instanceof Error ? e.message : e);
    return jawabGalat(petakanGalatDb({ code: kode }));
  }
}

export async function POST(req: NextRequest) {
  const sesi = await getStudentSession();
  if (!sesi) return jawabGalat({ ok: false, status: 401, message: "Sesi berakhir. Silakan masuk kembali." });

  const body = await bacaBodyJson(req);
  if (!body) return jawabGalat(GALAT_BODY);
  const p = parseAjukan(body, process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME);
  if (!p.ok) return jawabGalat(p);
  const input = p.nilai;

  const galatPin = await verifikasiPinOrtu(sesi.siswaId, input.pin);
  if (galatPin) return jawabGalat(galatPin);

  const { data, error } = await supabaseAdmin.rpc("ajukan_pengajuan_izin", {
    p_siswa_id: sesi.siswaId,
    p_jenis: input.jenis,
    p_dari: input.dari,
    p_sampai: input.sampai,
    p_alasan: input.alasan,
    p_lampiran: input.lampiran,
  });
  if (error) {
    const g = petakanGalatDb(error);
    if (g.status >= 500) console.error("[portal/pengajuan POST] RPC ajukan_pengajuan_izin gagal:", { code: error.code, message: error.message, details: error.details, hint: error.hint });
    return jawabGalat(g);
  }
  segarkanPenandaPengajuan(); // penanda jumlah di menu wali kelas/admin
  return jawabOk({ message: "Pengajuan terkirim dan menunggu persetujuan wali kelas.", pengajuan: data }, 201);
}
