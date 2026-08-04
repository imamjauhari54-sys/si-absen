import { describe, it, expect } from "vitest";
import { addMinutes, hms, jamTitikFormat } from "./jam";

describe("addMinutes", () => {
  it("nambah menit biasa, tanpa nyebrang jam", () => {
    expect(addMinutes("07:00:00", 15)).toBe("07:15:00");
  });

  it("nyebrang jam", () => {
    expect(addMinutes("07:50:00", 15)).toBe("08:05:00");
  });

  it("nyebrang tengah malam ke depan (wrap ke 00:xx)", () => {
    expect(addMinutes("23:50:00", 20)).toBe("00:10:00");
  });

  it("angka negatif = mundur", () => {
    expect(addMinutes("07:00:00", -60)).toBe("06:00:00");
  });

  it("mundur nyebrang tengah malam ke belakang (wrap ke 23:xx)", () => {
    expect(addMinutes("00:10:00", -20)).toBe("23:50:00");
  });

  it("dipakai buat jam buka sistem: 1 jam sebelum jam masuk", () => {
    // Kasus nyata dari scan-absen/proses: jamBukaSistem = addMinutes(jamMasuk, -60)
    expect(addMinutes("07:00:00", -60)).toBe("06:00:00");
  });

  it("dipakai buat batas akhir sistem: 120 menit setelah jam pulang mulai", () => {
    expect(addMinutes("11:30:00", 120)).toBe("13:30:00");
  });
});

describe("hms", () => {
  it("motong ISO string jadi HH:MM:SS", () => {
    // new Date(...).toISOString() -> "YYYY-MM-DDTHH:MM:SS.sssZ"
    const d = new Date("2026-07-25T07:15:42.123Z");
    expect(hms(d)).toBe("07:15:42");
  });
});

describe("jamTitikFormat", () => {
  it("format HH.MM pakai titik, dari komponen UTC Date", () => {
    const d = new Date("2026-07-25T07:05:00.000Z");
    expect(jamTitikFormat(d)).toBe("07.05");
  });

  it("padding 2 digit untuk jam/menit di bawah 10", () => {
    const d = new Date("2026-07-25T06:09:00.000Z");
    expect(jamTitikFormat(d)).toBe("06.09");
  });
});

describe("kombinasi: alur penentuan status hadir/terlambat/lock (seperti di scan-absen/proses)", () => {
  const jamMasuk = "07:00:00";
  const batasTerlambat = "07:15:00";
  const jamPulangMulai = "11:30:00";

  function tentukanStatus(jamScan: string) {
    const jamBukaSistem = addMinutes(jamMasuk, -60); // 06:00:00
    const batasAkhirSistem = addMinutes(jamPulangMulai, 120); // 13:30:00
    if (jamScan > batasAkhirSistem) return "LOCKED";
    if (jamScan < jamBukaSistem) return "TERLALU_PAGI";
    if (jamScan >= jamPulangMulai) return "DITOLAK_SUDAH_WAKTU_PULANG";
    return jamScan > batasTerlambat ? "terlambat" : "hadir";
  }

  it("scan pas jam masuk -> hadir", () => {
    expect(tentukanStatus("07:00:00")).toBe("hadir");
  });

  it("scan tepat di batas terlambat -> masih hadir (bukan strictly greater)", () => {
    expect(tentukanStatus("07:15:00")).toBe("hadir");
  });

  it("scan 1 detik lewat batas terlambat -> terlambat", () => {
    expect(tentukanStatus("07:15:01")).toBe("terlambat");
  });

  it("scan sebelum jam buka sistem -> ditolak terlalu pagi", () => {
    expect(tentukanStatus("05:59:59")).toBe("TERLALU_PAGI");
  });

  it("scan pas jam buka sistem -> boleh (bukan terlalu pagi)", () => {
    expect(tentukanStatus("06:00:00")).toBe("hadir");
  });

  it("scan setelah jam pulang mulai -> ditolak, dianggap tidak hadir", () => {
    expect(tentukanStatus("11:30:00")).toBe("DITOLAK_SUDAH_WAKTU_PULANG");
  });

  it("scan setelah batas akhir sistem (120 menit setelah jam pulang) -> locked", () => {
    expect(tentukanStatus("13:30:01")).toBe("LOCKED");
  });
});
