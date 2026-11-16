/**
 * Tes KONTRAK TS <-> SQL (migrasi 027): menjaga salinan aturan di TypeScript tidak diam-diam berbeda dari SQL.
 * SQL tetap sumber kebenaran; tes ini membaca file migrasinya.
 */
import { describe, it, expect } from "vitest";
import { bacaMigrasi, paramFungsiSql } from "@/lib/api/tiruan.testutil";
import { ATURAN_PENGAJUAN, FOLDER_LAMPIRAN_PENGAJUAN, HASIL_HARI, STATUS_PENGAJUAN } from "./pengajuan";

const sql = bacaMigrasi("027_pengajuan_izin.sql");

function konstanta(nama: string): number {
  const m = sql.match(new RegExp(`${nama}\\s+constant integer := (\\d+);`));
  if (!m) throw new Error(`konstanta ${nama} tidak ada di SQL`);
  return Number(m[1]);
}

describe("ATURAN_PENGAJUAN sama dengan konstanta di ajukan_pengajuan_izin", () => {
  it("batas hari dan jumlah", () => {
    expect(ATURAN_PENGAJUAN.maksHariSakit).toBe(konstanta("c_maks_sakit"));
    expect(ATURAN_PENGAJUAN.maksMundurHari).toBe(konstanta("c_mundur"));
    expect(ATURAN_PENGAJUAN.maksMajuHari).toBe(konstanta("c_maju"));
    expect(ATURAN_PENGAJUAN.maksMenunggu).toBe(konstanta("c_maks_menunggu"));
    expect(ATURAN_PENGAJUAN.lampiranWajibLebihDariHari).toBe(konstanta("c_lampiran_setelah"));
  });
  it("panjang alasan", () => {
    expect(sql).toContain(`char_length(v_alasan) < ${ATURAN_PENGAJUAN.alasanMin}`);
    expect(sql).toContain(`char_length(v_alasan) > ${ATURAN_PENGAJUAN.alasanMaks}`);
  });
});

describe("enum TS sama dengan check constraint SQL", () => {
  const daftar = (s: string) => [...s.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  it("status pengajuan", () => {
    const m = sql.match(/status\s+text\s+not null default 'menunggu'\s+check \(status in \(([^)]*)\)\)/);
    expect(m).not.toBeNull();
    expect(daftar(m![1]).sort()).toEqual([...STATUS_PENGAJUAN].sort());
  });
  it("hasil per hari", () => {
    const m = sql.match(/hasil\s+text\s+check \(hasil in \(([^)]*)\)\)/);
    expect(m).not.toBeNull();
    expect(daftar(m![1]).sort()).toEqual([...HASIL_HARI].sort());
  });
});

describe("tanda tangan fungsi yang dipanggil route", () => {
  it("nama dan wajib/tidaknya parameter", () => {
    expect(paramFungsiSql(sql, "ajukan_pengajuan_izin")).toEqual([
      { nama: "p_siswa_id", wajib: true }, { nama: "p_jenis", wajib: true }, { nama: "p_dari", wajib: true },
      { nama: "p_sampai", wajib: true }, { nama: "p_alasan", wajib: true }, { nama: "p_lampiran", wajib: false },
    ]);
    expect(paramFungsiSql(sql, "putuskan_pengajuan_izin").map((p) => p.nama)).toEqual(["p_id", "p_keputusan", "p_hari", "p_catatan", "p_editor_id", "p_editor_nama"]);
    expect(paramFungsiSql(sql, "batalkan_pengajuan_izin").map((p) => p.nama)).toEqual(["p_id", "p_siswa_id"]);
    expect(paramFungsiSql(sql, "verifikasi_pin_ortu").map((p) => p.nama)).toEqual(["p_siswa_id", "p_pin"]);
    expect(paramFungsiSql(sql, "atur_pin_ortu").map((p) => p.nama)).toEqual(["p_siswa_id", "p_pin_baru", "p_pin_lama", "p_paksa"]);
    expect(paramFungsiSql(sql, "buat_pin_acak_ortu").map((p) => p.nama)).toEqual(["p_siswa_ids"]);
    expect(paramFungsiSql(sql, "tandai_pin_dibagikan").map((p) => p.nama)).toEqual(["p_siswa_ids"]);
  });
});

describe("folder lampiran", () => {
  it("tidak bertabrakan dengan folder lain di aplikasi", () => {
    expect(FOLDER_LAMPIRAN_PENGAJUAN).toBe("si-absen/pengajuan");
  });
});
