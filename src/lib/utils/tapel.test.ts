import { describe, it, expect } from "vitest";
import {
  formatTapel,
  tahunMulaiTapel,
  validTapel,
  urutkanTapelTerbaru,
  tapelDariTanggal,
  semesterDariTanggal,
} from "./tapel";

describe("formatTapel", () => {
  it("membentuk YYYY/YYYY+1", () => {
    expect(formatTapel(2026)).toBe("2026/2027");
  });
});

describe("tahunMulaiTapel / validTapel", () => {
  it("menerima format yang benar", () => {
    expect(tahunMulaiTapel("2025/2026")).toBe(2025);
    expect(validTapel("2025/2026")).toBe(true);
  });

  it("menolak tahun kedua yang bukan +1", () => {
    expect(validTapel("2025/2027")).toBe(false);
    expect(validTapel("2026/2025")).toBe(false);
  });

  it("menolak pemisah/format lain", () => {
    expect(validTapel("2025-2026")).toBe(false);
    expect(validTapel("2025 / 2026")).toBe(false);
    expect(validTapel("25/26")).toBe(false);
    expect(validTapel("")).toBe(false);
  });
});

describe("urutkanTapelTerbaru", () => {
  it("terbaru dulu dan membuang duplikat", () => {
    expect(urutkanTapelTerbaru(["2024/2025", "2026/2027", "2025/2026", "2025/2026"])).toEqual([
      "2026/2027",
      "2025/2026",
      "2024/2025",
    ]);
  });
});

describe("tapelDariTanggal / semesterDariTanggal", () => {
  it("Juli–Desember = tapel yang dimulai tahun itu, ganjil", () => {
    expect(tapelDariTanggal("2026-07-01")).toBe("2026/2027");
    expect(tapelDariTanggal("2026-12-31")).toBe("2026/2027");
    expect(semesterDariTanggal("2026-07-01")).toBe("ganjil");
  });

  it("Januari–Juni = tapel yang dimulai tahun sebelumnya, genap", () => {
    expect(tapelDariTanggal("2027-01-01")).toBe("2026/2027");
    expect(tapelDariTanggal("2027-06-30")).toBe("2026/2027");
    expect(semesterDariTanggal("2027-06-30")).toBe("genap");
  });
});
