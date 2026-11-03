import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { daftarTanggalRentang, hitungRekapSiswa, rentangFilter, type KonteksSiswa } from "./rekap-siswa";
import type { JedaSiswa } from "./siswa-harian";

/**
 * ═══ BASELINE PERHITUNGAN ABSENSI — DIBEKUKAN ═══════════════════════════════════════════════════════════════
 * Satu siswa, satu tapel, satu periode, satu hasil — dari Portal Siswa maupun dashboard admin.
 * Aturan hanya ada di utils/rekap-siswa.ts. File ini adalah tes penerimaan aturan itu. Mengubah angka di sini berarti
 * mengubah angka yang dilihat siswa/orang tua: lakukan hanya dengan keputusan sadar, dan ubah SEMUA tampilan sekaligus.
 */

const TODAY = "2026-10-20";
const JULI = daftarTanggalRentang("2026-07-01", "2026-07-31"); // tanpa Minggu
const mk = (o: Partial<KonteksSiswa> = {}): KonteksSiswa => ({ today: TODAY, libur: new Set(), absensi: new Map(), ...o });
const SEMESTER = rentangFilter({ tapel: "2026/2027", semester: "ganjil", bulan: "" })!;
const SEM_TGL = daftarTanggalRentang(SEMESTER.dari, SEMESTER.sampai);

describe("tes penerimaan — skenario baseline", () => {
  it("Siswa mulai 1 Juli → dihitung sejak 1 Juli", () => {
    const r = hitungRekapSiswa(JULI, mk({ mulai: "2026-07-01", absensi: new Map([["2026-07-01", "hadir"]]) }));
    expect(r.d["2026-07-01"]).toBe("hadir");
    expect(r.hariDihitung).toBe(JULI.length); // semua hari kerja Juli dihitung
    expect(r.alpha).toBe(JULI.length - 1); // yang tanpa catatan = Alpha bawaan
  });

  it("Siswa pertama tercatat 15 Agustus → TIDAK dihitung sebelum 15 Agustus", () => {
    const k = mk({ mulai: "2026-08-15", absensi: new Map([["2026-08-15", "hadir"]]) });
    const r = hitungRekapSiswa(SEM_TGL, k);
    for (const t of daftarTanggalRentang("2026-07-01", "2026-08-14")) expect(r.d[t], t).toBe("kosong");
    expect(r.d["2026-08-15"]).toBe("hadir");
    expect(r.d["2026-08-17"]).toBe("alpha"); // sesudah catatan pertama, tanpa catatan = Alpha bawaan
    const sebelum = daftarTanggalRentang("2026-07-01", "2026-08-14").length;
    const penuh = hitungRekapSiswa(SEM_TGL, mk({ mulai: "2026-07-01" }));
    expect(penuh.hariDihitung - r.hariDihitung).toBe(sebelum); // selisih persis hari-hari sebelum 15 Agustus
  });

  it("Siswa tanpa catatan pertama → ditangani eksplisit: semua hari kosong, BUKAN masuk sejak awal tapel", () => {
    const r = hitungRekapSiswa(SEM_TGL, mk({ mulai: null }));
    expect(r.hariDihitung).toBe(0);
    expect(r.alpha).toBe(0);
    expect(Object.values(r.d).every((s) => s === "kosong")).toBe(true);
  });

  it("Siswa mengalami jeda → hari jeda dikecualikan", () => {
    const jeda: JedaSiswa[] = [{ dari: "2026-09-14", sampai: "2026-10-05" }];
    const r = hitungRekapSiswa(SEM_TGL, mk({ mulai: "2026-07-01", jeda }));
    for (const t of daftarTanggalRentang("2026-09-14", "2026-10-04")) expect(r.d[t], t).toBe("nonaktif");
    const tanpa = hitungRekapSiswa(SEM_TGL, mk({ mulai: "2026-07-01" }));
    expect(tanpa.hariDihitung - r.hariDihitung).toBe(daftarTanggalRentang("2026-09-14", "2026-10-04").length);
  });

  it("Siswa pindah → hari pada/setelah tanggal pindah dikecualikan", () => {
    const r = hitungRekapSiswa(SEM_TGL, mk({ mulai: "2026-07-01", nonaktifPada: "2026-09-01" }));
    expect(r.d["2026-08-31"]).toBe("alpha");
    expect(r.d["2026-09-01"]).toBe("nonaktif"); // tanggal pindah sendiri tidak dihitung
    expect(r.d["2026-10-15"]).toBe("nonaktif");
  });

  it("Siswa kembali → dihitung kembali sesuai tanggal kembali (hari kembali = hari pertama dihitung)", () => {
    const r = hitungRekapSiswa(SEM_TGL, mk({ mulai: "2026-07-01", jeda: [{ dari: "2026-09-14", sampai: "2026-10-05" }] }));
    expect(r.d["2026-10-03"]).toBe("nonaktif");
    expect(r.d["2026-10-05"]).toBe("alpha"); // tanggal kembali sudah dihitung
    const adaCatatan = hitungRekapSiswa(SEM_TGL, mk({ mulai: "2026-07-01", jeda: [{ dari: "2026-09-14", sampai: "2026-10-05" }], absensi: new Map([["2026-10-05", "hadir"]]) }));
    expect(adaCatatan.d["2026-10-05"]).toBe("hadir");
  });

  it("Hari libur tidak dihitung; catatan di hari libur diabaikan", () => {
    const r = hitungRekapSiswa(SEM_TGL, mk({ mulai: "2026-07-01", libur: new Set(["2026-08-17"]), absensi: new Map([["2026-08-17", "hadir"]]) }));
    expect(r.d["2026-08-17"]).toBe("libur");
    expect(r.hadir).toBe(0);
  });

  it("Alpha bawaan tidak dihitung dua kali: hari dengan catatan Alpha dihitung SATU kali, hari tanpa catatan SATU kali", () => {
    const k = mk({ mulai: "2026-10-01", absensi: new Map([["2026-10-01", "alpha"], ["2026-10-02", "alpha"]]) });
    const r = hitungRekapSiswa(daftarTanggalRentang("2026-10-01", "2026-10-03"), k); // 1,2,3 Okt
    expect(r.alpha).toBe(3); // 2 catatan + 1 bawaan, bukan 5
    expect(r.hariDihitung).toBe(3);
  });

  it("Hari ini dan mendatang tanpa catatan tidak menjadi Alpha", () => {
    const r = hitungRekapSiswa(daftarTanggalRentang("2026-10-19", "2026-10-24"), mk({ mulai: "2026-10-01" }));
    expect(r.d["2026-10-19"]).toBe("alpha");
    expect(r.d[TODAY]).toBe("kosong");
    expect(r.d["2026-10-24"]).toBe("kosong");
  });
});

