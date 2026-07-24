import { supabaseAdmin } from "@/lib/supabase/server";
import { getSettingValue } from "@/lib/data/settings";
import { kirimWhatsApp } from "@/lib/utils/whatsapp";

export interface WaConfig {
  enabled: boolean;
  gatewayUrl: string;
  apiKey: string;
}

export async function getWaConfig(): Promise<WaConfig> {
  const [enabled, gatewayUrl, apiKey] = await Promise.all([
    getSettingValue("wa_enabled", "false"),
    getSettingValue("wa_gateway_url", ""),
    getSettingValue("wa_api_key", ""),
  ]);
  return { enabled: enabled === "true", gatewayUrl, apiKey };
}

/**
 * Kirim notifikasi absensi ke orang tua/wali lewat WhatsApp (kalau fitur ini
 * aktif & nomor HP-nya terisi). Sengaja "fire and forget" & fail-safe —
 * dipanggil TANPA await dari proses scan supaya tidak memperlambat respons
 * scan, dan kalau gagal kirim, proses absensi tetap dianggap sukses.
 */
export async function kirimNotifAbsen(
  siswaId: number,
  namaSiswa: string,
  kelas: string,
  status: "hadir" | "terlambat" | "pulang",
  jam: string
): Promise<void> {
  try {
    const cfg = await getWaConfig();
    if (!cfg.enabled || !cfg.gatewayUrl || !cfg.apiKey) return;

    const { data: siswa } = await supabaseAdmin.from("students").select("no_hp_ortu").eq("id", siswaId).maybeSingle();
    const nomor = siswa?.no_hp_ortu;
    if (!nomor) return;

    const namaSekolah = await getSettingValue("nama_sekolah", "Sekolah");
    const label = status === "hadir" ? "HADIR" : status === "terlambat" ? "TERLAMBAT" : "PULANG";
    const jamSingkat = jam.slice(0, 5);

    const pesan =
      `Assalamu'alaikum, Ananda *${namaSiswa}* (Kelas ${kelas}) tercatat *${label}* di sekolah ` +
      `pukul ${jamSingkat} WIB.\n\n${namaSekolah}\n_Pesan otomatis dari SI-ABSEN, mohon tidak dibalas._`;

    await kirimWhatsApp(cfg.gatewayUrl, cfg.apiKey, nomor, pesan);
  } catch {
    // sengaja diabaikan — notifikasi WA tidak boleh menggagalkan proses absensi
  }
}

/** Versi untuk auto-alpha (siswa yang tidak absen sama sekali hari itu). */
export async function kirimNotifAlpha(siswaId: number, namaSiswa: string, kelas: string, tanggal: string): Promise<void> {
  try {
    const cfg = await getWaConfig();
    if (!cfg.enabled || !cfg.gatewayUrl || !cfg.apiKey) return;

    const { data: siswa } = await supabaseAdmin.from("students").select("no_hp_ortu").eq("id", siswaId).maybeSingle();
    const nomor = siswa?.no_hp_ortu;
    if (!nomor) return;

    const namaSekolah = await getSettingValue("nama_sekolah", "Sekolah");
    const pesan =
      `Assalamu'alaikum, Ananda *${namaSiswa}* (Kelas ${kelas}) tercatat *TIDAK HADIR (Alpha)* di sekolah ` +
      `pada tanggal ${tanggal} karena tidak melakukan absensi.\n\n${namaSekolah}\n_Pesan otomatis dari SI-ABSEN, mohon tidak dibalas._`;

    await kirimWhatsApp(cfg.gatewayUrl, cfg.apiKey, nomor, pesan);
  } catch {
    // sengaja diabaikan
  }
}
