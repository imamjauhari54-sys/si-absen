import { describe, it, expect, vi, beforeEach } from "vitest";

const store: Record<string, string> = {};
const phones: Record<number, string | null> = {};
let dbError: Error | null = null;

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: (_k: string, id: number) => ({
          maybeSingle: async () => {
            if (dbError) throw dbError;
            return { data: { no_hp_ortu: phones[id] ?? null } };
          },
        }),
        in: async (_k: string, ids: number[]) => {
          if (dbError) throw dbError;
          return { data: ids.map((id) => ({ id, no_hp_ortu: phones[id] ?? null })) };
        },
      }),
    }),
  },
}));
vi.mock("@/lib/data/settings", () => ({
  getSettingValue: vi.fn(async (key: string, fallback: string) => store[key] ?? fallback),
}));
vi.mock("@/lib/data/wa-log", () => ({
  catatWaLog: vi.fn(async () => {}),
  catatWaLogBanyak: vi.fn(async () => {}),
}));
vi.mock("@/lib/utils/whatsapp", async (importOriginal) => {
  const asli = await importOriginal<typeof import("@/lib/utils/whatsapp")>();
  return { ...asli, kirimWhatsApp: vi.fn(), kirimWhatsAppFonnteBatch: vi.fn() };
});

import { catatWaLog, catatWaLogBanyak } from "@/lib/data/wa-log";
import { kirimWhatsApp, kirimWhatsAppFonnteBatch } from "@/lib/utils/whatsapp";
import { getWaConfig, kirimNotifAbsen, kirimNotifAlpha, kirimNotifAlphaMassal, resetWaConfigCache } from "./notifikasi";

const kirim = vi.mocked(kirimWhatsApp);
const batch = vi.mocked(kirimWhatsAppFonnteBatch);
const log = vi.mocked(catatWaLog);
const logBanyak = vi.mocked(catatWaLogBanyak);

function atur(pengaturan: Record<string, string>) {
  for (const k of Object.keys(store)) delete store[k];
  Object.assign(store, {
    wa_enabled: "true",
    wa_gateway_url: "https://api.fonnte.com/send",
    wa_api_key: "TOKEN",
    nama_sekolah: "SDN Contoh",
    ...pengaturan,
  });
  resetWaConfigCache();
}

beforeEach(() => {
  vi.clearAllMocks();
  dbError = null;
  for (const k of Object.keys(phones)) delete phones[Number(k)];
  Object.assign(phones, { 1: "081234567890", 2: "081298765432" });
  kirim.mockResolvedValue({ ok: true });
  batch.mockResolvedValue({ ok: true });
  atur({});
});

describe("getWaConfig: bawaan di sisi server", () => {
  it("tanpa pengaturan notifikasi tersimpan → hanya Alpha aktif", async () => {
    expect((await getWaConfig()).notif).toEqual({ hadir: false, terlambat: false, pulang: false, alpha: true });
  });

  it("membaca pengaturan yang tersimpan", async () => {
    atur({ wa_notif_hadir: "true", wa_notif_alpha: "false" });
    expect((await getWaConfig()).notif).toEqual({ hadir: true, terlambat: false, pulang: false, alpha: false });
  });

  it("di-cache sampai resetWaConfigCache() dipanggil", async () => {
    await getWaConfig();
    store.wa_notif_pulang = "true";
    expect((await getWaConfig()).notif.pulang).toBe(false);
    resetWaConfigCache();
    expect((await getWaConfig()).notif.pulang).toBe(true);
  });
});

