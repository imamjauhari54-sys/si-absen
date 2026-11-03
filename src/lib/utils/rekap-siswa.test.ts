import { describe, it, expect } from "vitest";
import {
  daftarTanggalRentang,
  hitungRekapSiswa,
  persenHadir,
  rentangFilter,
  rentangSemester,
  statusHariSiswa,
  type KonteksSiswa,
} from "./rekap-siswa";

const TODAY = "2026-10-20";
const dasar = (o: Partial<KonteksSiswa> = {}): KonteksSiswa => ({ today: TODAY, libur: new Set(), absensi: new Map(), ...o });

describe("statusHariSiswa — urutan aturan", () => {
  it("1. libur mengalahkan semuanya (termasuk catatan dan jeda)", () => {
    const k = dasar({ libur: new Set(["2026-10-05"]), absensi: new Map([["2026-10-05", "hadir"]]), jeda: [{ dari: "2026-10-01", sampai: "2026-10-10" }] });
    expect(statusHariSiswa("2026-10-05", k)).toBe("libur");
  });
  it("2. pindah/jeda -> nonaktif walau ada catatan (catatan tidak dihapus, hanya tidak dihitung)", () => {
    const k = dasar({ absensi: new Map([["2026-10-06", "alpha"]]), jeda: [{ dari: "2026-10-05", sampai: "2026-10-10" }] });
    expect(statusHariSiswa("2026-10-06", k)).toBe("nonaktif");
    expect(statusHariSiswa("2026-10-10", dasar({ jeda: k.jeda }))).toBe("alpha"); // tanggal kembali sudah dihitung
    expect(statusHariSiswa("2026-10-12", dasar({ nonaktifPada: "2026-10-10" }))).toBe("nonaktif");
    expect(statusHariSiswa("2026-10-10", dasar({ nonaktifPada: "2026-10-10" }))).toBe("nonaktif"); // tanggal pindah tidak dihitung
    expect(statusHariSiswa("2026-10-09", dasar({ nonaktifPada: "2026-10-10" }))).toBe("alpha");
  });
  it("3. sebelum catatan pertama: kosong (bukan Alpha); mulai=null: semua kosong", () => {
    expect(statusHariSiswa("2026-10-01", dasar({ mulai: "2026-10-08" }))).toBe("kosong");
    expect(statusHariSiswa("2026-10-08", dasar({ mulai: "2026-10-08" }))).toBe("alpha");
    expect(statusHariSiswa("2026-10-15", dasar({ mulai: null }))).toBe("kosong");
    expect(statusHariSiswa("2026-10-01", dasar({ mulai: undefined }))).toBe("alpha"); // tanpa batas bawah = perilaku lama
  });
  it("4-6. catatan menang; hari lampau tanpa catatan = alpha; hari ini/mendatang = kosong", () => {
    const k = dasar({ absensi: new Map([["2026-10-02", "sakit"]]) });
    expect(statusHariSiswa("2026-10-02", k)).toBe("sakit");
    expect(statusHariSiswa("2026-10-03", k)).toBe("alpha");
    expect(statusHariSiswa(TODAY, k)).toBe("kosong");
    expect(statusHariSiswa("2026-10-21", k)).toBe("kosong");
  });
  it("tanggal pindah per tapel (batasPindah) hanya berlaku pada tapelnya", () => {
    const k = dasar({ batasPindah: new Map([["2026/2027", "2026-10-10"]]) });
    expect(statusHariSiswa("2026-10-12", k)).toBe("nonaktif");
    expect(statusHariSiswa("2026-06-12", k)).toBe("alpha"); // tapel 2025/2026: tidak terpengaruh
  });
});

describe("hitungRekapSiswa", () => {
  const tgl = daftarTanggalRentang("2026-10-01", "2026-10-10"); // tanpa Minggu 4 Okt
  it("menghitung per status dan hariDihitung = jumlah status yang dihitung", () => {
    const r = hitungRekapSiswa(tgl, dasar({
      absensi: new Map([["2026-10-01", "hadir"], ["2026-10-02", "terlambat"], ["2026-10-03", "izin"], ["2026-10-05", "sakit"]]),
      libur: new Set(["2026-10-06"]),
      jeda: [{ dari: "2026-10-08", sampai: "2026-10-10" }],
    }));
    expect(r).toMatchObject({ hadir: 1, terlambat: 1, izin: 1, sakit: 1 });
    // 07 Okt = alpha bawaan; 06 libur; 08,09 jeda; 10 Okt alpha bawaan (tanggal kembali dihitung)
    expect(r.alpha).toBe(2);
    expect(r.hariDihitung).toBe(6);
    expect(r.d["2026-10-06"]).toBe("libur");
    expect(r.d["2026-10-08"]).toBe("nonaktif");
  });
  it("persenHadir: (hadir+terlambat)/hariDihitung, 0 bila tanpa hari", () => {
    expect(persenHadir({ hadir: 3, terlambat: 1, hariDihitung: 5 })).toBe(80);
    expect(persenHadir({ hadir: 0, terlambat: 0, hariDihitung: 0 })).toBe(0);
  });
});

