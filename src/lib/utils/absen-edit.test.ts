import { describe, it, expect } from "vitest";
import {
  MAX_RENTANG_HARI,
  parseIdPositif,
  parseLampiranForm,
  responsPulihkan,
  statusMempertahankanJam,
  statusValid,
  susunTanggalEdit,
  tanggalValid,
  validasiHasilEdit,
} from "./absen-edit";

describe("aturan jam per status", () => {
  it("hadir dan terlambat mempertahankan jam", () => {
    expect(statusMempertahankanJam("hadir")).toBe(true);
    expect(statusMempertahankanJam("terlambat")).toBe(true);
  });
  it("izin, sakit, alpha mengosongkan jam", () => {
    for (const s of ["izin", "sakit", "alpha"]) expect(statusMempertahankanJam(s)).toBe(false);
  });
  it("status valid hanya lima nilai itu", () => {
    expect(statusValid("sakit")).toBe(true);
    expect(statusValid("pulang")).toBe(false);
    expect(statusValid("")).toBe(false);
  });
});

describe("tanggalValid", () => {
  it("menerima tanggal kalender yang ada", () => {
    expect(tanggalValid("2026-10-16")).toBe(true);
    expect(tanggalValid("2028-02-29")).toBe(true);
  });
  it("menolak format salah dan tanggal yang tidak ada", () => {
    for (const s of ["", "abc", "2026-2-3", "2026-02-31", "2027-02-29", "2026-13-01", "2026-10-16T00:00"]) {
      expect(tanggalValid(s)).toBe(false);
    }
  });
});

describe("susunTanggalEdit", () => {
  const tanpaLibur = new Set<string>();

  it("satu hari biasa", () => {
    expect(susunTanggalEdit("2026-10-16", "2026-10-16", tanpaLibur)).toEqual({
      ok: true,
      diproses: ["2026-10-16"],
      dilewati: [],
    });
  });

  it("Minggu dan hari libur dilewati, sisanya urut naik", () => {
    // 16 Jum, 17 Sab, 18 Min, 19 Sen, 20 Sel (libur)
    const r = susunTanggalEdit("2026-10-16", "2026-10-20", new Set(["2026-10-20"]));
    expect(r).toEqual({
      ok: true,
      diproses: ["2026-10-16", "2026-10-17", "2026-10-19"],
      dilewati: ["2026-10-18", "2026-10-20"],
    });
  });

  it("satu hari yang jatuh di hari Minggu: tidak ada yang diproses", () => {
    expect(susunTanggalEdit("2026-10-18", "2026-10-18", tanpaLibur)).toEqual({
      ok: true,
      diproses: [],
      dilewati: ["2026-10-18"],
    });
  });

  it("menolak rentang terbalik dan format salah", () => {
    expect(susunTanggalEdit("2026-10-20", "2026-10-16", tanpaLibur)).toMatchObject({ ok: false });
    expect(susunTanggalEdit("2026-10-16", "bukan-tanggal", tanpaLibur)).toMatchObject({ ok: false });
  });

  it("menolak rentang lebih dari batas, tapi menerima tepat di batas", () => {
    const awal = "2026-01-01";
    const [y, m, d] = awal.split("-").map(Number);
    const akhir = (n: number) => new Date(Date.UTC(y, m - 1, d + n - 1)).toISOString().slice(0, 10);
    expect(susunTanggalEdit(awal, akhir(MAX_RENTANG_HARI), tanpaLibur)).toMatchObject({ ok: true });
    expect(susunTanggalEdit(awal, akhir(MAX_RENTANG_HARI + 1), tanpaLibur)).toMatchObject({ ok: false });
  });
});

