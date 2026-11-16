import { after, NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { assertBolehAksesPengajuan } from "@/lib/auth/akses-pengajuan";
import { supabaseAdmin } from "@/lib/supabase/server";
import { GalatBaca } from "@/lib/data/pengajuan";
import { segarkanPenandaPengajuan } from "@/lib/data/penanda-pengajuan";
import { kirimNotifKeputusan } from "@/lib/wa/notifikasi";
import { jawabGalat, jawabOk } from "@/lib/api/respons";
import { parseIdPositif } from "@/lib/utils/absen-edit";
import { bacaBodyJson, GALAT_BODY, parsePutuskan, petakanGalatDb } from "@/lib/utils/pengajuan";

/**
 * Putuskan pengajuan: { keputusan: "setujui" | "tolak", hari?: ["YYYY-MM-DD", ...], catatan?: string }.
 *  - setujui tanpa `hari` = semua hari disetujui; dengan `hari` = persetujuan SEBAGIAN (hari yang tidak dipilih
 *    TIDAK otomatis izin/sakit, mengikuti aturan normal).
 *  - tolak = seluruh pengajuan ditolak.
 *
 * Seluruh keputusan dikerjakan SATU transaksi di SQL (putuskan_pengajuan_izin): kunci baris siswa & pengajuan, tulis lewat
 * edit_manual_absensi (snapshot, bisa dipulihkan), scan Hadir/Terlambat tidak pernah ditimpa. Dua orang memutuskan bersamaan:
 * yang kedua mendapat "Pengajuan sudah diputuskan." (422). Pemutus (id & nama) diambil dari sesi, bukan dari input.
 * Setelah SUKSES, orang tua diberi tahu lewat WhatsApp di after() (kirimNotifKeputusan; hanya bila WA aktif dan jenis
 * "Keputusan izin/sakit" tidak dimatikan admin). Kegagalan kirim tidak pernah menggagalkan keputusan; tercatat di wa_log.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "guru")) {
    return jawabGalat({ ok: false, status: 403, message: "Unauthorized" });
  }
  const id = parseIdPositif((await params).id);
  if (id === null) return jawabGalat({ ok: false, status: 404, message: "Pengajuan tidak ditemukan" });

  const body = await bacaBodyJson(req);
  if (!body) return jawabGalat(GALAT_BODY);
  const p = parsePutuskan(body);
  if (!p.ok) return jawabGalat(p);

  try {
    // Otorisasi per pengajuan DULU, sebelum penulisan apa pun.
    const akses = await assertBolehAksesPengajuan(session, id);
    if (!akses.ok) return jawabGalat({ ok: false, status: akses.status, message: akses.message });

    const { data, error } = await supabaseAdmin.rpc("putuskan_pengajuan_izin", {
      p_id: id,
      p_keputusan: p.nilai.keputusan,
      p_hari: p.nilai.hari,
      p_catatan: p.nilai.catatan,
      p_editor_id: session.userId,
      p_editor_nama: session.nama || session.username,
    });
    if (error) {
      const g = petakanGalatDb(error);
      if (g.status >= 500) console.error("[api/pengajuan putuskan] RPC gagal:", { code: error.code, message: error.message, details: error.details, hint: error.hint });
      return jawabGalat(g);
    }
    segarkanPenandaPengajuan();
    // Setelah respons terkirim (serverless bisa membekukan eksekusi bila tidak dibungkus after()).
    after(() => kirimNotifKeputusan(id));
    return jawabOk({
      message: p.nilai.keputusan === "setujui" ? "Pengajuan disetujui." : "Pengajuan ditolak.",
      pengajuanId: id,
      siswaId: akses.siswaId,
      hasil: data,
    });
  } catch (e) {
    console.error("[api/pengajuan putuskan] gagal:", e instanceof Error ? e.message : e);
    return jawabGalat(petakanGalatDb({ code: e instanceof GalatBaca ? e.kodeDb : null }));
  }
}
