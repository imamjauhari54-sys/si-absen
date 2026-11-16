import { describe, expect, it } from "vitest";
import { sebutTanggal, statusKeputusanValid, susunPesanKeputusan, type DataPesanKeputusan } from "./pesan-keputusan";

const dasar: DataPesanKeputusan = {
  namaSiswa: "Budi Santoso", kelas: "5", jenis: "sakit", status: "disetujui", catatan: null, namaSekolah: "SDN Contoh",
  hari: [
    { tanggal: "2026-11-10", disetujui: true, hasil: "ditulis" },
    { tanggal: "2026-11-11", disetujui: true, hasil: "ditulis" },
  ],
};

describe("sebutTanggal", () => {
  it("sampai 5 tanggal disebut satu per satu, urut", () => {
    expect(sebutTanggal(["2026-11-11", "2026-11-10"])).toBe("Sel, 10 Nov 2026, Rab, 11 Nov 2026");
  });
  it("lebih dari 5 diringkas dengan jumlah dan rentang", () => {
    const t = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14"];
    expect(sebutTanggal(t)).toBe("6 hari (Sen, 9 Nov 2026 s.d. Sab, 14 Nov 2026)");
  });
  it("kosong -> tanda strip", () => expect(sebutTanggal([])).toBe("-"));
});

describe("susunPesanKeputusan", () => {
  it("disetujui: menyebut jenis, siswa, kelas, tanggal, sekolah; tanpa alasan", () => {
    const m = susunPesanKeputusan({ ...dasar });
    expect(m).toContain("*SAKIT*");
    expect(m).toContain("*Budi Santoso* (Kelas 5)");
    expect(m).toContain("*DISETUJUI*");
    expect(m).toContain("SDN Contoh");
    expect(m).not.toMatch(/Alpha/);
    expect(m).not.toMatch(/Catatan wali kelas/);
  });
  it("sebagian: memisahkan hari disetujui dan tidak, dan menyebut Alpha hanya untuk hari yang benar-benar dialpha", () => {
    const m = susunPesanKeputusan({
      ...dasar, status: "disetujui_sebagian", jenis: "izin",
      hari: [
        { tanggal: "2026-11-10", disetujui: true, hasil: "ditulis" },
        { tanggal: "2026-11-11", disetujui: false, hasil: "dialpha" },
        { tanggal: "2026-11-20", disetujui: false, hasil: null },
      ],
    });
    expect(m).toContain("*IZIN*");
    expect(m).toContain("*DISETUJUI SEBAGIAN*");
    expect(m).toContain("Disetujui: Sel, 10 Nov 2026.");
    expect(m).toContain("Tidak disetujui: Rab, 11 Nov 2026, Jum, 20 Nov 2026.");
    expect(m).toContain("dicatat Alpha: Rab, 11 Nov 2026.");
  });
  it("ditolak tanpa hari yang dialpha: tidak menyebut Alpha", () => {
    const m = susunPesanKeputusan({ ...dasar, status: "ditolak", hari: [{ tanggal: "2026-11-20", disetujui: false, hasil: null }] });
    expect(m).toContain("*TIDAK DISETUJUI*");
    expect(m).not.toMatch(/Alpha/);
  });
  it("catatan wali kelas disertakan, baris baru dipadatkan agar pesan tidak berantakan", () => {
    const m = susunPesanKeputusan({ ...dasar, status: "ditolak", catatan: "  Mohon bawa\n\n surat dokter  " });
    expect(m).toContain("Catatan wali kelas: Mohon bawa surat dokter");
  });
  it("PRIVASI: bentuk masukan tidak punya tempat untuk alasan/lampiran", () => {
    const kunci = Object.keys(dasar);
    expect(kunci.some((k) => /alasan|lampiran/i.test(k))).toBe(false);
  });
});

describe("statusKeputusanValid", () => {
  it("hanya tiga status keputusan", () => {
    expect(["disetujui", "disetujui_sebagian", "ditolak"].every(statusKeputusanValid)).toBe(true);
    for (const x of ["menunggu", "dibatalkan", "", null, undefined, 3]) expect(statusKeputusanValid(x)).toBe(false);
  });
});