describe("paritas Portal ↔ Admin: satu siswa, satu tapel, satu periode → satu hasil", () => {
  // Portal membentuk konteks dari batas pindah per tapel (Map); admin dari tanggal pindah baris tapel itu (skalar).
  const catatan = new Map([["2026-07-02", "hadir"], ["2026-07-03", "sakit"], ["2026-09-01", "hadir"], ["2026-10-09", "terlambat"]]);
  const dasar = { absensi: catatan, libur: new Set(["2026-08-17"]), mulai: "2026-07-02", jeda: [{ dari: "2026-09-14", sampai: "2026-10-05" }] as JedaSiswa[] };
  for (const [nama, pindah] of [["tanpa pindah", null], ["pindah 12 Okt", "2026-10-12"]] as const) {
    it(`identik untuk seluruh semester dan setiap bulan — ${nama}`, () => {
      const portal = mk({ ...dasar, ...(pindah ? { batasPindah: new Map([["2026/2027", pindah]]) } : {}) });
      const admin = mk({ ...dasar, nonaktifPada: pindah });
      expect(hitungRekapSiswa(SEM_TGL, portal)).toEqual(hitungRekapSiswa(SEM_TGL, admin));
      for (const b of ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"]) {
        const r = rentangFilter({ tapel: "2026/2027", semester: "ganjil", bulan: b })!;
        const tgl = daftarTanggalRentang(r.dari, r.sampai);
        expect(hitungRekapSiswa(tgl, portal), b).toEqual(hitungRekapSiswa(tgl, admin));
      }
    });
  }
  it("jumlah semester = jumlah keenam bulannya", () => {
    const k = mk({ ...dasar, nonaktifPada: null });
    const sem = hitungRekapSiswa(SEM_TGL, k);
    let jumlah = 0;
    for (const b of ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"]) {
      const r = rentangFilter({ tapel: "2026/2027", semester: "ganjil", bulan: b })!;
      jumlah += hitungRekapSiswa(daftarTanggalRentang(r.dari, r.sampai), k).hariDihitung;
    }
    expect(sem.hariDihitung).toBe(jumlah);
  });
});

