import { supabaseAdmin } from "@/lib/supabase/server";
import { getSettingValue } from "@/lib/data/settings";
import {
  DELAY_BATCH_FONNTE,
  MAKS_PENERIMA_BATCH,
  formatNomorWa,
  isFonnte,
  kirimWhatsApp,
  kirimWhatsAppFonnteBatch,
  type PenerimaBatch,
} from "@/lib/utils/whatsapp";
import { catatWaLog, catatWaLogBanyak, type WaLogInput } from "@/lib/data/wa-log";
import { JENIS_NOTIF, parseNotif, type PengaturanNotif } from "@/lib/wa/jenis-notifikasi";

export interface WaConfig {
  enabled: boolean;
  gatewayUrl: string;
  apiKey: string;
  /** Jenis notifikasi mana yang boleh dikirim (pengaturan admin; bawaan: hanya Alpha). */
  notif: PengaturanNotif;
}

// Sebelumnya getWaConfig() menjalankan 3 query ke tabel settings di SETIAP scan,
// walaupun fitur WA nonaktif. Sekarang di-cache di memori instance selama 30
// detik. Sengaja BUKAN unstable_cache: API key gateway tidak perlu masuk Data
// Cache. Setelah admin menyimpan pengaturan WA, resetWaConfigCache() dipanggil
// (instance lain menyusul paling lama sebesar TTL).
const WA_CONFIG_TTL_MS = 30_000;
let waConfigCache: { at: number; cfg: WaConfig } | null = null;

export function resetWaConfigCache(): void {
  waConfigCache = null;
}

export async function getWaConfig(): Promise<WaConfig> {
  const sekarang = Date.now();
  if (waConfigCache && sekarang - waConfigCache.at < WA_CONFIG_TTL_MS) return waConfigCache.cfg;

  const [enabled, gatewayUrl, apiKey, ...notifMentah] = await Promise.all([
    getSettingValue("wa_enabled", "false"),
    getSettingValue("wa_gateway_url", ""),
    getSettingValue("wa_api_key", ""),
    ...JENIS_NOTIF.map((j) => getSettingValue(j.settingKey, "")),
  ]);
  const notif = parseNotif(Object.fromEntries(JENIS_NOTIF.map((j, i) => [j.kunci, notifMentah[i]])));
  const cfg: WaConfig = { enabled: enabled === "true", gatewayUrl, apiKey, notif };
  waConfigCache = { at: sekarang, cfg };
  return cfg;
}

function pesanAbsen(namaSiswa: string, kelas: string, status: "hadir" | "terlambat" | "pulang", jam: string, namaSekolah: string): string {
  const label = status === "hadir" ? "HADIR" : status === "terlambat" ? "TERLAMBAT" : "PULANG";
  return (
    `Assalamu'alaikum, Ananda *${namaSiswa}* (Kelas ${kelas}) tercatat *${label}* di sekolah ` +
    `pukul ${jam.slice(0, 5)} WIB.\n\n${namaSekolah}\n_Pesan otomatis dari SI-ABSEN, mohon tidak dibalas._`
  );
}

function pesanAlpha(namaSiswa: string, kelas: string, tanggal: string, namaSekolah: string): string {
  return (
    `Assalamu'alaikum, Ananda *${namaSiswa}* (Kelas ${kelas}) tercatat *TIDAK HADIR (Alpha)* di sekolah ` +
    `pada tanggal ${tanggal} karena tidak melakukan absensi.\n\n${namaSekolah}\n_Pesan otomatis dari SI-ABSEN, mohon tidak dibalas._`
  );
}

