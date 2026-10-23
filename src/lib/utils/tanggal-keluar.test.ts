import { describe, it, expect } from "vitest";
import { periksaTanggalPindah } from "@/lib/utils/tanggal-keluar";

describe("periksaTanggalPindah", () => {
  const libur = new Set(["2026-08-17"]);
  const dasar = { tapel: "2026/2027", liburSet: libur, tanggalAbsensiSesudah: [] as string[] };

  it("tanggal wajar tanpa absensi sesudahnya: lolos tanpa peringatan", () => {
    const h = periksaTanggalPindah({ ...dasar, tanggal: "2026-08-15" });
    expect(h.galat).toBeNull();
    expect(h.peringatan).toEqual([]);
  });

  it("di luar tapel (jauh) ditolak; batas longgar 1 Jun s.d. 31 Jul masih lolos", () => {
    expect(periksaTanggalPindah({ ...dasar, tanggal: "2024-01-10" }).galat).toMatch(/di luar tapel 2026\/2027/);
    expect(periksaTanggalPindah({ ...dasar, tanggal: "2026-05-31" }).galat).not.toBeNull();
    expect(periksaTanggalPindah({ ...dasar, tanggal: "2026-06-01" }).galat).toBeNull();
    expect(periksaTanggalPindah({ ...dasar, tanggal: "2027-07-31" }).galat).toBeNull();
    expect(periksaTanggalPindah({ ...dasar, tanggal: "2027-08-01" }).galat).not.toBeNull();
  });

  it("hari Minggu dan hari libur memberi peringatan", () => {
    expect(periksaTanggalPindah({ ...dasar, tanggal: "2026-08-16" }).peringatan[0]).toMatch(/Minggu/);
    expect(periksaTanggalPindah({ ...dasar, tanggal: "2026-08-17" }).peringatan[0]).toMatch(/libur/);
  });

  it("absensi hari sekolah sesudah tanggal pindah memberi peringatan (kasus Gibran)", () => {
    const h = periksaTanggalPindah({
      ...dasar,
      tanggal: "2026-08-16",
      tanggalAbsensiSesudah: ["2026-08-24", "2026-08-25", "2026-08-30", "2026-08-17"], // 30 = Minggu, 17 = libur
    });
    expect(h.peringatan).toHaveLength(2);
    expect(h.peringatan[1]).toMatch(/2 hari sekolah/);
    expect(h.peringatan[1]).toMatch(/25 Agu 2026/);
  });
});
