import { describe, it, expect } from "vitest";
import {
  dalamBatasPindah,
  labelKeluar,
  perluCekData,
  saringSiswaHarian,
  saringSiswaRekap,
  sudahKeluarPada,
} from "./siswa-harian";
import { parseTanggalKeluar, pilihRiwayatTerbaru } from "./tanggal-keluar";

const kosong = new Set<number>();
const T = "2026/2027";
const dasar = { tapelRekap: T, tapelAktif: T, nonaktifIds: kosong, adaAbsenIds: kosong };

describe("saringSiswaRekap — data lama (tanpa tanggal keluar)", () => {
  const daftar = [{ id: 1 }, { id: 2 }, { id: 3 }];

  it("tapel aktif: siswa non-aktif tanpa absensi disembunyikan", () => {
    const r = saringSiswaRekap(daftar, { ...dasar, nonaktifIds: new Set([2]) });
    expect(r.map((s) => s.id)).toEqual([1, 3]);
  });
  it("tapel aktif: siswa non-aktif yang punya absensi tetap tampil", () => {
    const r = saringSiswaRekap(daftar, { ...dasar, nonaktifIds: new Set([2]), adaAbsenIds: new Set([2]) });
    expect(r).toHaveLength(3);
  });
  it("tapel lama: tidak disaring", () => {
    const r = saringSiswaRekap(daftar, { ...dasar, tapelRekap: "2025/2026", nonaktifIds: new Set([1, 2, 3]) });
    expect(r).toHaveLength(3);
  });
  it("tapel aktif tidak diketahui: tidak disaring (gagal aman)", () => {
    expect(saringSiswaRekap(daftar, { ...dasar, tapelAktif: null, nonaktifIds: new Set([1]) })).toHaveLength(3);
  });
  it("alias lama saringSiswaHarian tetap ada", () => {
    expect(saringSiswaHarian).toBe(saringSiswaRekap);
  });
  it("tidak memutasi daftar asli dan menjaga urutan", () => {
    const asli = [{ id: 3 }, { id: 1 }, { id: 2 }];
    const r = saringSiswaRekap(asli, { ...dasar, nonaktifIds: new Set([1]) });
    expect(r.map((s) => s.id)).toEqual([3, 2]);
    expect(asli.map((s) => s.id)).toEqual([3, 1, 2]);
  });
});

describe("saringSiswaRekap — tanggal pindah = hari terakhir dihitung (inklusif)", () => {
  const pindah = [{ id: 1 }, { id: 2, nonaktif_pada: "2026-10-20" }];
  const ids = (r: { id: number }[]) => r.map((s) => s.id);

  it("harian sebelum dan PADA tanggal pindah: tampil", () => {
    for (const t of ["2026-10-19", "2026-10-20"]) {
      expect(ids(saringSiswaRekap(pindah, { ...dasar, awalPeriode: t }))).toEqual([1, 2]);
    }
  });
  it("harian mulai sehari sesudah tanggal pindah: hilang", () => {
    for (const t of ["2026-10-21", "2026-10-22", "2026-12-01"]) {
      expect(ids(saringSiswaRekap(pindah, { ...dasar, awalPeriode: t }))).toEqual([1]);
    }
  });
  it("record absensi sesudah tanggal pindah TIDAK menyelamatkan (alpha otomatis, manual, hadir, izin, sakit)", () => {
    const r = saringSiswaRekap(pindah, { ...dasar, awalPeriode: "2026-10-21", adaAbsenIds: new Set([2]) });
    expect(ids(r)).toEqual([1]);
  });
  it("bulanan: bulan pindah masih tampil, bulan berikutnya hilang (walau ada record)", () => {
    // hari efektif pertama Okt = 1 Okt <= 20 Okt -> tampil; Nov = 2 Nov > 20 Okt -> hilang
    expect(ids(saringSiswaRekap(pindah, { ...dasar, awalPeriode: "2026-10-01" }))).toEqual([1, 2]);
    expect(ids(saringSiswaRekap(pindah, { ...dasar, awalPeriode: "2026-11-02", adaAbsenIds: new Set([2]) }))).toEqual([1]);
  });
  it("bulanan: pindah tepat di hari efektif pertama bulan itu = hari itu masih dihitung, tampil", () => {
    expect(ids(saringSiswaRekap([{ id: 2, nonaktif_pada: "2026-11-02" }], { ...dasar, awalPeriode: "2026-11-02" }))).toEqual([2]);
  });
  it("berlaku juga di tapel lama (siswa yang pindah di tengah tahun lalu)", () => {
    expect(ids(saringSiswaRekap(pindah, { ...dasar, tapelRekap: "2025/2026", awalPeriode: "2026-10-25" }))).toEqual([1]);
  });
  it("history semester (tanpa awalPeriode): hanya hari terhitung yang menentukan; semester berikutnya (tanpa hari terhitung) hilang", () => {
    expect(ids(saringSiswaRekap(pindah, dasar))).toEqual([1]);
    expect(ids(saringSiswaRekap(pindah, { ...dasar, adaAbsenIds: new Set([2]) }))).toEqual([1, 2]);
  });
  it("siswa aktif tidak pernah disaring walau tidak punya absensi", () => {
    expect(saringSiswaRekap([{ id: 1 }], { ...dasar, awalPeriode: "2026-10-20" })).toHaveLength(1);
  });
});