/**
 * Kirim notifikasi absensi ke orang tua/wali lewat WhatsApp (kalau fitur ini
 * aktif, jenis notifikasinya diizinkan admin, & nomor HP-nya terisi). Fail-safe: kalau gagal
 * kirim, proses absensi tetap dianggap sukses. Di serverless JANGAN dipanggil
 * "telanjang" tanpa await (eksekusi bisa dibekukan setelah respons dikirim,
 * notifikasi hilang acak) — bungkus dengan after() dari next/server supaya
 * jalan setelah respons tanpa memperlambat scan.
 *
 * Satu scan = satu status = SATU pesan: status ditentukan lebih dulu oleh pemanggil
 * (hadir ATAU terlambat), lalu dicek apakah jenis itu diaktifkan — tidak pernah dua pesan
 * untuk satu scan walaupun Hadir dan Terlambat sama-sama aktif.
 *
 * Setiap percobaan (berhasil maupun gagal, termasuk error tak terduga) selalu
 * dicatat ke tabel wa_log lewat catatWaLog().
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
    // Divalidasi di SERVER pada setiap kirim (bukan hanya di form). Jenis yang dimatikan bukan kegagalan.
    if (!cfg.notif[status]) return;

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
    const hasil = await kirimWhatsApp(cfg.gatewayUrl, cfg.apiKey, nomor, pesanAbsen(namaSiswa, kelas, status, jam, namaSekolah));
    await catatWaLog({
      siswaId,
      namaSiswa,
      nomorHp: nomor,
      tipe: "absen",
      status: hasil.ok ? "terkirim" : "gagal",
      errorMessage: hasil.ok ? undefined : hasil.error,
    });
  } catch (e) {
    // Error tak terduga (mis. getSettingValue/query lain gagal) — tetap dicatat.
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

/** Versi untuk auto-alpha (siswa yang tidak absen sama sekali hari itu), satu siswa per panggilan. */
export async function kirimNotifAlpha(siswaId: number, namaSiswa: string, kelas: string, tanggal: string): Promise<void> {
  let nomor: string | null = null;
  try {
    const cfg = await getWaConfig();
    if (!cfg.enabled || !cfg.gatewayUrl || !cfg.apiKey) return;
    if (!cfg.notif.alpha) return;

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
    const hasil = await kirimWhatsApp(cfg.gatewayUrl, cfg.apiKey, nomor, pesanAlpha(namaSiswa, kelas, tanggal, namaSekolah));
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

// Gateway non-Fonnte: dikirim per siswa, berkelompok sebanyak ini sekaligus.
const KELOMPOK_PER_SISWA = 5;
const BATAS_ID_PER_QUERY = 100;

/**
 * Notifikasi alpha untuk SEMUA siswa yang baru ditetapkan alpha — dipanggil sekali setelah proses
 * auto-alpha selesai (di dalam after()).
 *
 * - Fonnte: satu permintaan batch per ≤100 penerima, dengan jeda acak antar pesan yang diatur
 *   Fonnte sendiri. Tidak ada lagi puluhan pesan menumpuk "pending" di detik yang sama, dan tidak
 *   ada risiko terpotong batas durasi fungsi karena permintaannya hanya sedikit.
 * - Gateway lain: cara lama (per siswa, berkelompok).
 *
 * Setiap siswa tetap punya satu baris wa_log; kegagalan (nomor kosong/tidak valid, ditolak
 * gateway, timeout) tercatat per siswa. "terkirim" = diterima gateway, bukan jaminan sudah sampai.
 */
export async function kirimNotifAlphaMassal(
  siswa: { id: number; name: string; class: string }[],
  tanggal: string
): Promise<void> {
  if (siswa.length === 0) return;

  const catatSemuaGagal = (alasan: string) =>
    catatWaLogBanyak(
      siswa.map((s) => ({ siswaId: s.id, namaSiswa: s.name, nomorHp: null, tipe: "alpha" as const, status: "gagal" as const, errorMessage: alasan }))
    );

  try {
    const cfg = await getWaConfig();
    if (!cfg.enabled || !cfg.gatewayUrl || !cfg.apiKey) return;
    if (!cfg.notif.alpha) return;

    if (!isFonnte(cfg.gatewayUrl)) {
      for (let i = 0; i < siswa.length; i += KELOMPOK_PER_SISWA) {
        await Promise.all(siswa.slice(i, i + KELOMPOK_PER_SISWA).map((s) => kirimNotifAlpha(s.id, s.name, s.class, tanggal)));
      }
      return;
    }

    // Nomor HP semua siswa dalam beberapa query (bukan satu query per siswa).
    const nomorById = new Map<number, string | null>();
    for (let i = 0; i < siswa.length; i += BATAS_ID_PER_QUERY) {
      const ids = siswa.slice(i, i + BATAS_ID_PER_QUERY).map((s) => s.id);
      const { data } = await supabaseAdmin.from("students").select("id, no_hp_ortu").in("id", ids);
      for (const r of data ?? []) nomorById.set(r.id, r.no_hp_ortu ?? null);
    }
    const namaSekolah = await getSettingValue("nama_sekolah", "Sekolah");

    const log: WaLogInput[] = [];
    const siap: (PenerimaBatch & { siswaId: number; nomorAsli: string; namaAsli: string })[] = [];
    for (const s of siswa) {
      const mentah = nomorById.get(s.id) ?? null;
      if (!mentah) {
        log.push({ siswaId: s.id, namaSiswa: s.name, nomorHp: null, tipe: "alpha", status: "gagal", errorMessage: "Nomor HP orang tua belum diisi." });
        continue;
      }
      const nomor = formatNomorWa(mentah);
      if (!nomor) {
        log.push({ siswaId: s.id, namaSiswa: s.name, nomorHp: mentah, tipe: "alpha", status: "gagal", errorMessage: "Nomor HP tidak valid." });
        continue;
      }
      siap.push({ siswaId: s.id, nomor, nama: s.name, kelas: s.class, nomorAsli: mentah, namaAsli: s.name });
    }

    // {name} dan {var1} diisi Fonnte dari tiap target ("nomor|nama|kelas").
    const templat = pesanAlpha("{name}", "{var1}", tanggal, namaSekolah);
    for (let i = 0; i < siap.length; i += MAKS_PENERIMA_BATCH) {
      const kelompok = siap.slice(i, i + MAKS_PENERIMA_BATCH);
      const hasil = await kirimWhatsAppFonnteBatch(cfg.gatewayUrl, cfg.apiKey, kelompok, templat, DELAY_BATCH_FONNTE);
      for (const p of kelompok) {
        log.push({
          siswaId: p.siswaId,
          namaSiswa: p.namaAsli,
          nomorHp: p.nomorAsli,
          tipe: "alpha",
          status: hasil.ok ? "terkirim" : "gagal",
          errorMessage: hasil.ok ? undefined : hasil.error,
        });
      }
    }

    await catatWaLogBanyak(log);
  } catch (e) {
    // Error tak terduga: tetap meninggalkan jejak untuk setiap siswa, bukan hilang diam-diam.
    await catatSemuaGagal(e instanceof Error ? e.message : "Error tidak diketahui.");
  }
}
