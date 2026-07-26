import { supabaseAdmin } from "@/lib/supabase/server";
import { getSettingValue } from "@/lib/data/settings";
import { kirimWhatsApp } from "@/lib/utils/whatsapp";
import { catatWaLog } from "@/lib/data/wa-log";

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
 *
 * Setiap percobaan (berhasil maupun gagal, termasuk error tak terduga) selalu
 * dicatat ke tabel wa_log lewat catatWaLog() — sebelumnya kegagalan di sini
 * ditelan diam-diam (catch{} kosong), jadi kalau gateway WA down, sama sekali
 * tidak ada jejak buat ditelusuri kenapa notif ortu tidak sampai.
 */
export async function kirimNotifAbsen(
  siswaId: number,
  namaSiswa: string,
  kelas: string,
  status: "hadir" | "terlambat" | "pulang",
  jam: string
): Promise<void> {
  let nomor: string | null = null;
  try {
    const cfg = await getWaConfig();
    if (!cfg.enabled || !cfg.gatewayUrl || !cfg.apiKey) return; // fitur nonaktif, bukan kegagalan — tidak perlu dilog

    const { data: siswa } = await supabaseAdmin.from("students").select("no_hp_ortu").eq("id", siswaId).maybeSingle();
    nomor = siswa?.no_hp_ortu ?? null;
    if (!nomor) {
      await catatWaLog({
        siswaId,
        namaSiswa,
        nomorHp: null,
        tipe: "absen",
        status: "gagal",
        errorMessage: "Nomor HP orang tua belum diisi.",
      });
      return;
    }

    const namaSekolah = await getSettingValue("nama_sekolah", "Sekolah");
    const label = status === "hadir" ? "HADIR" : status === "terlambat" ? "TERLAMBAT" : "PULANG";
    const jamSingkat = jam.slice(0, 5);

    const pesan =
      `Assalamu'alaikum, Ananda *${namaSiswa}* (Kelas ${kelas}) tercatat *${label}* di sekolah ` +
      `pukul ${jamSingkat} WIB.\n\n${namaSekolah}\n_Pesan otomatis dari SI-ABSEN, mohon tidak dibalas._`;

    const hasil = await kirimWhatsApp(cfg.gatewayUrl, cfg.apiKey, nomor, pesan);
    await catatWaLog({
      siswaId,
      namaSiswa,
      nomorHp: nomor,
      tipe: "absen",
      status: hasil.ok ? "terkirim" : "gagal",
      errorMessage: hasil.ok ? undefined : hasil.error,
    });
  } catch (e) {
    // Error tak terduga (mis. getSettingValue/query lain gagal) — tetap
    // dicatat, bukan ditelan diam-diam seperti sebelumnya.
    await catatWaLog({
      siswaId,
      namaSiswa,
      nomorHp: nomor,
      tipe: "absen",
      status: "gagal",
      errorMessage: e instanceof Error ? e.message : "Error tidak diketahui.",
    });
  }
}

/** Versi untuk auto-alpha (siswa yang tidak absen sama sekali hari itu). */
export async function kirimNotifAlpha(siswaId: number, namaSiswa: string, kelas: string, tanggal: string): Promise<void> {
  let nomor: string | null = null;
  try {
    const cfg = await getWaConfig();
    if (!cfg.enabled || !cfg.gatewayUrl || !cfg.apiKey) return;

    const { data: siswa } = await supabaseAdmin.from("students").select("no_hp_ortu").eq("id", siswaId).maybeSingle();
    nomor = siswa?.no_hp_ortu ?? null;
    if (!nomor) {
      await catatWaLog({
        siswaId,
        namaSiswa,
        nomorHp: null,
        tipe: "alpha",
        status: "gagal",
        errorMessage: "Nomor HP orang tua belum diisi.",
      });
      return;
    }

    const namaSekolah = await getSettingValue("nama_sekolah", "Sekolah");
    const pesan =
      `Assalamu'alaikum, Ananda *${namaSiswa}* (Kelas ${kelas}) tercatat *TIDAK HADIR (Alpha)* di sekolah ` +
      `pada tanggal ${tanggal} karena tidak melakukan absensi.\n\n${namaSekolah}\n_Pesan otomatis dari SI-ABSEN, mohon tidak dibalas._`;

    const hasil = await kirimWhatsApp(cfg.gatewayUrl, cfg.apiKey, nomor, pesan);
    await catatWaLog({
      siswaId,
      namaSiswa,
      nomorHp: nomor,
      tipe: "alpha",
      status: hasil.ok ? "terkirim" : "gagal",
      errorMessage: hasil.ok ? undefined : hasil.error,
    });
  } catch (e) {
    await catatWaLog({
      siswaId,
      namaSiswa,
      nomorHp: nomor,
      tipe: "alpha",
      status: "gagal",
      errorMessage: e instanceof Error ? e.message : "Error tidak diketahui.",
    });
  }
}
