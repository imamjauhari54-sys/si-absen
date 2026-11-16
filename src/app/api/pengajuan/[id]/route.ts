import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { assertBolehAksesPengajuan } from "@/lib/auth/akses-pengajuan";
import { ambilDetailPengajuan, GalatBaca } from "@/lib/data/pengajuan";
import { jawabGalat, jawabOk } from "@/lib/api/respons";
import { parseIdPositif } from "@/lib/utils/absen-edit";
import { petakanGalatDb } from "@/lib/utils/pengajuan";

/**
 * Detail satu pengajuan + PRATINJAU per hari: untuk tiap hari, apa yang terjadi bila disetujui (dicatat sekarang /
 * dijadwalkan / scan menang / sudah tercatat) dan bila tidak disetujui (Alpha / tidak berubah). Hanya membaca.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "guru")) {
    return jawabGalat({ ok: false, status: 403, message: "Unauthorized" });
  }
  const id = parseIdPositif((await params).id);
  if (id === null) return jawabGalat({ ok: false, status: 404, message: "Pengajuan tidak ditemukan" });

  try {
    const akses = await assertBolehAksesPengajuan(session, id);
    if (!akses.ok) return jawabGalat({ ok: false, status: akses.status, message: akses.message });
    const detail = await ambilDetailPengajuan(id);
    if (!detail) return jawabGalat({ ok: false, status: 404, message: "Pengajuan tidak ditemukan" });
    return jawabOk({ ...detail });
  } catch (e) {
    console.error("[api/pengajuan/:id GET] gagal:", e instanceof Error ? e.message : e);
    return jawabGalat(petakanGalatDb({ code: e instanceof GalatBaca ? e.kodeDb : null }));
  }
}
