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
  bagianWaktuWib,
  formatWaktuWib,
  formatJamWib,
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

// Hasilnya HARUS sama di zona waktu proses mana pun (Vercel = UTC, laptop = WIB, dst).
// Jalankan juga dengan: TZ=UTC / TZ=Asia/Jakarta / TZ=America/Los_Angeles npx vitest run
describe("formatWaktuWib / formatJamWib", () => {
  it("12.00 WIB = 05.00 UTC (kasus yang tampil 7 jam lebih awal di produksi)", () => {
    expect(formatWaktuWib("2026-10-12T05:00:03.120+00:00")).toBe("12 Okt, 12:00");
    expect(formatJamWib("2026-10-12T05:00:03.120+00:00")).toBe("12:00");
  });

  it("tanggal ikut maju saat lewat tengah malam WIB", () => {
    expect(formatWaktuWib("2026-10-12T17:30:00Z")).toBe("13 Okt, 00:30");
    expect(formatWaktuWib("2026-10-12T17:00:00Z")).toBe("13 Okt, 00:00"); // bukan "24:00"
  });

  it("pergantian bulan dan tahun", () => {
    expect(formatWaktuWib("2026-12-31T20:00:00Z")).toBe("01 Jan, 03:00");
    expect(formatWaktuWib("2026-02-28T18:00:00Z")).toBe("01 Mar, 01:00");
  });

  it("awal hari UTC = 07.00 WIB", () => {
    expect(formatJamWib("2026-10-12T00:00:00Z")).toBe("07:00");
  });

  it("offset non-UTC dihormati", () => {
    expect(formatJamWib("2026-10-12T12:00:00+07:00")).toBe("12:00");
  });

  it("teks tanpa zona dianggap UTC", () => {
    expect(formatJamWib("2026-10-12T05:00:00")).toBe("12:00");
    expect(formatJamWib("2026-10-12T05:00:00.5")).toBe("12:00");
  });

  it("opsi kapital untuk bulan", () => {
    expect(formatWaktuWib("2026-10-12T17:30:00Z", { kapital: true })).toBe("13 OKT, 00:30");
  });

  it("tidak valid → tanda hubung, bukan 'NaN undefined'", () => {
    expect(formatWaktuWib("bukan-tanggal")).toBe("-");
    expect(formatJamWib("")).toBe("-");
    expect(bagianWaktuWib("xx")).toBeNull();
  });
});
