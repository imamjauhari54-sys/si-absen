import { describe, it, expect } from "vitest";
import { barisCsv, batasAkhirHapus, jenisLogValid, rentangWaktuWib, sel, validasiRentangHapusLog } from "@/lib/utils/hapus-log";

const HARI_INI = "2026-10-24";

describe("batasAkhirHapus", () => {
  it("aktivitas: hari ini dikurangi 90 hari; WA: hari ini", () => {
    expect(batasAkhirHapus("aktivitas", HARI_INI)).toBe("2026-07-26");
    expect(batasAkhirHapus("wa", HARI_INI)).toBe(HARI_INI);
  });
});

describe("validasiRentangHapusLog", () => {
  it("log aktivitas: tepat 90 hari lalu boleh, sehari lebih baru ditolak", () => {
    expect(validasiRentangHapusLog("aktivitas", "2026-01-01", "2026-07-26", HARI_INI)).toEqual({ ok: true, dari: "2026-01-01", sampai: "2026-07-26" });
    const r = validasiRentangHapusLog("aktivitas", "2026-01-01", "2026-07-27", HARI_INI);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/lebih dari 90 hari/);
  });

  it("log WA: sampai hari ini boleh, masa depan ditolak", () => {
    expect(validasiRentangHapusLog("wa", "2026-10-01", HARI_INI, HARI_INI).ok).toBe(true);
    expect(validasiRentangHapusLog("wa", "2026-10-01", "2026-10-25", HARI_INI).ok).toBe(false);
  });

  it("menolak tanggal kosong, tidak valid, atau terbalik", () => {
    expect(validasiRentangHapusLog("wa", "", "2026-10-01", HARI_INI).ok).toBe(false);
    expect(validasiRentangHapusLog("wa", "2026-02-31", "2026-10-01", HARI_INI).ok).toBe(false);
    expect(validasiRentangHapusLog("wa", undefined, undefined, HARI_INI).ok).toBe(false);
    const r = validasiRentangHapusLog("wa", "2026-10-10", "2026-10-01", HARI_INI);
    expect(r.ok).toBe(false);
  });
});

describe("rentangWaktuWib", () => {
  it("rentang inklusif dalam WIB: mulai 00:00 hari pertama, sebelum 00:00 sehari setelah hari terakhir", () => {
    expect(rentangWaktuWib("2026-08-01", "2026-08-31")).toEqual({
      mulai: "2026-08-01T00:00:00+07:00",
      sebelum: "2026-09-01T00:00:00+07:00",
    });
    expect(rentangWaktuWib("2026-12-31", "2026-12-31").sebelum).toBe("2027-01-01T00:00:00+07:00");
  });
});

describe("CSV", () => {
  it("mengutip koma/kutip/baris baru dan menetralkan awalan rumus", () => {
    expect(sel('a,"b"')).toBe('"a,""b"""');
    expect(sel("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(sel("-1")).toBe("'-1");
    expect(sel(null)).toBe("");
    expect(barisCsv(["x", 1, null])).toBe("x,1,\r\n");
  });

  it("jenisLogValid", () => {
    expect(jenisLogValid("aktivitas")).toBe(true);
    expect(jenisLogValid("wa")).toBe(true);
    expect(jenisLogValid("absensi")).toBe(false);
  });
});
