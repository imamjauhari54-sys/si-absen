import crypto from "crypto";
import { NextRequest } from "next/server";
import { getStudentSession } from "@/lib/auth/student-session";
import { verifikasiPinOrtu } from "@/lib/auth/pin-ortu";
import { jawabGalat, jawabOk } from "@/lib/api/respons";
import { bacaBodyJson, FOLDER_LAMPIRAN_PENGAJUAN, FORMAT_LAMPIRAN_PENGAJUAN, GALAT_BODY, parseBatal } from "@/lib/utils/pengajuan";

/**
 * Tanda tangan unggahan Cloudinary untuk lampiran pengajuan (foto surat dokter). Berbeda dari uploader guru yang memakai
 * preset publik, unggahan orang tua WAJIB lolos sesi siswa + PIN dulu, dan hanya boleh ke folder pengajuan dengan format
 * gambar tertentu. (Tanda tangan Cloudinary tidak dapat membatasi ukuran: batas 5 MB dijaga di sisi form.)
 *
 * Parameter yang ditandatangani (urut alfabet, lalu api_secret tanpa pemisah): allowed_formats, folder, timestamp.
 * Klien WAJIB mengirim persis ketiganya ke Cloudinary.
 */
export async function POST(req: NextRequest) {
  const sesi = await getStudentSession();
  if (!sesi) return jawabGalat({ ok: false, status: 401, message: "Sesi berakhir. Silakan masuk kembali." });

  const body = await bacaBodyJson(req);
  if (!body) return jawabGalat(GALAT_BODY);
  const p = parseBatal(body); // bentuknya sama: hanya { pin }
  if (!p.ok) return jawabGalat(p);

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    return jawabGalat({ ok: false, status: 500, message: "Unggah lampiran belum dikonfigurasi di server." });
  }

  const galatPin = await verifikasiPinOrtu(sesi.siswaId, p.pin);
  if (galatPin) return jawabGalat(galatPin);

  const timestamp = Math.round(Date.now() / 1000);
  const paramsToSign = `allowed_formats=${FORMAT_LAMPIRAN_PENGAJUAN}&folder=${FOLDER_LAMPIRAN_PENGAJUAN}&timestamp=${timestamp}`;
  const signature = crypto.createHash("sha1").update(paramsToSign + apiSecret).digest("hex");

  return jawabOk({
    signature,
    timestamp,
    apiKey,
    cloudName,
    folder: FOLDER_LAMPIRAN_PENGAJUAN,
    allowedFormats: FORMAT_LAMPIRAN_PENGAJUAN,
  });
}
