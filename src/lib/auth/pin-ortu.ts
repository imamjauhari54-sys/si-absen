import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { petakanGalatDb, petakanHasilPin, type Galat } from "@/lib/utils/pengajuan";

/**
 * Periksa PIN orang tua di DATABASE (verifikasi_pin_ortu, migrasi 027): hitungan salah, penguncian, dan kunci baris
 * semuanya di SQL sehingga percobaan paralel tetap dihitung bergantian. null = PIN benar.
 * Dipanggil SEBELUM tindakan tulis apa pun atas nama orang tua (ajukan, batalkan, ganti PIN, tanda tangan unggahan).
 */
export async function verifikasiPinOrtu(siswaId: number, pin: string): Promise<Galat | null> {
  const { data, error } = await supabaseAdmin.rpc("verifikasi_pin_ortu", { p_siswa_id: siswaId, p_pin: pin });
  if (error) {
    console.error("[pin-ortu] RPC verifikasi_pin_ortu gagal:", { code: error.code, message: error.message });
    return petakanGalatDb(error);
  }
  return petakanHasilPin(data);
}