describe("parseLampiranForm", () => {
  const CLOUD = "demo-cloud";
  const OK = `https://res.cloudinary.com/${CLOUD}/image/upload/v1700000000/si-absen/lampiran/surat.jpg`;

  it("kosong = tidak diubah (null), bahkan tanpa konfigurasi cloud", () => {
    expect(parseLampiranForm("  ", CLOUD)).toEqual({ ok: true, nilai: null });
    expect(parseLampiranForm("", undefined)).toEqual({ ok: true, nilai: null });
  });

  it("__HAPUS__ = hapus lampiran, bahkan tanpa konfigurasi cloud", () => {
    expect(parseLampiranForm("__HAPUS__", CLOUD)).toEqual({ ok: true, nilai: "" });
    expect(parseLampiranForm("__HAPUS__", undefined)).toEqual({ ok: true, nilai: "" });
  });

  it("URL Cloudinary milik aplikasi diterima (spasi di tepi dibuang)", () => {
    expect(parseLampiranForm(OK, CLOUD)).toEqual({ ok: true, nilai: OK });
    expect(parseLampiranForm(`  ${OK}  `, CLOUD)).toEqual({ ok: true, nilai: OK });
  });

  it("hostname dengan huruf besar dinormalisasi oleh new URL() dan tetap diterima", () => {
    const r = parseLampiranForm(`https://RES.CLOUDINARY.COM/${CLOUD}/image/upload/a.jpg`, CLOUD);
    expect(r).toEqual({ ok: true, nilai: `https://res.cloudinary.com/${CLOUD}/image/upload/a.jpg` });
  });

  // Yang LOLOS regex lama /^https:\/\/[^/]*\.?cloudinary\.com\// (sudah dicek): evilcloudinary.com, x.res.*, apex,
  // api.*, dan user:pw@res.*. Kasus lain (titik akhir, port, @evil, dst.) ditambahkan sebagai pengaman tambahan.
  it.each([
    ["domain yang sekadar berakhiran cloudinary.com", `https://evilcloudinary.com/${CLOUD}/image/upload/a.jpg`],
    ["cloudinary.com dipakai sebagai subdomain pihak lain", `https://cloudinary.com.evil.example/${CLOUD}/image/upload/a.jpg`],
    ["res.cloudinary.com sebagai subdomain pihak lain", `https://res.cloudinary.com.evil.example/${CLOUD}/image/upload/a.jpg`],
    ["subdomain Cloudinary lain", `https://x.res.cloudinary.com/${CLOUD}/image/upload/a.jpg`],
    ["apex cloudinary.com", `https://cloudinary.com/${CLOUD}/image/upload/a.jpg`],
    ["api.cloudinary.com (endpoint upload, bukan file)", `https://api.cloudinary.com/${CLOUD}/image/upload/a.jpg`],
    ["teks cloudinary.com hanya di dalam path", `https://evil.example/res.cloudinary.com/${CLOUD}/image/upload/a.jpg`],
    ["kredensial menyamar", `https://res.cloudinary.com@evil.example/${CLOUD}/image/upload/a.jpg`],
    ["kredensial dengan host asli", `https://user:pw@res.cloudinary.com/${CLOUD}/image/upload/a.jpg`],
    ["titik di akhir hostname", `https://res.cloudinary.com./${CLOUD}/image/upload/a.jpg`],
    ["port non-standar", `https://res.cloudinary.com:8443/${CLOUD}/image/upload/a.jpg`],
  ])("menolak hostname palsu: %s", (_nama, url) => {
    expect(parseLampiranForm(url, CLOUD)).toMatchObject({ ok: false, httpStatus: 400 });
  });

  it.each([
    ["http (bukan HTTPS)", `http://res.cloudinary.com/${CLOUD}/image/upload/a.jpg`],
    ["protokol javascript", "javascript:alert(1)"],
    ["protokol data", "data:text/html;base64,AAAA"],
    ["tanpa skema", `res.cloudinary.com/${CLOUD}/image/upload/a.jpg`],
    ["skema relatif", `//res.cloudinary.com/${CLOUD}/image/upload/a.jpg`],
    ["bukan URL", "bukan url"],
  ])("menolak URL tidak valid: %s", (_nama, url) => {
    expect(parseLampiranForm(url, CLOUD)).toMatchObject({ ok: false, httpStatus: 400 });
  });

  it("menolak file dari akun Cloudinary lain atau path tidak sesuai", () => {
    for (const url of [
      "https://res.cloudinary.com/akun-lain/image/upload/a.jpg",
      `https://res.cloudinary.com/${CLOUD}x/image/upload/a.jpg`,
      `https://res.cloudinary.com/${CLOUD}/raw/upload/a.pdf`,
      `https://res.cloudinary.com/${CLOUD}/image/upload/`,
      `https://res.cloudinary.com/${CLOUD}`,
      `https://res.cloudinary.com/akun-lain/../${CLOUD}x/image/upload/a.jpg`,
      `https://res.cloudinary.com/%2e%2e/akun-lain/image/upload/a.jpg`,
    ]) {
      expect(parseLampiranForm(url, CLOUD)).toMatchObject({ ok: false, httpStatus: 400 });
    }
  });

  it("URL yang tidak valid TIDAK pernah diubah menjadi 'tidak diubah' secara diam-diam", () => {
    const r = parseLampiranForm("https://evil.example.com/a.jpg", CLOUD);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/URL lampiran tidak valid/);
  });

  it("menolak URL terlalu panjang", () => {
    const panjang = `https://res.cloudinary.com/${CLOUD}/image/upload/${"a".repeat(2100)}.jpg`;
    expect(parseLampiranForm(panjang, CLOUD)).toMatchObject({ ok: false, httpStatus: 400 });
  });

  it("konfigurasi cloud kosong/tidak valid -> galat 500 (gagal tertutup), bukan menerima URL", () => {
    for (const cfg of [undefined, null, "", "  ", "nama dengan spasi", "../x"]) {
      expect(parseLampiranForm(OK, cfg)).toMatchObject({ ok: false, httpStatus: 500 });
    }
  });
});