describe("kirimNotifAbsen: jenis yang dimatikan tidak dikirim", () => {
  it("bawaan: Hadir, Terlambat, Pulang tidak mengirim apa pun (dan tidak mencatat log)", async () => {
    await kirimNotifAbsen(1, "Budi", "5", "hadir", "07:05:00");
    await kirimNotifAbsen(1, "Budi", "5", "terlambat", "07:30:00");
    await kirimNotifAbsen(1, "Budi", "5", "pulang", "11:40:00");
    expect(kirim).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled(); // dimatikan = bukan kegagalan
  });

  it("hanya jenis yang diaktifkan yang terkirim", async () => {
    atur({ wa_notif_pulang: "true" });
    await kirimNotifAbsen(1, "Budi", "5", "hadir", "07:05:00");
    await kirimNotifAbsen(1, "Budi", "5", "pulang", "11:40:00");
    expect(kirim).toHaveBeenCalledTimes(1);
    expect(kirim.mock.calls[0][3]).toContain("*PULANG*");
    expect(kirim.mock.calls[0][3]).toContain("pukul 11:40 WIB");
  });

  it("Hadir menyala, Terlambat mati: siswa terlambat tidak dikirimi", async () => {
    atur({ wa_notif_hadir: "true" });
    await kirimNotifAbsen(1, "Budi", "5", "terlambat", "07:30:00");
    expect(kirim).not.toHaveBeenCalled();
  });

  it("Hadir DAN Terlambat sama-sama aktif: satu scan = satu pesan sesuai statusnya", async () => {
    atur({ wa_notif_hadir: "true", wa_notif_terlambat: "true" });
    await kirimNotifAbsen(1, "Budi", "5", "terlambat", "07:30:00");
    expect(kirim).toHaveBeenCalledTimes(1);
    expect(kirim.mock.calls[0][3]).toContain("*TERLAMBAT*");
    expect(kirim.mock.calls[0][3]).not.toContain("*HADIR*");
  });

  it("saklar utama WA mati → tidak ada yang terkirim walau jenisnya aktif", async () => {
    atur({ wa_enabled: "false", wa_notif_hadir: "true" });
    await kirimNotifAbsen(1, "Budi", "5", "hadir", "07:05:00");
    expect(kirim).not.toHaveBeenCalled();
  });

  it("perubahan berlaku setelah cache direset (tanpa deploy)", async () => {
    await kirimNotifAbsen(1, "Budi", "5", "hadir", "07:05:00");
    expect(kirim).not.toHaveBeenCalled();
    store.wa_notif_hadir = "true";
    resetWaConfigCache();
    await kirimNotifAbsen(1, "Budi", "5", "hadir", "07:05:00");
    expect(kirim).toHaveBeenCalledTimes(1);
  });
});

describe("kirimNotifAbsen: pencatatan", () => {
  beforeEach(() => atur({ wa_notif_hadir: "true" }));

  it("berhasil → log terkirim", async () => {
    await kirimNotifAbsen(1, "Budi", "5", "hadir", "07:05:00");
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ siswaId: 1, tipe: "absen", status: "terkirim", nomorHp: "081234567890" }));
  });

  it("nomor kosong → log gagal, gateway tidak dipanggil", async () => {
    phones[1] = null;
    await kirimNotifAbsen(1, "Budi", "5", "hadir", "07:05:00");
    expect(kirim).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ status: "gagal", errorMessage: "Nomor HP orang tua belum diisi." }));
  });

  it("gateway menolak → log gagal beserta alasan", async () => {
    kirim.mockResolvedValue({ ok: false, error: "Token gateway tidak valid (token invalid)" });
    await kirimNotifAbsen(1, "Budi", "5", "hadir", "07:05:00");
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ status: "gagal", errorMessage: "Token gateway tidak valid (token invalid)" }));
  });

  it("error tak terduga tidak dilempar ke pemanggil (absensi tetap sukses) dan tetap dilog", async () => {
    dbError = new Error("koneksi putus");
    await expect(kirimNotifAbsen(1, "Budi", "5", "hadir", "07:05:00")).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ status: "gagal", errorMessage: "koneksi putus" }));
  });
});

describe("kirimNotifAlpha (satu siswa)", () => {
  it("bawaan: terkirim", async () => {
    await kirimNotifAlpha(1, "Budi", "5", "2026-10-12");
    expect(kirim).toHaveBeenCalledTimes(1);
    expect(kirim.mock.calls[0][3]).toContain("TIDAK HADIR (Alpha)");
  });

  it("jenis Alpha dimatikan → tidak terkirim", async () => {
    atur({ wa_notif_alpha: "false" });
    await kirimNotifAlpha(1, "Budi", "5", "2026-10-12");
    expect(kirim).not.toHaveBeenCalled();
  });
});

