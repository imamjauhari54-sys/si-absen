import { describe, it, expect } from "vitest";
import {
  batasTanggalForm, hitungHariSekolah, keteranganHari, lampiranWajib, ringkasRentang, selisihHari,
  tambahHari, tanggalAda, tanggalSampaiEfektif, validasiForm, type IsiForm,
} from "./pengajuan-form";

const HARI_INI = "2026-11-13"; // Jumat
const TANPA_LIBUR = new Set<string>();
const dasar: IsiForm = { jenis: "izin", dari: "2026-11-16", sampai: "", alasan: "Acara keluarga", pin: "483920", berkas: null };

describe("tanggal", () => {
  it("tambahHari lintas bulan/tahun/kabisat", () => {
    expect(tambahHari("2026-11-30", 1)).toBe("2026-12-01");
    expect(tambahHari("2026-12-31", 1)).toBe("2027-01-01");
    expect(tambahHari("2028-02-28", 1)).toBe("2028-02-29");
    expect(tambahHari("2026-11-13", -7)).toBe("2026-11-06");
  });
  it("selisihHari", () => {
    expect(selisihHari("2026-11-10", "2026-11-16")).toBe(6);
    expect(selisihHari("2026-11-16", "2026-11-16")).toBe(0);
  });
  it("tanggalAda menolak tanggal fiktif dan bentuk salah", () => {
    expect(tanggalAda("2026-02-29")).toBe(false);
    expect(tanggalAda("2026-13-01")).toBe(false);
    expect(tanggalAda("16-11-2026")).toBe(false);
    expect(tanggalAda("")).toBe(false);
    expect(tanggalAda("2028-02-29")).toBe(true);
  });
  it("batas pilihan tanggal = 7 hari ke belakang .. 30 hari ke depan", () => {
    expect(batasTanggalForm(HARI_INI)).toEqual({ min: "2026-11-06", max: "2026-12-13" });
  });
});

describe("hitungHariSekolah (cermin hari_sekolah_rentang: hanya Minggu dan libur dikecualikan)", () => {
  it("Jumat..Selasa = 4 (Sabtu masuk, Minggu tidak)", () => {
    expect(hitungHariSekolah("2026-11-20", "2026-11-24", TANPA_LIBUR)).toBe(4);
  });
  it("hari libur dikurangi", () => {
    expect(hitungHariSekolah("2026-11-20", "2026-11-24", new Set(["2026-11-23"]))).toBe(3);
  });
  it("hanya Minggu = 0; rentang terbalik/tidak sah = 0", () => {
    expect(hitungHariSekolah("2026-11-22", "2026-11-22", TANPA_LIBUR)).toBe(0);
    expect(hitungHariSekolah("2026-11-24", "2026-11-20", TANPA_LIBUR)).toBe(0);
    expect(hitungHariSekolah("bukan", "2026-11-20", TANPA_LIBUR)).toBe(0);
  });
  it("rentang raksasa tidak membuat loop panjang", () => {
    expect(hitungHariSekolah("2026-01-01", "2099-01-01", TANPA_LIBUR)).toBeLessThanOrEqual(63);
  });
});

