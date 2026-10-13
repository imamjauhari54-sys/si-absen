import { describe, it, expect, vi, beforeEach } from "vitest";

const tulis: [string, string][] = [];
let sesi: { userId: number; role: string } | null = { userId: 1, role: "admin" };

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn(async () => sesi) }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/data/settings", () => ({
  setSettingValue: vi.fn(async (k: string, v: string) => {
    tulis.push([k, v]);
    return { error: null };
  }),
}));
vi.mock("@/lib/wa/notifikasi", () => ({ resetWaConfigCache: vi.fn() }));

import { resetWaConfigCache } from "@/lib/wa/notifikasi";
import { simpanWaSettingAction } from "./setting";

const awal = { status: "idle" as const, message: "" };
const form = (isi: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(isi)) f.set(k, v);
  return f;
};
const disimpan = () => Object.fromEntries(tulis);

beforeEach(() => {
  tulis.length = 0;
  sesi = { userId: 1, role: "admin" };
  vi.clearAllMocks();
});

describe("simpanWaSettingAction: akses", () => {
  it("tanpa sesi / bukan admin ditolak dan tidak menulis apa pun", async () => {
    sesi = null;
    expect((await simpanWaSettingAction(awal, form({ wa_enabled: "1" }))).status).toBe("error");
    sesi = { userId: 2, role: "guru" };
    expect((await simpanWaSettingAction(awal, form({ wa_enabled: "1" }))).status).toBe("error");
    expect(tulis).toHaveLength(0);
  });
});

describe("simpanWaSettingAction: jenis notifikasi", () => {
  const dasar = { wa_enabled: "1", wa_gateway_url: "https://api.fonnte.com/send", wa_api_key: "TOKEN", notif_ada: "1" };

  it("kotak yang dicentang → true, yang tidak → false", async () => {
    const hasil = await simpanWaSettingAction(awal, form({ ...dasar, notif_hadir: "1", notif_alpha: "1" }));
    expect(hasil.status).toBe("ok");
    expect(disimpan()).toMatchObject({
      wa_notif_hadir: "true",
      wa_notif_terlambat: "false",
      wa_notif_pulang: "false",
      wa_notif_alpha: "true",
    });
  });

  it("'Nonaktifkan semua' (tidak ada yang dicentang) menyimpan semuanya false", async () => {
    await simpanWaSettingAction(awal, form(dasar));
    expect(disimpan()).toMatchObject({ wa_notif_hadir: "false", wa_notif_terlambat: "false", wa_notif_pulang: "false", wa_notif_alpha: "false" });
  });

  it("tanpa penanda notif_ada (form lama), jenis notifikasi TIDAK disentuh", async () => {
    await simpanWaSettingAction(awal, form({ wa_enabled: "1", wa_gateway_url: "https://api.fonnte.com/send", wa_api_key: "T" }));
    expect(Object.keys(disimpan()).some((k) => k.startsWith("wa_notif_"))).toBe(false);
  });

  it("cache konfigurasi dibuang setelah simpan, supaya berlaku tanpa menunggu TTL", async () => {
    await simpanWaSettingAction(awal, form(dasar));
    expect(resetWaConfigCache).toHaveBeenCalledTimes(1);
  });
});

describe("simpanWaSettingAction: kredensial gateway", () => {
  it("dimatikan (kolom URL/key tidak terkirim) → kredensial tersimpan TIDAK dihapus", async () => {
    // Dulu: menyimpan "" ke wa_gateway_url dan wa_api_key sehingga mematikan lalu menyalakan kembali = kehilangan kredensial.
    const hasil = await simpanWaSettingAction(awal, form({ notif_ada: "1", notif_alpha: "1" }));
    expect(hasil.status).toBe("ok");
    const d = disimpan();
    expect(d.wa_enabled).toBe("false");
    expect("wa_gateway_url" in d).toBe(false);
    expect("wa_api_key" in d).toBe(false);
    expect(d.wa_notif_alpha).toBe("true"); // pilihan jenis tetap tersimpan
  });

  it("diaktifkan → URL dan key disimpan", async () => {
    await simpanWaSettingAction(awal, form({ wa_enabled: "1", wa_gateway_url: " https://api.fonnte.com/send ", wa_api_key: " T " }));
    expect(disimpan()).toMatchObject({ wa_enabled: "true", wa_gateway_url: "https://api.fonnte.com/send", wa_api_key: "T" });
  });

  it("diaktifkan tanpa URL/key → ditolak, tidak ada yang tersimpan", async () => {
    const hasil = await simpanWaSettingAction(awal, form({ wa_enabled: "1", wa_gateway_url: "", wa_api_key: "" }));
    expect(hasil.status).toBe("error");
    expect(tulis).toHaveLength(0);
  });

  it("URL yang bukan http(s) ditolak", async () => {
    for (const url of ["fonnte.com/send", "javascript:alert(1)", "ftp://x.com/send", "bukan url"]) {
      tulis.length = 0;
      const hasil = await simpanWaSettingAction(awal, form({ wa_enabled: "1", wa_gateway_url: url, wa_api_key: "T" }));
      expect(hasil.status, url).toBe("error");
      expect(tulis, url).toHaveLength(0);
    }
  });
});