describe("kirimNotifAlphaMassal (Fonnte: batch)", () => {
  const daftar = [
    { id: 1, name: "Budi Santoso", class: "5" }, // valid
    { id: 3, name: "Cici", class: "5" }, //           tanpa nomor
    { id: 4, name: "Dodo", class: "6" }, //           nomor tidak valid
    { id: 2, name: "Ani, S.", class: "6" }, //        valid, nama ada koma
  ];
  beforeEach(() => {
    phones[3] = null;
    phones[4] = "abc";
  });

  it("satu permintaan batch untuk yang valid; setiap siswa tetap punya satu baris log", async () => {
    await kirimNotifAlphaMassal(daftar, "2026-10-12");

    expect(kirim).not.toHaveBeenCalled(); // tidak satu-satu
    expect(batch).toHaveBeenCalledTimes(1);
    const [url, key, penerima, templat, delay] = batch.mock.calls[0];
    expect(url).toBe("https://api.fonnte.com/send");
    expect(key).toBe("TOKEN");
    expect(penerima.map((p) => [p.nomor, p.nama, p.kelas])).toEqual([
      ["6281234567890", "Budi Santoso", "5"],
      ["6281298765432", "Ani, S.", "6"],
    ]);
    expect(templat).toContain("{name}");
    expect(templat).toContain("{var1}");
    expect(templat).toContain("TIDAK HADIR (Alpha)");
    expect(templat).toContain("2026-10-12");
    expect(templat).toContain("SDN Contoh");
    expect(templat).not.toContain("Budi"); // nama diisi Fonnte per penerima, bukan ditanam di templat
    expect(delay).toBe("6-15");

    expect(logBanyak).toHaveBeenCalledTimes(1);
    const baris = logBanyak.mock.calls[0][0];
    expect(baris).toHaveLength(4);
    const per = Object.fromEntries(baris.map((b) => [b.siswaId, [b.status, b.errorMessage ?? null]]));
    expect(per[1]).toEqual(["terkirim", null]);
    expect(per[2]).toEqual(["terkirim", null]);
    expect(per[3]).toEqual(["gagal", "Nomor HP orang tua belum diisi."]);
    expect(per[4]).toEqual(["gagal", "Nomor HP tidak valid."]);
    expect(baris.every((b) => b.tipe === "alpha")).toBe(true);
  });

  it("dibagi per 100 penerima", async () => {
    const banyak = Array.from({ length: 250 }, (_, i) => ({ id: 1000 + i, name: `S${i}`, class: "5" }));
    for (const s of banyak) phones[s.id] = "081200000000";
    await kirimNotifAlphaMassal(banyak, "2026-10-12");
    expect(batch.mock.calls.map((c) => c[2].length)).toEqual([100, 100, 50]);
    expect(logBanyak.mock.calls[0][0]).toHaveLength(250);
  });

  it("batch ditolak gateway → seluruh penerima di batch itu tercatat gagal dengan alasannya", async () => {
    batch.mockResolvedValue({ ok: false, error: "Kuota pesan gateway tidak cukup (insufficient quota)" });
    await kirimNotifAlphaMassal(daftar, "2026-10-12");
    const baris = logBanyak.mock.calls[0][0];
    const kirimGagal = baris.filter((b) => [1, 2].includes(b.siswaId));
    expect(kirimGagal.every((b) => b.status === "gagal" && b.errorMessage?.includes("Kuota"))).toBe(true);
  });

  it("jenis Alpha dimatikan → tidak ada permintaan dan tidak ada log", async () => {
    atur({ wa_notif_alpha: "false" });
    await kirimNotifAlphaMassal(daftar, "2026-10-12");
    expect(batch).not.toHaveBeenCalled();
    expect(kirim).not.toHaveBeenCalled();
    expect(logBanyak).not.toHaveBeenCalled();
  });

  it("saklar utama WA mati → diam", async () => {
    atur({ wa_enabled: "false" });
    await kirimNotifAlphaMassal(daftar, "2026-10-12");
    expect(batch).not.toHaveBeenCalled();
    expect(logBanyak).not.toHaveBeenCalled();
  });

  it("daftar kosong → tidak melakukan apa pun", async () => {
    await kirimNotifAlphaMassal([], "2026-10-12");
    expect(batch).not.toHaveBeenCalled();
    expect(logBanyak).not.toHaveBeenCalled();
  });

  it("error tak terduga → setiap siswa tetap meninggalkan jejak gagal (tidak hilang diam-diam)", async () => {
    dbError = new Error("database tidak bisa dijangkau");
    await kirimNotifAlphaMassal(daftar, "2026-10-12");
    expect(batch).not.toHaveBeenCalled();
    const baris = logBanyak.mock.calls[0][0];
    expect(baris).toHaveLength(4);
    expect(baris.every((b) => b.status === "gagal" && b.errorMessage === "database tidak bisa dijangkau")).toBe(true);
  });
});

describe("kirimNotifAlphaMassal (gateway lain: per siswa)", () => {
  it("tanpa Fonnte: tetap per siswa, tanpa batch", async () => {
    atur({ wa_gateway_url: "https://api.wablas.com/send" });
    await kirimNotifAlphaMassal(
      [
        { id: 1, name: "Budi", class: "5" },
        { id: 2, name: "Ani", class: "6" },
      ],
      "2026-10-12"
    );
    expect(batch).not.toHaveBeenCalled();
    expect(kirim).toHaveBeenCalledTimes(2);
    expect(kirim.mock.calls[0][3]).toContain("*Budi*");
    expect(log).toHaveBeenCalledTimes(2);
  });
});