describe("validasiForm", () => {
  it("izin satu hari yang benar -> tanpa galat (sampai diabaikan)", () => {
    expect(validasiForm(dasar, HARI_INI, TANPA_LIBUR)).toEqual({});
    expect(tanggalSampaiEfektif(dasar)).toBe("2026-11-16");
  });
  it("sakit 2 hari sekolah tanpa lampiran boleh; 3 hari wajib lampiran", () => {
    const sakit = { ...dasar, jenis: "sakit" as const, dari: "2026-11-16", sampai: "2026-11-17" };
    expect(validasiForm(sakit, HARI_INI, TANPA_LIBUR)).toEqual({});
    const tiga = { ...sakit, sampai: "2026-11-18" };
    expect(validasiForm(tiga, HARI_INI, TANPA_LIBUR).lampiran).toContain("wajib");
    expect(validasiForm({ ...tiga, berkas: { type: "image/jpeg", size: 1000 } }, HARI_INI, TANPA_LIBUR)).toEqual({});
  });
  it("hari libur di tengah menurunkan hitungan hari sekolah sehingga lampiran tak wajib", () => {
    const tiga = { ...dasar, jenis: "sakit" as const, dari: "2026-11-16", sampai: "2026-11-18" };
    expect(lampiranWajib(tiga, TANPA_LIBUR)).toBe(true);
    expect(lampiranWajib(tiga, new Set(["2026-11-17"]))).toBe(false);
    expect(lampiranWajib({ ...tiga, jenis: "izin" }, TANPA_LIBUR)).toBe(false);
  });
  it("sakit wajib tanggal sampai; tidak boleh sebelum dari; maks 14 hari kalender", () => {
    const s = { ...dasar, jenis: "sakit" as const };
    expect(validasiForm({ ...s, sampai: "" }, HARI_INI, TANPA_LIBUR).sampai).toBeTruthy();
    expect(validasiForm({ ...s, sampai: "2026-11-10" }, HARI_INI, TANPA_LIBUR).sampai).toContain("sebelum");
    const berkas = { type: "image/png", size: 10 };
    expect(validasiForm({ ...s, sampai: "2026-11-29", berkas }, HARI_INI, TANPA_LIBUR).sampai).toBeUndefined(); // 14 hari
    expect(validasiForm({ ...s, sampai: "2026-11-30", berkas }, HARI_INI, TANPA_LIBUR).sampai).toContain("14");
  });
  it("batas mundur 7 dan maju 30 hari", () => {
    expect(validasiForm({ ...dasar, dari: "2026-11-05" }, HARI_INI, TANPA_LIBUR).dari).toContain("belakang");
    expect(validasiForm({ ...dasar, dari: "2026-11-06" }, HARI_INI, TANPA_LIBUR).dari).toBeUndefined();
    expect(validasiForm({ ...dasar, dari: "2026-12-14" }, HARI_INI, TANPA_LIBUR).dari).toContain("depan");
    expect(validasiForm({ ...dasar, dari: "2026-12-13" }, HARI_INI, TANPA_LIBUR).dari).toBeUndefined();
  });
  it("jenis, tanggal kosong/fiktif, alasan, PIN", () => {
    expect(validasiForm({ ...dasar, jenis: "" }, HARI_INI, TANPA_LIBUR).jenis).toBeTruthy();
    expect(validasiForm({ ...dasar, dari: "" }, HARI_INI, TANPA_LIBUR).dari).toBeTruthy();
    expect(validasiForm({ ...dasar, dari: "2026-02-31" }, HARI_INI, TANPA_LIBUR).dari).toBeTruthy();
    expect(validasiForm({ ...dasar, alasan: "  ab  " }, HARI_INI, TANPA_LIBUR).alasan).toContain("minimal 5");
    expect(validasiForm({ ...dasar, alasan: "x".repeat(301) }, HARI_INI, TANPA_LIBUR).alasan).toContain("maksimal 300");
    expect(validasiForm({ ...dasar, alasan: "x".repeat(300) }, HARI_INI, TANPA_LIBUR).alasan).toBeUndefined();
    for (const pin of ["", "12345", "1234567", "12345a", "١٢٣٤٥٦"]) expect(validasiForm({ ...dasar, pin }, HARI_INI, TANPA_LIBUR).pin).toBeTruthy();
  });
  it("lampiran: tipe dan ukuran", () => {
    expect(validasiForm({ ...dasar, berkas: { type: "application/pdf", size: 10 } }, HARI_INI, TANPA_LIBUR).lampiran).toContain("JPG");
    expect(validasiForm({ ...dasar, berkas: { type: "image/gif", size: 10 } }, HARI_INI, TANPA_LIBUR).lampiran).toBeTruthy();
    expect(validasiForm({ ...dasar, berkas: { type: "image/jpeg", size: 5 * 1024 * 1024 + 1 } }, HARI_INI, TANPA_LIBUR).lampiran).toContain("5 MB");
    expect(validasiForm({ ...dasar, berkas: { type: "image/jpeg", size: 5 * 1024 * 1024 } }, HARI_INI, TANPA_LIBUR).lampiran).toBeUndefined();
  });
});

describe("tampilan", () => {
  it("ringkasRentang", () => {
    expect(ringkasRentang("2026-11-16", "2026-11-16")).toBe("Sen, 16 Nov 2026");
    expect(ringkasRentang("2026-11-16", "2026-11-18")).toBe("16-18 Nov 2026");
    expect(ringkasRentang("2026-11-30", "2026-12-02")).toBe("30 Nov - 2 Des 2026");
    expect(ringkasRentang("2026-12-30", "2027-01-02")).toBe("30 Des 2026 - 2 Jan 2027");
  });
  const h = (o: Partial<{ disetujui: boolean | null; aktif: boolean; hasil: "direncanakan" | "ditulis" | "scan_menang" | "sudah_tercatat" | "dialpha" | null }>) =>
    ({ disetujui: null, aktif: true, hasil: null, ...o });
  it("keteranganHari mengikuti status dan hasil", () => {
    expect(keteranganHari(h({}), "menunggu", "izin")).toEqual({ teks: "Menunggu persetujuan", nada: "tunggu" });
    expect(keteranganHari(h({ aktif: false }), "dibatalkan", "izin").nada).toBe("netral");
    expect(keteranganHari(h({ disetujui: true, hasil: "ditulis" }), "disetujui", "sakit").teks).toBe("Tercatat Sakit");
    expect(keteranganHari(h({ disetujui: true, hasil: "direncanakan" }), "disetujui", "izin").teks).toContain("otomatis");
    expect(keteranganHari(h({ disetujui: true, hasil: "scan_menang" }), "disetujui", "izin").teks).toContain("hadir");
    expect(keteranganHari(h({ disetujui: false, hasil: "dialpha" }), "disetujui_sebagian", "izin")).toEqual({ teks: "Tidak disetujui (Alpha)", nada: "buruk" });
    expect(keteranganHari(h({ disetujui: false }), "ditolak", "izin").nada).toBe("buruk");
  });
});
