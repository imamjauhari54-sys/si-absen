import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getBatasKelas } from "@/lib/auth/akses-kelas";
import { ambilDaftarPengajuan, GalatBaca } from "@/lib/data/pengajuan";
import { jawabGalat, jawabOk } from "@/lib/api/respons";
import { parseHalaman, petakanGalatDb } from "@/lib/utils/pengajuan";

/**
 * Daftar pengajuan izin/sakit untuk wali kelas/admin.
 *   GET /api/pengajuan?status=menunggu|semua&kelas=5&page=1
 * Admin: semua kelas (filter kelas opsional). Guru: HANYA kelas wali-nya, dibaca dari DB; parameter kelas dari klien
 * diabaikan, dan guru tanpa kelas ditolak (fail-closed, tidak pernah jatuh ke "semua kelas").
 */
const PER_HALAMAN = 20;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "guru")) {
    return jawabGalat({ ok: false, status: 403, message: "Unauthorized" });
  }

  const batas = await getBatasKelas(session);
  let kelas: string | null;
  if (batas.semua) {
    const k = (req.nextUrl.searchParams.get("kelas") ?? "").trim();
    kelas = k === "" ? null : k;
  } else {
    if (!batas.kelas) return jawabGalat({ ok: false, status: 403, message: "Anda belum menjadi wali kelas." });
    kelas = batas.kelas;
  }

  const status = req.nextUrl.searchParams.get("status") === "semua" ? "semua" : "menunggu";
  const halaman = parseHalaman(req.nextUrl.searchParams.get("page"), 1, 10_000);

  try {
    const { baris, total } = await ambilDaftarPengajuan({ kelas, status, halaman, perHalaman: PER_HALAMAN });
    return jawabOk({ pengajuan: baris, total, halaman, perHalaman: PER_HALAMAN, totalHalaman: Math.max(1, Math.ceil(total / PER_HALAMAN)) });
  } catch (e) {
    console.error("[api/pengajuan GET] gagal:", e instanceof Error ? e.message : e);
    return jawabGalat(petakanGalatDb({ code: e instanceof GalatBaca ? e.kodeDb : null }));
  }
}