describe("responsPulihkan", () => {
  it("ok -> 200", () => expect(responsPulihkan("ok")).toMatchObject({ ok: true, httpStatus: 200 }));
  it("tidak ada edit -> 404", () => expect(responsPulihkan("tidak_ada_edit")).toMatchObject({ ok: false, httpStatus: 404 }));
  it("sudah dipulihkan, kedaluwarsa, sudah berubah -> 409 dengan pesan berbeda", () => {
    const a = responsPulihkan("sudah_dipulihkan");
    const b = responsPulihkan("kedaluwarsa");
    const c = responsPulihkan("sudah_berubah");
    for (const r of [a, b, c]) expect(r).toMatchObject({ ok: false, httpStatus: 409 });
    expect(new Set([a.message, b.message, c.message]).size).toBe(3);
  });
  it("sudah_berubah memakai pesan yang menyuruh memuat ulang Rekap dan memilih Pulihkan dari edit terbaru", () => {
    expect(responsPulihkan("sudah_berubah")).toEqual({
      ok: false,
      httpStatus: 409,
      message: "Data sudah berubah sejak edit yang dipilih. Muat ulang Rekap, lalu pilih Pulihkan dari edit terbaru.",
    });
  });
  it("kode tak dikenal -> 500 (jangan pernah dianggap berhasil)", () => {
    expect(responsPulihkan("aneh")).toMatchObject({ ok: false, httpStatus: 500 });
    expect(responsPulihkan(undefined)).toMatchObject({ ok: false, httpStatus: 500 });
  });
});

describe("parseIdPositif", () => {
  it("menerima integer positif murni", () => {
    expect(parseIdPositif("1")).toBe(1);
    expect(parseIdPositif("42")).toBe(42);
    expect(parseIdPositif("9007199254740991")).toBe(9007199254740991);
  });

  it.each([
    "", "0", "01", "1abc", "abc", "1.5", "1,5", "-1", "+1", "1e3", "0x10", " 1", "1 ", "1\n",
    "9007199254740993", // di atas batas integer aman
    "١٢٣", // digit non-ASCII
  ])("menolak %j", (v) => expect(parseIdPositif(v)).toBeNull());

  it("menolak nilai non-string (File, null, angka)", () => {
    expect(parseIdPositif(null)).toBeNull();
    expect(parseIdPositif(undefined)).toBeNull();
    expect(parseIdPositif(5)).toBeNull();
    expect(parseIdPositif(new File(["1"], "1.txt"))).toBeNull();
  });
});

describe("validasiHasilEdit", () => {
  const T = ["2026-10-16", "2026-10-17"];
  const periode = { tapel: "2025/2026", semester: "genap", sumber_tapel: "record", sumber_semester: "kalender" };

  it("menerima satu baris per tanggal (urutan bebas), periode opsional", () => {
    const r = validasiHasilEdit(
      [
        { o_tanggal: "2026-10-17", o_diubah: false },
        { o_tanggal: "2026-10-16", o_diubah: true, o_periode_baru: periode },
      ],
      T
    );
    expect(r).toEqual({
      ok: true,
      baris: [
        { o_tanggal: "2026-10-17", o_diubah: false, o_periode_baru: null },
        { o_tanggal: "2026-10-16", o_diubah: true, o_periode_baru: periode },
      ],
    });
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["bukan array", { o_tanggal: "2026-10-16", o_diubah: true }],
    ["array kosong padahal ada tanggal diproses", []],
    ["kurang satu tanggal", [{ o_tanggal: "2026-10-16", o_diubah: true }]],
    ["kelebihan baris", [{ o_tanggal: "2026-10-16", o_diubah: true }, { o_tanggal: "2026-10-17", o_diubah: true }, { o_tanggal: "2026-10-19", o_diubah: true }]],
    ["tanggal ganda", [{ o_tanggal: "2026-10-16", o_diubah: true }, { o_tanggal: "2026-10-16", o_diubah: true }]],
    ["tanggal lain dari yang diminta", [{ o_tanggal: "2026-10-16", o_diubah: true }, { o_tanggal: "2026-10-19", o_diubah: true }]],
    ["o_tanggal bukan string", [{ o_tanggal: 20261016, o_diubah: true }, { o_tanggal: "2026-10-17", o_diubah: true }]],
    ["o_diubah bukan boolean", [{ o_tanggal: "2026-10-16", o_diubah: "true" }, { o_tanggal: "2026-10-17", o_diubah: true }]],
    ["baris null", [null, { o_tanggal: "2026-10-17", o_diubah: true }]],
    ["periode berbentuk salah", [{ o_tanggal: "2026-10-16", o_diubah: true, o_periode_baru: { tapel: "2025/2026" } }, { o_tanggal: "2026-10-17", o_diubah: true }]],
    ["periode bukan objek", [{ o_tanggal: "2026-10-16", o_diubah: true, o_periode_baru: "x" }, { o_tanggal: "2026-10-17", o_diubah: true }]],
  ])("menolak hasil tidak sesuai: %s", (_n, data) => {
    const r = validasiHasilEdit(data, T);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.alasan.length).toBeGreaterThan(0);
  });
});
