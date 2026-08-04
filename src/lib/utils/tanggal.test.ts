import { describe, it, expect } from "vitest";
import {
  addDaysJakarta,
  isoWeekday,
  formatTglIndo,
  formatTglPanjang,
  bulanIni,
  hariSingkat,
  jamSingkat,
  todayLabel,
} from "./tanggal";

describe("addDaysJakarta", () => {
  it("nambah hari biasa", () => {
    expect(addDaysJakarta("2026-07-25", 1)).toBe("2026-07-26");
  });

  it("ngurangin hari (angka negatif)", () => {
    expect(addDaysJakarta("2026-07-25", -14)).toBe("2026-07-11");
  });

  it("nyebrang akhir bulan", () => {
    expect(addDaysJakarta("2026-07-31", 1)).toBe("2026-08-01");
  });

  it("nyebrang akhir tahun", () => {
    expect(addDaysJakarta("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("nyebrang 29 Februari di tahun kabisat", () => {
    // 2028 kabisat
    expect(addDaysJakarta("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDaysJakarta("2028-02-29", 1)).toBe("2028-03-01");
  });

  it("tahun non-kabisat lompat dari 28 Feb ke 1 Mar", () => {
    expect(addDaysJakarta("2026-02-28", 1)).toBe("2026-03-01");
  });
});

describe("isoWeekday", () => {
  // Referensi: 2026-07-25 dipastikan hari Sabtu (lihat tanggal "current date" di percakapan)
  it("Sabtu = 6", () => {
    expect(isoWeekday("2026-07-25")).toBe(6);
  });

  it("Minggu = 7, bukan 0 (beda dari getDay() bawaan JS)", () => {
    expect(isoWeekday("2026-07-26")).toBe(7);
  });

  it("Senin = 1", () => {
    expect(isoWeekday("2026-07-27")).toBe(1);
  });
});

describe("formatTglIndo", () => {
  it("format singkat dd MMM yyyy", () => {
    expect(formatTglIndo("2026-04-06")).toBe("6 Apr 2026");
  });

  it("null balikin strip", () => {
    expect(formatTglIndo(null)).toBe("-");
  });

  it("tanggal 1 digit gak dikasih leading zero (sesuai kode asli)", () => {
    expect(formatTglIndo("2026-01-05")).toBe("5 Jan 2026");
  });
});

describe("formatTglPanjang", () => {
  it("nama hari + tanggal 2 digit + bulan panjang", () => {
    expect(formatTglPanjang("2026-07-25")).toBe("Sabtu, 25 Juli 2026");
  });

  it("tanggal 1 digit dikasih leading zero", () => {
    expect(formatTglPanjang("2026-07-05")).toBe("Minggu, 05 Juli 2026");
  });
});

describe("todayLabel", () => {
  it("sama formatnya kayak formatTglPanjang", () => {
    expect(todayLabel("2026-07-25")).toBe("Sabtu, 25 Juli 2026");
  });
});

describe("bulanIni", () => {
  it("nama bulan lengkap dari nomor bulan", () => {
    expect(bulanIni("2026-07-25")).toBe("Juli");
    expect(bulanIni("2026-01-01")).toBe("Januari");
    expect(bulanIni("2026-12-31")).toBe("Desember");
  });
});

describe("hariSingkat", () => {
  it("singkatan 3 huruf sesuai hari", () => {
    expect(hariSingkat("2026-07-25")).toBe("Sab"); // Sabtu
    expect(hariSingkat("2026-07-26")).toBe("Min"); // Minggu
  });
});

describe("jamSingkat", () => {
  it("motong HH:MM:SS jadi HH:MM", () => {
    expect(jamSingkat("07:15:42")).toBe("07:15");
  });

  it("null tetap null (bukan '-' atau string kosong)", () => {
    expect(jamSingkat(null)).toBeNull();
  });
});