/**
 * PENJAGA: aturan "hari lampau tanpa catatan = Alpha" hanya boleh ada di utils/rekap-siswa.ts. Kalau ada file lain yang
 * menulis ulang rumusnya (seperti dulu di Rekap Harian), tes ini gagal — supaya baseline tidak bercabang lagi.
 */
describe("penjaga baseline: tidak ada rumus ganda", () => {
  const akar = join(process.cwd(), "src");
  const berkas: string[] = [];
  (function jelajah(dir: string) {
    for (const nama of readdirSync(dir)) {
      const p = join(dir, nama);
      if (statSync(p).isDirectory()) jelajah(p);
      else if (/\.(ts|tsx)$/.test(nama) && !/\.(test|testutil)\./.test(nama)) berkas.push(p);
    }
  })(akar);
  const boleh = (p: string) => p.endsWith(join("utils", "rekap-siswa.ts"));

  it("tidak ada pola 'tanggal < today ? alpha : kosong' selain di rekap-siswa.ts", () => {
    const pelanggar = berkas.filter((p) => !boleh(p) && /<\s*(?:k\.)?today\s*\?\s*["']alpha["']\s*:\s*["']kosong["']/.test(readFileSync(p, "utf8")));
    expect(pelanggar).toEqual([]);
  });
  /** Buang komentar supaya penjaga hanya melihat kode. */
  const tanpaKomentar = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const rel = (p: string) => p.slice(akar.length + 1).split("\\").join("/");
  // Daftar izin: file di lapisan perhitungan (lib/data, lib/utils, app/api) yang BOLEH memuat literal "alpha".
  // File baru yang menulis "alpha" di lapisan ini akan GAGAL di sini dan wajib ditinjau: apakah ia menghitung ulang
  // status hari? Bila ya, pindahkan ke utils/rekap-siswa.ts.
  const IZIN_LITERAL_ALPHA = new Set([
    "lib/utils/rekap-siswa.ts", // sumber aturan
    "lib/utils/alpha-berturut.ts", // membaca status Alpha yang sudah tercatat untuk peringatan
    "lib/utils/absen-scan.ts", // notifikasi saat scan menghasilkan alpha
    "lib/utils/absen-edit.ts", // daftar status yang boleh diedit manual
    "lib/data/dashboard.ts", // filter .neq("status","alpha") untuk statistik hari ini
    "lib/data/wa-log.ts", // tipe log WA
    "app/api/absen/auto-alpha/route.ts", // MENULIS baris Alpha (cron), bukan menghitung rekap
    "app/api/rekap/export/route.ts", // label ekspor harian hari ini yang belum scan
  ]);
  it("literal \"alpha\" di lapisan data/util/API hanya di file yang diizinkan (bukan sekadar satu bentuk rumus)", () => {
    const lapisan = berkas.filter((p) => /^(lib\/data|lib\/utils|app\/api)\//.test(rel(p)));
    const pelanggar = lapisan
      .filter((p) => /["'`]alpha["'`]/.test(tanpaKomentar(readFileSync(p, "utf8"))))
      .map(rel)
      .filter((r) => !IZIN_LITERAL_ALPHA.has(r));
    expect(pelanggar).toEqual([]);
  });
  it("file yang diizinkan benar-benar masih ada (daftar izin tidak basi)", () => {
    const ada = new Set(berkas.map(rel));
    expect([...IZIN_LITERAL_ALPHA].filter((r) => !ada.has(r))).toEqual([]);
  });
  it("hanya rekap-siswa.ts yang menggabungkan aturan pindah/jeda (tidakDihitungPada) menjadi status hari", () => {
    const izin = (p: string) => boleh(p) || p.endsWith(join("utils", "siswa-harian.ts"));
    const pelanggar = berkas.filter((p) => !izin(p) && /\btidakDihitungPada\s*\(/.test(readFileSync(p, "utf8")));
    expect(pelanggar).toEqual([]);
  });
  it("Rekap Harian, Rekap Bulanan, dan Portal memanggil fungsi bersama", () => {
    const rekap = readFileSync(join(akar, "lib/data/rekap.ts"), "utf8");
    expect(rekap).toMatch(/statusHariSiswa\(/);
    expect(rekap).toMatch(/hitungRekapSiswa\(/);
    expect(readFileSync(join(akar, "lib/data/rekap-siswa.ts"), "utf8")).toMatch(/hitungRekapSiswa\(/);
    expect(readFileSync(join(akar, "lib/data/history.ts"), "utf8")).toMatch(/hitungRekapSiswa\(/);
  });
});
