import { describe, it, expect } from "vitest";
import { DEFAULT_NOTIF, JENIS_NOTIF, parseNotif } from "./jenis-notifikasi";

describe("DEFAULT_NOTIF (bawaan server)", () => {
  it("hanya Alpha dan Keputusan izin yang aktif (orang tua yang mengajukan menunggu jawabannya)", () => {
    expect(DEFAULT_NOTIF).toEqual({ hadir: false, terlambat: false, pulang: false, alpha: true, keputusan: true });
  });
});

describe("parseNotif", () => {
  it("pengaturan kosong → bawaan (aman walau belum pernah disimpan)", () => {
    expect(parseNotif({})).toEqual(DEFAULT_NOTIF);
    expect(parseNotif({ hadir: "", alpha: null, pulang: undefined })).toEqual(DEFAULT_NOTIF);
  });

  it("membaca true/false dari tabel settings", () => {
    expect(parseNotif({ hadir: "true", terlambat: "true", pulang: "false", alpha: "false" })).toEqual({
      hadir: true,
      terlambat: true,
      pulang: false,
      alpha: false,
      keputusan: true,
    });
  });

  it("nilai asing diabaikan (pakai bawaan), tidak dianggap true", () => {
    expect(parseNotif({ hadir: "1", alpha: "yes" })).toEqual(DEFAULT_NOTIF);
  });

  it("satu jenis tidak memengaruhi yang lain", () => {
    expect(parseNotif({ pulang: "true" })).toEqual({ hadir: false, terlambat: false, pulang: true, alpha: true, keputusan: true });
  });
});

describe("JENIS_NOTIF", () => {
  it("lima jenis dengan kunci setting unik berawalan wa_notif_", () => {
    expect(JENIS_NOTIF.map((j) => j.kunci)).toEqual(["hadir", "terlambat", "pulang", "alpha", "keputusan"]);
    expect(new Set(JENIS_NOTIF.map((j) => j.settingKey)).size).toBe(5);
    expect(JENIS_NOTIF.every((j) => j.settingKey.startsWith("wa_notif_"))).toBe(true);
  });

  it("keterangan Pulang menegaskan bahwa itu bukan bukti tiba di rumah", () => {
    expect(JENIS_NOTIF.find((j) => j.kunci === "pulang")!.keterangan).toMatch(/tidak otomatis/i);
  });
});