describe("daftarTanggalRentang / rentangSemester / rentangFilter", () => {
  it("tanpa hari Minggu, termasuk kedua ujung", () => {
    expect(daftarTanggalRentang("2026-10-03", "2026-10-06")).toEqual(["2026-10-03", "2026-10-05", "2026-10-06"]);
  });
  it("rentang semester", () => {
    expect(rentangSemester("2026/2027", "ganjil")).toEqual({ dari: "2026-07-01", sampai: "2026-12-31" });
    expect(rentangSemester("2026/2027", "genap")).toEqual({ dari: "2027-01-01", sampai: "2027-06-30" });
    expect(rentangSemester("2026/2027", "")).toEqual({ dari: "2026-07-01", sampai: "2027-06-30" });
    expect(rentangSemester("ngawur", "ganjil")).toBeNull();
  });
  it("rentangFilter: bulan di dalam semester, di luar semester, dan tanpa filter", () => {
    expect(rentangFilter({ tapel: "2026/2027", semester: "ganjil", bulan: "2026-10" })).toEqual({ dari: "2026-10-01", sampai: "2026-10-31" });
    expect(rentangFilter({ tapel: "2026/2027", semester: "ganjil", bulan: "2027-02" })).toBeNull(); // bulan di luar semester
    expect(rentangFilter({ tapel: "2026/2027", semester: "ganjil", bulan: "" })).toEqual({ dari: "2026-07-01", sampai: "2026-12-31" });
    expect(rentangFilter({ bulan: "2026-02" })).toEqual({ dari: "2026-02-01", sampai: "2026-02-28" });
    expect(rentangFilter({})).toBeNull();
    expect(rentangFilter({ tapel: "ngawur" })).toBeNull();
  });
});

/**
 * KARTU ATAS == REKAP BULANAN. Kartu atas untuk bulan X dan kartu Rekap Bulanan bulan X memakai fungsi yang sama pada
 * daftar tanggal yang sama, jadi harus identik. Dan jumlah per semester = jumlah bulan-bulannya.
 */
describe("konsistensi kartu atas dan Rekap Bulanan", () => {
  const k = dasar({
    today: "2026-12-10",
    mulai: "2026-08-03",
    libur: new Set(["2026-08-17", "2026-12-25"]),
    absensi: new Map([["2026-08-03", "hadir"], ["2026-08-04", "terlambat"], ["2026-09-07", "sakit"], ["2026-10-12", "izin"], ["2026-11-02", "hadir"]]),
    jeda: [{ dari: "2026-09-14", sampai: "2026-10-05" }],
  });
  const bulan = ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"];
  const perBulan = bulan.map((b) => {
    const r = rentangFilter({ tapel: "2026/2027", semester: "ganjil", bulan: b })!;
    return hitungRekapSiswa(daftarTanggalRentang(r.dari, r.sampai), k);
  });
  const sem = rentangFilter({ tapel: "2026/2027", semester: "ganjil", bulan: "" })!;
  const semester = hitungRekapSiswa(daftarTanggalRentang(sem.dari, sem.sampai), k);

  it("jumlah semester = jumlah keenam bulannya, untuk setiap status", () => {
    for (const st of ["hadir", "terlambat", "izin", "sakit", "alpha", "hariDihitung"] as const) {
      expect(semester[st], st).toBe(perBulan.reduce((a, r) => a + r[st], 0));
    }
  });
  it("Juli (sebelum catatan pertama) tidak dihitung; jeda dan libur tidak dihitung", () => {
    expect(perBulan[0].hariDihitung).toBe(0); // Juli: sebelum 3 Agu
    expect(perBulan[1].d["2026-08-17"]).toBe("libur");
    expect(perBulan[2].d["2026-09-15"]).toBe("nonaktif");
    expect(perBulan[3].d["2026-10-02"]).toBe("nonaktif");
    expect(perBulan[3].d["2026-10-05"]).toBe("alpha"); // hari kembali dihitung
  });
  it("kartu atas untuk satu bulan = kartu Rekap Bulanan bulan itu (fungsi & tanggal sama)", () => {
    const oktAtas = rentangFilter({ tapel: "2026/2027", semester: "ganjil", bulan: "2026-10" })!;
    const kartuAtas = hitungRekapSiswa(daftarTanggalRentang(oktAtas.dari, oktAtas.sampai), k);
    const kartuBulanan = hitungRekapSiswa(daftarTanggalRentang("2026-10-01", "2026-10-31"), k);
    expect(kartuAtas).toEqual(kartuBulanan);
  });
  it("hari mendatang tidak pernah dihitung (tidak menaikkan Alpha)", () => {
    const des = perBulan[5];
    expect(des.d["2026-12-11"]).toBe("kosong");
    expect(des.d["2026-12-31"]).toBe("kosong");
  });
});
