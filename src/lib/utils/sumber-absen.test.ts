import { describe, it, expect } from "vitest";
import { keteranganSumber, LABEL_SUMBER, tentukanSumberAbsen } from "./sumber-absen";

describe("tentukanSumberAbsen", () => {
  it("scan QR dan cari manual di halaman scan = scan", () => {
    expect(tentukanSumberAbsen({ scanOleh: "sistem_otomatis", adaEditManual: false })).toBe("scan");
    expect(tentukanSumberAbsen({ scanOleh: "manual_scanner", adaEditManual: false })).toBe("scan");
  });
  it("auto-alpha (scan_oleh = admin) = otomatis", () => {
    expect(tentukanSumberAbsen({ scanOleh: "admin", adaEditManual: false })).toBe("otomatis");
  });
  it("edit manual yang belum dipulihkan menang atas scan_oleh (edit tidak mengubah scan_oleh)", () => {
    expect(tentukanSumberAbsen({ scanOleh: "sistem_otomatis", adaEditManual: true })).toBe("edit");
    expect(tentukanSumberAbsen({ scanOleh: "admin", adaEditManual: true })).toBe("edit");
    expect(tentukanSumberAbsen({ scanOleh: null, adaEditManual: true })).toBe("edit");
  });
  it("tanpa edit aktif, label kembali mengikuti scan_oleh (mis. setelah dipulihkan)", () => {
    expect(tentukanSumberAbsen({ scanOleh: "sistem_otomatis", adaEditManual: false })).toBe("scan");
  });
  it("nama guru di scan_oleh (data lama) = edit", () => {
    expect(tentukanSumberAbsen({ scanOleh: "Bu Rina", adaEditManual: false })).toBe("edit");
  });
  it("tanpa scan_oleh dan tanpa edit = tidak diketahui (tidak menebak)", () => {
    for (const v of [null, undefined, "", "   "]) {
      expect(tentukanSumberAbsen({ scanOleh: v, adaEditManual: false })).toBeNull();
    }
  });
});

describe("LABEL_SUMBER", () => {
  it("teks subtext sesuai permintaan", () => {
    expect(LABEL_SUMBER).toEqual({ scan: "scan", edit: "edit guru", otomatis: "otomatis" });
  });
});

describe("keteranganSumber", () => {
  it("tanpa sumber: null", () => {
    expect(keteranganSumber(null, {})).toBeNull();
  });
  it("scan dan otomatis", () => {
    expect(keteranganSumber("scan", { scanOleh: "sistem_otomatis" })).toBe("Scan QR");
    expect(keteranganSumber("scan", { scanOleh: "manual_scanner" })).toBe("Dicari manual di halaman scan");
    expect(keteranganSumber("otomatis", {})).toBe("Dibuat otomatis oleh sistem (auto-alpha)");
  });
  it("edit dengan nama editor dan waktu (WIB)", () => {
    // 01:15 UTC = 08:15 WIB
    expect(keteranganSumber("edit", { editorNama: "Bu Rina", dieditAt: "2026-10-20T01:15:00Z" })).toBe(
      "Diedit oleh Bu Rina, 20 Okt, 08:15 WIB"
    );
  });
  it("edit hanya dengan nama, atau data lama berisi nama guru di scan_oleh", () => {
    expect(keteranganSumber("edit", { editorNama: "Bu Rina" })).toBe("Diedit oleh Bu Rina");
    expect(keteranganSumber("edit", { scanOleh: "Bu Rina" })).toBe("Diubah oleh Bu Rina");
    expect(keteranganSumber("edit", {})).toBe("Diedit manual");
  });
});
