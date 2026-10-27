import { describe, it, expect } from "vitest";
import { catatanJedaPortal, jedaDiBulan, ketTidakDihitung, labelJedaBulan } from "./ket-jeda";
import type { JedaSiswa } from "./siswa-harian";

// jeda [15 Agu, 10 Sep) = tidak dihitung 15 Agu .. 9 Sep; kembali 10 Sep
const J: JedaSiswa[] = [{ dari: "2026-08-15", sampai: "2026-09-10", alasan: "pindah" }];

describe("ketTidakDihitung", () => {
  it("hari jeda: menjelaskan jeda, menegaskan BUKAN alpha dan data tetap tersimpan", () => {
    const t = ketTidakDihitung(null, null, J, "2026-08-20")!;
    expect(t).toMatch(/jeda 15 Agu 2026 – 9 Sep 2026/);
    expect(t).toMatch(/Bukan alpha/);
    expect(t).toMatch(/tetap tersimpan/);
  });
  it("tanggal kembali sudah dihitung -> null", () => {
    expect(ketTidakDihitung(null, null, J, "2026-09-10")).toBeNull();
    expect(ketTidakDihitung(null, null, J, "2026-08-14")).toBeNull();
  });
  it("sesudah pindah: membedakan pindah dan lulus", () => {
    expect(ketTidakDihitung("2026-10-01", "pindah", [], "2026-10-02")).toMatch(/sudah pindah sejak 1 Okt 2026/);
    expect(ketTidakDihitung("2026-10-01", "lulus", [], "2026-10-02")).toMatch(/sudah lulus/);
    expect(ketTidakDihitung("2026-10-01", "pindah", [], "2026-09-30")).toBeNull();
  });
  it("jeda satu hari ditulis tanpa rentang", () => {
    expect(ketTidakDihitung(null, null, [{ dari: "2026-08-15", sampai: "2026-08-16" }], "2026-08-15")).toMatch(/jeda 15 Agu 2026 \(/);
  });
});

describe("jedaDiBulan / labelJedaBulan / catatanJedaPortal", () => {
  it("jeda yang melewati batas bulan muncul di KEDUA bulan, tidak di bulan lain", () => {
    expect(jedaDiBulan(J, "2026-08")).toHaveLength(1);
    expect(jedaDiBulan(J, "2026-09")).toHaveLength(1);
    expect(jedaDiBulan(J, "2026-07")).toHaveLength(0);
    expect(jedaDiBulan(J, "2026-10")).toHaveLength(0); // kembali 10 Sep: Oktober bersih
  });
  it("bulan tempat siswa kembali (tanggal kembali = awal bulan) tidak lagi bertanda jeda", () => {
    expect(jedaDiBulan([{ dari: "2026-08-15", sampai: "2026-09-01" }], "2026-09")).toHaveLength(0);
    expect(jedaDiBulan([{ dari: "2026-08-15", sampai: "2026-09-02" }], "2026-09")).toHaveLength(1);
  });
  it("lencana admin", () => {
    expect(labelJedaBulan(J, "2026-09")).toBe("Jeda 15 Agu 2026 – 9 Sep 2026");
    expect(labelJedaBulan(J, "2026-10")).toBeNull();
    expect(labelJedaBulan(undefined, "2026-09")).toBeNull();
  });
  it("catatan portal: bahasa sederhana, tegaskan bukan ketidakhadiran dan tidak mengurangi persentase", () => {
    const [c] = catatanJedaPortal(J, "2026-09");
    expect(c).toMatch(/tidak terdaftar/);
    expect(c).toMatch(/tidak dihitung sebagai ketidakhadiran/);
    expect(c).toMatch(/tidak mengurangi persentase/);
    expect(catatanJedaPortal(J, "2026-10")).toEqual([]);
  });
});
