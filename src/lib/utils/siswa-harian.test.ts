import { describe, it, expect } from "vitest";
import {
  dalamBatasPindah,
  dalamJeda,
  kelompokkanJeda,
  labelJedaPada,
  labelKeluar,
  perluCekData,
  saringSiswaHarian,
  saringSiswaRekap,
  sudahKeluarPada,
  tampilPada,
  tersembunyiJeda,
  tidakDihitungPada,
  type JedaSiswa,
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

describe("saringSiswaRekap — tanggal pindah = hari terakhir tampil, tidak dihitung (eksklusif)", () => {
  const pindah = [{ id: 1 }, { id: 2, nonaktif_pada: "2026-10-20" }];
  const ids = (r: { id: number }[]) => r.map((s) => s.id);

  it("harian sebelum dan PADA tanggal pindah: tampil (pada tanggal pindah tidak dihitung)", () => {
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
  it("bulanan: pindah tepat di hari efektif pertama bulan itu = bulan itu tetap tampil (hari itu tidak dihitung)", () => {
    expect(ids(saringSiswaRekap([{ id: 2, nonaktif_pada: "2026-11-02" }], { ...dasar, awalPeriode: "2026-11-02" }))).toEqual([2]);
  });
  it("berlaku juga di tapel lama (siswa yang pindah di tengah tahun lalu)", () => {
    expect(ids(saringSiswaRekap(pindah, { ...dasar, tapelRekap: "2025/2026", awalPeriode: "2026-10-25" }))).toEqual([1]);
  });
  it("history semester (tanpa awalPeriode): hanya hari terhitung yang menentukan; semester berikutnya (tanpa hari terhitung) hilang", () => {
    expect(ids(saringSiswaRekap(pindah, dasar))).toEqual([1]);
    expect(ids(saringSiswaRekap(pindah, { ...dasar, adaAbsenIds: new Set([2]) }))).toEqual([1, 2]);
  });
  it("history semester: siswa pindah tetap tampil di semester yang memuat tanggal pindahnya, walau 0 hari terhitung", () => {
    const hist = { ...dasar, semesterRekap: "ganjil" };
    expect(ids(saringSiswaRekap(pindah, hist))).toEqual([1, 2]); // 20 Okt 2026 = tapel 2026/2027 ganjil
    expect(ids(saringSiswaRekap(pindah, { ...dasar, semesterRekap: "genap" }))).toEqual([1]); // semester berikutnya hilang
    expect(ids(saringSiswaRekap(pindah, { ...hist, tapelRekap: "2025/2026" }))).toEqual([1]); // tapel lain: tidak ikut
    // pindah di hari pertama semester genap: ganjil tampil karena ada hari terhitung, genap tampil dengan 0
    const awalGenap = [{ id: 3, nonaktif_pada: "2027-01-05" }];
    expect(ids(saringSiswaRekap(awalGenap, { ...dasar, semesterRekap: "genap" }))).toEqual([3]);
    expect(ids(saringSiswaRekap(awalGenap, { ...dasar, semesterRekap: "ganjil" }))).toEqual([]);
    expect(ids(saringSiswaRekap(awalGenap, { ...dasar, semesterRekap: "ganjil", adaAbsenIds: new Set([3]) }))).toEqual([3]);
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
  it("PADA tanggal pindah dan sesudahnya tidak dihitung; sebelumnya dihitung", () => {
    expect(sudahKeluarPada("2026-10-12", "2026-10-11")).toBe(false);
    expect(sudahKeluarPada("2026-10-12", "2026-10-12")).toBe(true);
    expect(sudahKeluarPada("2026-10-12", "2026-10-13")).toBe(true);
    expect(sudahKeluarPada("2026-10-12", "2026-11-01")).toBe(true);
    expect(sudahKeluarPada(null, "2026-11-01")).toBe(false);
    expect(sudahKeluarPada(undefined, "2026-11-01")).toBe(false);
  });
});

describe("dalamBatasPindah", () => {
  const batas = new Map([["2026/2027", "2026-10-20"]]);
  it("hanya record SEBELUM tanggal pindah dihitung; pada tanggal pindah dan sesudahnya tidak", () => {
    expect(dalamBatasPindah("2026/2027", "2026-10-19", batas)).toBe(true);
    expect(dalamBatasPindah("2026/2027", "2026-10-20", batas)).toBe(false);
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

// ─── JEDA (migrasi 025, mode "Kembali setelah jeda") ───────────────────────────────────────────────
// Jeda [dari, sampai) = [tanggal pindah, tanggal kembali). Tidak DIHITUNG di dari <= t < sampai,
// tidak TAMPIL di dari < t < sampai (pada `dari` tampil dengan lencana, sama seperti tanggal pindah).

const J: JedaSiswa[] = [{ dari: "2026-09-10", sampai: "2026-09-20", alasan: "pindah" }];

describe("dalamJeda / tersembunyiJeda", () => {
  it("dalamJeda: tanggal pindah ikut tidak dihitung; tanggal kembali SUDAH dihitung", () => {
    expect(dalamJeda(J, "2026-09-09")).toBe(false);
    expect(dalamJeda(J, "2026-09-10")).toBe(true);
    expect(dalamJeda(J, "2026-09-19")).toBe(true);
    expect(dalamJeda(J, "2026-09-20")).toBe(false);
  });
  it("tersembunyiJeda: tanggal pindah masih tampil; tanggal kembali tampil lagi", () => {
    expect(tersembunyiJeda(J, "2026-09-10")).toBe(false);
    expect(tersembunyiJeda(J, "2026-09-11")).toBe(true);
    expect(tersembunyiJeda(J, "2026-09-19")).toBe(true);
    expect(tersembunyiJeda(J, "2026-09-20")).toBe(false);
  });
  it("tanpa jeda: tidak ada pengaruh", () => {
    expect(dalamJeda(undefined, "2026-09-15")).toBe(false);
    expect(dalamJeda([], "2026-09-15")).toBe(false);
    expect(tersembunyiJeda(null, "2026-09-15")).toBe(false);
  });
});

describe("tidakDihitungPada / tampilPada — gabungan tanggal pindah dan jeda", () => {
  it("jeda saja", () => {
    expect(tidakDihitungPada(null, J, "2026-09-15")).toBe(true);
    expect(tidakDihitungPada(null, J, "2026-09-25")).toBe(false);
    expect(tampilPada(null, J, "2026-09-10")).toBe(true);
    expect(tampilPada(null, J, "2026-09-15")).toBe(false);
    expect(tampilPada(null, J, "2026-09-25")).toBe(true);
  });
  it("jeda lalu pindah lagi (tanggal pindah terbuka sesudah kembali)", () => {
    expect(tidakDihitungPada("2026-10-10", J, "2026-09-25")).toBe(false); // sudah kembali, belum pindah lagi
    expect(tidakDihitungPada("2026-10-10", J, "2026-10-10")).toBe(true);
    expect(tampilPada("2026-10-10", J, "2026-10-10")).toBe(true); // hari terakhir tampil
    expect(tampilPada("2026-10-10", J, "2026-10-11")).toBe(false);
  });
});

describe("labelJedaPada", () => {
  it("lencana hanya pada tanggal awal jeda", () => {
    expect(labelJedaPada(J, "2026-09-10")).toBe("Pindah · 10 Sep 2026");
    expect(labelJedaPada(J, "2026-09-11")).toBeNull();
    expect(labelJedaPada([], "2026-09-10")).toBeNull();
  });
});

describe("kelompokkanJeda", () => {
  it("mengelompokkan per siswa, urut tanggal, dan membuang baris tanpa dua ujung", () => {
    const peta = kelompokkanJeda([
      { siswa_id: 1, pindah_pada: "2026-10-01", kembali_pada: "2026-10-05", alasan: "pindah" },
      { siswa_id: 1, pindah_pada: "2026-08-01", kembali_pada: "2026-08-03", alasan: null },
      { siswa_id: 2, pindah_pada: "2026-09-01", kembali_pada: null },
      { siswa_id: 3, pindah_pada: null, kembali_pada: "2026-09-01" },
    ]);
    expect(peta.get(1)!.map((j) => j.dari)).toEqual(["2026-08-01", "2026-10-01"]);
    expect(peta.has(2)).toBe(false);
    expect(peta.has(3)).toBe(false);
  });
});

describe("saringSiswaRekap — jeda", () => {
  const siswa = [{ id: 1, jeda: J }, { id: 2 }];

  it("harian: tampil di tanggal pindah, hilang di tengah jeda, tampil lagi saat kembali", () => {
    const hari = (t: string) => saringSiswaRekap(siswa, { ...dasar, periode: [t] }).map((s) => s.id);
    expect(hari("2026-09-09")).toEqual([1, 2]);
    expect(hari("2026-09-10")).toEqual([1, 2]);
    expect(hari("2026-09-15")).toEqual([2]);
    expect(hari("2026-09-20")).toEqual([1, 2]);
  });

  it("bulanan: tampil selama MASIH ada hari yang tampil di bulan itu (bukan hanya hari pertama)", () => {
    const sept = ["2026-09-01", "2026-09-02", "2026-09-21", "2026-09-22"]; // sebagian di luar jeda
    expect(saringSiswaRekap(siswa, { ...dasar, periode: sept }).map((s) => s.id)).toEqual([1, 2]);
    const jedaPanjang: JedaSiswa[] = [{ dari: "2026-08-15", sampai: "2026-10-10" }];
    const septPenuh = ["2026-09-01", "2026-09-02", "2026-09-03"]; // seluruh bulan di tengah jeda
    expect(saringSiswaRekap([{ id: 1, jeda: jedaPanjang }], { ...dasar, periode: septPenuh })).toHaveLength(0);
    const okt = ["2026-10-01", "2026-10-12"]; // kembali 10 Okt: ada hari tampil
    expect(saringSiswaRekap([{ id: 1, jeda: jedaPanjang }], { ...dasar, periode: okt })).toHaveLength(1);
  });

  it("jeda + pindah lagi: tampil bila ada hari yang tampil menurut KEDUA aturan", () => {
    const s = [{ id: 1, nonaktif_pada: "2026-10-10", jeda: J }];
    expect(saringSiswaRekap(s, { ...dasar, periode: ["2026-10-11"] })).toHaveLength(0); // sesudah pindah lagi
    expect(saringSiswaRekap(s, { ...dasar, periode: ["2026-09-25"] })).toHaveLength(1);
  });

  it("awalPeriode lama tetap bekerja untuk pemanggil yang belum memakai periode", () => {
    expect(saringSiswaRekap([{ id: 1, nonaktif_pada: "2026-10-10" }], { ...dasar, awalPeriode: "2026-10-11" })).toHaveLength(0);
    expect(saringSiswaRekap([{ id: 1, nonaktif_pada: "2026-10-10" }], { ...dasar, awalPeriode: "2026-10-10" })).toHaveLength(1);
  });

  it("history semester: siswa dengan jeda tampil bila punya data; tetap tampil (0) di semester awal jedanya", () => {
    const opsi = { ...dasar, semesterRekap: "ganjil" };
    expect(saringSiswaRekap([{ id: 1, jeda: J }], { ...opsi, adaAbsenIds: new Set([1]) })).toHaveLength(1);
    expect(saringSiswaRekap([{ id: 1, jeda: J }], opsi)).toHaveLength(1); // jeda mulai 10 Sep 2026 = tapel 2026/2027 ganjil
    expect(saringSiswaRekap([{ id: 1, jeda: J }], { ...opsi, semesterRekap: "genap" })).toHaveLength(0);
  });

  it("perluCekData: siswa dengan jeda wajib dicek meski aktif", () => {
    expect(perluCekData({ id: 1, jeda: J }, dasar)).toBe(true);
    expect(perluCekData({ id: 1, jeda: [] }, dasar)).toBe(false);
  });
});

describe("dalamBatasPindah — jeda", () => {
  it("record di dalam jeda tidak dihitung walau tapel tanpa batas pindah", () => {
    expect(dalamBatasPindah(T, "2026-09-15", new Map(), J)).toBe(false);
    expect(dalamBatasPindah(T, "2026-09-20", new Map(), J)).toBe(true);
  });
  it("tanpa parameter jeda: perilaku lama tidak berubah", () => {
    expect(dalamBatasPindah(T, "2026-09-15", new Map([[T, "2026-10-01"]]))).toBe(true);
    expect(dalamBatasPindah(T, "2026-10-01", new Map([[T, "2026-10-01"]]))).toBe(false);
  });
});

/**
 * SATU ATURAN HITUNG. Skenario ini SAMA PERSIS dengan "UJI Y" di supabase/tests/aktifkan_siswa.test.sql:
 * 10 hari sekolah d1..d10; pindah di d3, kembali di d8 (jeda [d3,d8)); lalu pindah lagi di d10 (terbuka).
 * Database (hari_dihitung_siswa) menghitung 4 hari: d1, d2, d8, d9. TypeScript harus menghasilkan himpunan yang sama.
 * Kalau salah satu aturan diubah, kedua tes ini harus diubah bersama.
 */
describe("satu aturan hitung — kembar dengan aktifkan_siswa.test.sql", () => {
  const hari = Array.from({ length: 10 }, (_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`); // d1..d10
  const jeda: JedaSiswa[] = [{ dari: hari[2], sampai: hari[7] }]; // [d3, d8)
  const nonaktifPada = hari[9]; // d10, pindah lagi

  it("hari yang dihitung = d1, d2, d8, d9 (4 hari)", () => {
    const dihitung = hari.filter((t) => !tidakDihitungPada(nonaktifPada, jeda, t));
    expect(dihitung).toEqual([hari[0], hari[1], hari[7], hari[8]]);
  });

  it("hari yang tampil = semua sampai d10, kecuali d4..d7 (di tengah jeda)", () => {
    const tampil = hari.filter((t) => tampilPada(nonaktifPada, jeda, t));
    expect(tampil).toEqual([hari[0], hari[1], hari[2], hari[7], hari[8], hari[9]]);
  });

  it("pembilang (rekap_history_siswa) mengikuti aturan yang sama: record d5 (di dalam jeda) tidak dihitung", () => {
    const records = [hari[0], hari[1], hari[4]]; // Y punya record d1, d2, d5
    const hadir = records.filter((t) => !tidakDihitungPada(null, jeda, t)).length;
    expect(hadir).toBe(2); // SQL: "hadir 2, bukan 3"
  });

  it("tanggal pindah pertama (d3) tidak dihitung tetapi masih tampil; d4 tidak tampil", () => {
    expect(tidakDihitungPada(nonaktifPada, jeda, hari[2])).toBe(true);
    expect(tampilPada(nonaktifPada, jeda, hari[2])).toBe(true);
    expect(tampilPada(nonaktifPada, jeda, hari[3])).toBe(false);
  });
});
