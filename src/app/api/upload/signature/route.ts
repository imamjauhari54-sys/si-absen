import crypto from "crypto";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";

const FOLDER = "si-absen/siswa";

export async function POST() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ status: "error", message: "Akses ditolak" }, { status: 403 });
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return NextResponse.json(
      { status: "error", message: "Cloudinary belum dikonfigurasi di server (.env.local)." },
      { status: 500 }
    );
  }

  const timestamp = Math.round(Date.now() / 1000);

  // Signature Cloudinary = sha1(semua parameter yang dikirim ke upload,
  // diurutkan alfabetis "key=value&key2=value2...", langsung diikuti
  // api_secret tanpa separator). Parameter file/cloud_name/api_key/resource_type
  // TIDAK ikut ditandatangani.
  const paramsToSign = `folder=${FOLDER}&timestamp=${timestamp}`;
  const signature = crypto.createHash("sha1").update(paramsToSign + apiSecret).digest("hex");

  return NextResponse.json({
    status: "ok",
    signature,
    timestamp,
    apiKey,
    cloudName,
    folder: FOLDER,
  });
}