describe("perluCekData", () => {
  it("benar untuk yang punya tanggal keluar, atau non-aktif di tapel aktif", () => {
    expect(perluCekData({ id: 1, nonaktif_pada: "2026-10-12" }, { ...dasar, tapelRekap: "2025/2026" })).toBe(true);
    expect(perluCekData({ id: 1 }, { ...dasar, nonaktifIds: new Set([1]) })).toBe(true);
  });
  it("salah untuk siswa aktif dan untuk non-aktif tanpa tanggal di tapel lama", () => {
    expect(perluCekData({ id: 1 }, dasar)).toBe(false);
    expect(perluCekData({ id: 1 }, { ...dasar, tapelRekap: "2025/2026", nonaktifIds: new Set([1]) })).toBe(false);
  });
});

describe("sudahKeluarPada", () => {
  it("hanya SESUDAH tanggal pindah yang dianggap sudah keluar; pada tanggal pindah masih dihitung", () => {
    expect(sudahKeluarPada("2026-10-12", "2026-10-11")).toBe(false);
    expect(sudahKeluarPada("2026-10-12", "2026-10-12")).toBe(false);
    expect(sudahKeluarPada("2026-10-12", "2026-10-13")).toBe(true);
    expect(sudahKeluarPada("2026-10-12", "2026-11-01")).toBe(true);
    expect(sudahKeluarPada(null, "2026-11-01")).toBe(false);
    expect(sudahKeluarPada(undefined, "2026-11-01")).toBe(false);
  });
});

describe("dalamBatasPindah", () => {
  const batas = new Map([["2026/2027", "2026-10-20"]]);
  it("record sampai dan pada tanggal pindah dihitung, sesudahnya tidak", () => {
    expect(dalamBatasPindah("2026/2027", "2026-10-19", batas)).toBe(true);
    expect(dalamBatasPindah("2026/2027", "2026-10-20", batas)).toBe(true);
    expect(dalamBatasPindah("2026/2027", "2026-10-21", batas)).toBe(false);
  });
  it("tapel tanpa batas, atau tanpa info tapel, tidak dipotong", () => {
    expect(dalamBatasPindah("2025/2026", "2026-10-21", batas)).toBe(true);
    expect(dalamBatasPindah(null, "2026-10-21", batas)).toBe(true);
    expect(dalamBatasPindah("2026/2027", "2099-01-01", new Map())).toBe(true);
  });
});

describe("labelKeluar", () => {
  it("menggabungkan alasan dan tanggal", () => {
    expect(labelKeluar("pindah", "2026-10-12")).toBe("Pindah · 12 Okt 2026");
    expect(labelKeluar("lulus", null)).toBe("Lulus");
    expect(labelKeluar(null, "2026-10-12")).toBe("Nonaktif · 12 Okt 2026");
    expect(labelKeluar(null, null)).toBeNull();
  });
});

describe("parseTanggalKeluar", () => {
  const hariIni = "2026-10-20";
  it("kosong = default (null)", () => {
    expect(parseTanggalKeluar("", hariIni)).toEqual({ ok: true, value: null });
    expect(parseTanggalKeluar(null, hariIni)).toEqual({ ok: true, value: null });
  });
  it("tanggal valid hari ini atau lampau diterima", () => {
    expect(parseTanggalKeluar("2026-10-20", hariIni)).toEqual({ ok: true, value: "2026-10-20" });
    expect(parseTanggalKeluar(" 2026-09-01 ", hariIni)).toEqual({ ok: true, value: "2026-09-01" });
  });
  it("menolak masa depan dan format/tanggal yang tidak ada", () => {
    for (const bad of ["2026-10-21", "2026-02-31", "abc", "20-10-2026"]) {
      expect(parseTanggalKeluar(bad, hariIni).ok).toBe(false);
    }
  });
});

describe("pilihRiwayatTerbaru", () => {
  it("memilih tapel paling baru per siswa, apa pun urutan masukannya", () => {
    const m = pilihRiwayatTerbaru([
      { siswa_id: 1, tapel: "2026/2027", nonaktif_pada: "2026-10-12" },
      { siswa_id: 1, tapel: "2025/2026", nonaktif_pada: null },
      { siswa_id: 2, tapel: "2024/2025", nonaktif_pada: null },
    ]);
    expect(m.get(1)?.tapel).toBe("2026/2027");
    expect(m.get(1)?.nonaktif_pada).toBe("2026-10-12");
    expect(m.get(2)?.tapel).toBe("2024/2025");
    expect(m.size).toBe(2);
  });
  it("daftar kosong menghasilkan map kosong", () => {
    expect(pilihRiwayatTerbaru([]).size).toBe(0);
  });
});
