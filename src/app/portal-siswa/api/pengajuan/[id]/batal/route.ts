import { NextRequest } from "next/server";
import { getStudentSession } from "@/lib/auth/student-session";
import { verifikasiPinOrtu } from "@/lib/auth/pin-ortu";
import { supabaseAdmin } from "@/lib/supabase/server";
import { jawabGalat, jawabOk } from "@/lib/api/respons";
import { segarkanPenandaPengajuan } from "@/lib/data/penanda-pengajuan";
import { parseIdPositif } from "@/lib/utils/absen-edit";
import { bacaBodyJson, GALAT_BODY, parseBatal, petakanGalatDb } from "@/lib/utils/pengajuan";

/**
 * Orang tua membatalkan pengajuan yang MASIH Menunggu. Wajib PIN. Kepemilikan dijaga SQL (batalkan_pengajuan_izin
 * menerima id siswa dari sesi; pengajuan milik siswa lain dijawab "tidak ditemukan"). Hari lampau yang batal dicatat
 * Alpha oleh SQL (tanpa WhatsApp).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesi = await getStudentSession();
  if (!sesi) return jawabGalat({ ok: false, status: 401, message: "Sesi berakhir. Silakan masuk kembali." });

  const id = parseIdPositif((await params).id);
  if (id === null) return jawabGalat({ ok: false, status: 404, message: "Pengajuan tidak ditemukan." });

  const body = await bacaBodyJson(req);
  if (!body) return jawabGalat(GALAT_BODY);
  const p = parseBatal(body);
  if (!p.ok) return jawabGalat(p);

  const galatPin = await verifikasiPinOrtu(sesi.siswaId, p.pin);
  if (galatPin) return jawabGalat(galatPin);

  const { data, error } = await supabaseAdmin.rpc("batalkan_pengajuan_izin", { p_id: id, p_siswa_id: sesi.siswaId });
  if (error) {
    const g = petakanGalatDb(error);
    if (g.status >= 500) console.error("[portal/pengajuan batal] RPC gagal:", { code: error.code, message: error.message });
    // "Pengajuan tidak ditemukan." dari SQL = bukan milik siswa ini atau tidak ada: 404, bukan 422.
    if (g.status === 422 && g.message === "Pengajuan tidak ditemukan.") return jawabGalat({ ...g, status: 404 });
    return jawabGalat(g);
  }
  segarkanPenandaPengajuan();
  return jawabOk({ message: "Pengajuan dibatalkan.", hasil: data });
}
