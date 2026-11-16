import { describe, it, expect, vi, beforeEach } from "vitest";

const store: Record<string, string> = {};
let baris: Record<string, unknown> | null = null;
let dbError: { message: string } | null = null;
const idDicari: number[] = [];

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: (tabel: string) => ({
      select: () => ({
        eq: (_k: string, id: number) => ({
          maybeSingle: async () => {
            if (tabel === "pengajuan_izin") idDicari.push(id);
            return dbError ? { data: null, error: dbError } : { data: baris, error: null };
          },
        }),
      }),
    }),
  },
}));
vi.mock("@/lib/data/settings", () => ({ getSettingValue: vi.fn(async (k: string, f: string) => store[k] ?? f) }));
vi.mock("@/lib/data/wa-log", () => ({ catatWaLog: vi.fn(async () => {}), catatWaLogBanyak: vi.fn(async () => {}) }));
vi.mock("@/lib/utils/whatsapp", async (orig) => ({ ...(await orig<typeof import("@/lib/utils/whatsapp")>()), kirimWhatsApp: vi.fn(), kirimWhatsAppFonnteBatch: vi.fn() }));

import { catatWaLog } from "@/lib/data/wa-log";
import { kirimWhatsApp } from "@/lib/utils/whatsapp";
import { kirimNotifKeputusan, resetWaConfigCache } from "./notifikasi";

const kirim = vi.mocked(kirimWhatsApp);
const log = vi.mocked(catatWaLog);

function atur(p: Record<string, string> = {}) {
  for (const k of Object.keys(store)) delete store[k];
  Object.assign(store, { wa_enabled: "true", wa_gateway_url: "https://gw.example/send", wa_api_key: "T", nama_sekolah: "SDN Contoh", ...p });
  resetWaConfigCache();
}
const pengajuan = (patch: Record<string, unknown> = {}, hp: string | null = "081234567890") => ({
  jenis: "sakit", status: "disetujui_sebagian", catatan_keputusan: "Susulkan surat", alasan: "RAHASIA-DEMAM", lampiran: "https://x/rahasia.png",
  students: { id: 42, name: "Budi", class: "5", no_hp_ortu: hp },
  pengajuan_izin_hari: [
    { tanggal: "2026-11-10", disetujui: true, aktif: true, hasil: "ditulis" },
    { tanggal: "2026-11-11", disetujui: false, aktif: true, hasil: "dialpha" },
    { tanggal: "2026-11-12", disetujui: null, aktif: false, hasil: null },
  ],
  ...patch,
});

beforeEach(() => {
  vi.clearAllMocks();
  idDicari.length = 0;
  dbError = null;
  baris = pengajuan();
  kirim.mockResolvedValue({ ok: true });
  atur();
});

describe("kirimNotifKeputusan", () => {
  it("terkirim: isi dari data TERSIMPAN, hari tidak aktif diabaikan, tanpa alasan/lampiran, tercatat tipe keputusan", async () => {
    await kirimNotifKeputusan(7);
    expect(idDicari).toEqual([7]);
    expect(kirim).toHaveBeenCalledTimes(1);
    const [url, kunci, nomor, pesan] = kirim.mock.calls[0];
    expect([url, kunci, nomor]).toEqual(["https://gw.example/send", "T", "081234567890"]);
    expect(pesan).toContain("*DISETUJUI SEBAGIAN*");
    expect(pesan).toContain("Disetujui: Sel, 10 Nov 2026.");
    expect(pesan).toContain("Tidak disetujui: Rab, 11 Nov 2026.");
    expect(pesan).not.toContain("12 Nov"); // hari dibatalkan (aktif=false)
    expect(pesan).toContain("Catatan wali kelas: Susulkan surat");
    expect(pesan).not.toMatch(/RAHASIA|rahasia\.png/);
    expect(log).toHaveBeenCalledWith({ siswaId: 42, namaSiswa: "Budi", nomorHp: "081234567890", tipe: "keputusan", status: "terkirim", errorMessage: undefined });
  });

  it("WA nonaktif / jenis dimatikan admin: tidak ada pesan dan tidak ada log (bukan kegagalan)", async () => {
    atur({ wa_enabled: "false" });
    await kirimNotifKeputusan(7);
    atur({ wa_notif_keputusan: "false" });
    await kirimNotifKeputusan(7);
    expect(kirim).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(idDicari).toEqual([]); // bahkan tidak membaca database
  });

  it("belum diputuskan (menunggu/dibatalkan): tidak mengirim apa pun", async () => {
    for (const status of ["menunggu", "dibatalkan"]) {
      baris = pengajuan({ status });
      await kirimNotifKeputusan(7);
    }
    expect(kirim).not.toHaveBeenCalled();
  });

  it("nomor HP kosong: dicatat gagal dengan alasan jelas, tanpa kirim", async () => {
    baris = pengajuan({}, null);
    await kirimNotifKeputusan(7);
    expect(kirim).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ tipe: "keputusan", status: "gagal", errorMessage: "Nomor HP orang tua belum diisi.", siswaId: 42 }));
  });

  it("gateway menolak: tercatat gagal dengan alasan gateway", async () => {
    kirim.mockResolvedValue({ ok: false, error: "Kuota habis" });
    await kirimNotifKeputusan(7);
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ status: "gagal", errorMessage: "Kuota habis" }));
  });

  it("pengajuan tidak ditemukan / database error: tidak melempar, tercatat gagal tanpa siswa", async () => {
    baris = null;
    await expect(kirimNotifKeputusan(99)).resolves.toBeUndefined();
    dbError = { message: "boom" };
    await expect(kirimNotifKeputusan(99)).resolves.toBeUndefined();
    expect(kirim).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenLastCalledWith(expect.objectContaining({ siswaId: null, namaSiswa: "Pengajuan #99", status: "gagal", errorMessage: "boom" }));
  });
});
