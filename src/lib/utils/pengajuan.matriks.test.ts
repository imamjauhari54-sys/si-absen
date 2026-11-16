/**
 * Mencocokkan PRATINJAU di TypeScript dengan perilaku NYATA putuskan_pengajuan_izin di Postgres.
 * Data dari supabase/tests/pengajuan_pratinjau_matriks.sql (lihat petunjuk di berkas itu). Tanpa variabel
 * PENGAJUAN_MATRIKS_JSON tes ini dilewati (suite biasa tidak butuh database).
 */
import fs from "fs";
import { describe, it, expect } from "vitest";
import { pratinjauHariDisetujui, pratinjauHariTidakDisetujui, type StatusAbsensiAda } from "./pengajuan";

interface Baris {
  waktu: string; tgl: string; hari_ini: string; abs: string; ke: "setujui" | "tolak";
  hasil_hari: string | null; abs_akhir: string | null; status_pengajuan: string;
}

const jalur = process.env.PENGAJUAN_MATRIKS_JSON;
const data: Baris[] = jalur ? JSON.parse(fs.readFileSync(jalur, "utf8")) : [];

describe.skipIf(!jalur)("pratinjau TypeScript == hasil SQL nyata", () => {
  it("matriks memuat semua kombinasi yang diharapkan", () => {
    expect(data.length).toBeGreaterThanOrEqual(24); // 2 waktu minimum x 6 catatan x 2 keputusan (hari ini hilang bila libur)
    expect(new Set(data.map((d) => d.abs))).toEqual(new Set(["none", "alpha", "hadir", "terlambat", "izin", "sakit"]));
    expect(new Set(data.map((d) => d.ke))).toEqual(new Set(["setujui", "tolak"]));
  });
  for (const r of data) {
    const absensi: StatusAbsensiAda = r.abs === "none" ? null : (r.abs as StatusAbsensiAda);
    it(`${r.waktu} / catatan ${r.abs} / ${r.ke}`, () => {
      if (r.ke === "setujui") {
        expect(r.status_pengajuan).toBe("disetujui");
        expect(pratinjauHariDisetujui(r.tgl, absensi, r.hari_ini)).toBe(r.hasil_hari);
        // Hadir/Terlambat/Izin/Sakit yang sudah ada TIDAK PERNAH berubah oleh persetujuan
        if (r.abs === "hadir" || r.abs === "terlambat" || r.abs === "izin" || r.abs === "sakit") expect(r.abs_akhir).toBe(r.abs);
      } else {
        expect(r.status_pengajuan).toBe("ditolak");
        const harapan = pratinjauHariTidakDisetujui(r.tgl, absensi, r.hari_ini);
        expect(r.hasil_hari === "dialpha" ? "dialpha" : "tidak_berubah").toBe(harapan);
        // Penolakan tidak pernah menghapus/mengubah catatan nyata yang sudah ada
        if (r.abs !== "none") expect(r.abs_akhir).toBe(r.abs);
      }
    });
  }
});
