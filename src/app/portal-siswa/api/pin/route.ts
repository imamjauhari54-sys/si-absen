import { NextRequest } from "next/server";
import { getStudentSession } from "@/lib/auth/student-session";
import { supabaseAdmin } from "@/lib/supabase/server";
import { jawabGalat, jawabOk } from "@/lib/api/respons";
import { bacaBodyJson, GALAT_BODY, parseGantiPin, petakanGalatDb, petakanHasilPin } from "@/lib/utils/pengajuan";

/**
 * Orang tua mengganti PIN sendiri. Wajib PIN lama yang benar (ikut hitungan salah/penguncian yang sama dengan
 * pengajuan: dikerjakan atur_pin_ortu di SQL). PIN pertama TIDAK bisa dibuat di sini: hanya wali kelas/admin yang
 * membuat PIN acak, supaya tidak ada PIN yang bisa ditebak lewat NISN saja.
 */
export async function POST(req: NextRequest) {
  const sesi = await getStudentSession();
  if (!sesi) return jawabGalat({ ok: false, status: 401, message: "Sesi berakhir. Silakan masuk kembali." });

  const body = await bacaBodyJson(req);
  if (!body) return jawabGalat(GALAT_BODY);
  const p = parseGantiPin(body);
  if (!p.ok) return jawabGalat(p);

  const { data, error } = await supabaseAdmin.rpc("atur_pin_ortu", {
    p_siswa_id: sesi.siswaId,
    p_pin_baru: p.pinBaru,
    p_pin_lama: p.pinLama,
    p_paksa: false,
  });
  if (error) {
    console.error("[portal/pin] RPC atur_pin_ortu gagal:", { code: error.code, message: error.message });
    return jawabGalat(petakanGalatDb(error));
  }
  const galat = petakanHasilPin(data);
  if (galat) return jawabGalat(galat);
  return jawabOk({ message: "PIN berhasil diganti." });
}
