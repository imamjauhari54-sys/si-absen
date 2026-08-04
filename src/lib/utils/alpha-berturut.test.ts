import { describe, it, expect } from "vitest";
import { hitungAlphaBerturut } from "./alpha-berturut";

const siswaA = { id: 1, name: "Andi", class: "7A", foto: null };
const siswaB = { id: 2, name: "Budi", class: "7A", foto: null };

describe("hitungAlphaBerturut", () => {
  it("gak ada baris sama sekali -> hasil kosong", () => {
    expect(hitungAlphaBerturut([siswaA], [], 3)).toEqual([]);
  });

  it("alpha 3 hari berturut-turut -> kedeteksi (pas minHari)", () => {
    const rows = [
      { siswa_id: 1, tanggal: "2026-07-20", status: "alpha" }, // Senin
      { siswa_id: 1, tanggal: "2026-07-21", status: "alpha" }, // Selasa
      { siswa_id: 1, tanggal: "2026-07-22", status: "alpha" }, // Rabu
    ];
    const hasil = hitungAlphaBerturut([siswaA], rows, 3);
    expect(hasil).toHaveLength(1);
    expect(hasil[0]).toMatchObject({ id: 1, nama: "Andi", hari: 3, sejak: "2026-07-20" });
  });

  it("cuma 2 hari alpha, minHari 3 -> tidak kedeteksi", () => {
    const rows = [
      { siswa_id: 1, tanggal: "2026-07-21", status: "alpha" },
      { siswa_id: 1, tanggal: "2026-07-22", status: "alpha" },
    ];
    expect(hitungAlphaBerturut([siswaA], rows, 3)).toEqual([]);
  });

  it("rentetan keputus sama hari 'hadir' di tengah -> cuma hitung dari yang terbaru", () => {
    const rows = [
      { siswa_id: 1, tanggal: "2026-07-18", status: "alpha" },
      { siswa_id: 1, tanggal: "2026-07-19", status: "alpha" }, // Minggu, nanti diabaikan sbg hari_valid
      { siswa_id: 1, tanggal: "2026-07-20", status: "hadir" }, // ini memutus rentetan
      { siswa_id: 1, tanggal: "2026-07-21", status: "alpha" },
      { siswa_id: 1, tanggal: "2026-07-22", status: "alpha" },
    ];
    // Mundur dari 22 Jul: 22=alpha, 21=alpha, 20=hadir -> STOP. Cuma 2 hari, di bawah minHari 3.
    expect(hitungAlphaBerturut([siswaA], rows, 3)).toEqual([]);
    // Tapi kalau minHari-nya 2, harus kedeteksi mulai dari 21 Jul (bukan 18 Jul, karena keputus)
    const hasil = hitungAlphaBerturut([siswaA], rows, 2);
    expect(hasil[0]).toMatchObject({ hari: 2, sejak: "2026-07-21" });
  });

  it("hari Minggu di antaranya diabaikan (tidak dianggap 'memutus' ataupun 'menambah')", () => {
    const rows = [
      { siswa_id: 1, tanggal: "2026-07-24", status: "alpha" }, // Jumat
      { siswa_id: 1, tanggal: "2026-07-25", status: "alpha" }, // Sabtu
      { siswa_id: 1, tanggal: "2026-07-26", status: "alpha" }, // Minggu -> diabaikan sebagai hari_valid
      { siswa_id: 1, tanggal: "2026-07-27", status: "alpha" }, // Senin
    ];
    const hasil = hitungAlphaBerturut([siswaA], rows, 3);
    // hari_valid (desc, tanpa Minggu): 27, 25, 24 -> 3 hari alpha berturut-turut
    expect(hasil[0]).toMatchObject({ hari: 3, sejak: "2026-07-24" });
  });

  it("status izin/sakit memutus rentetan sama seperti hadir", () => {
    const rows = [
      { siswa_id: 1, tanggal: "2026-07-20", status: "alpha" },
      { siswa_id: 1, tanggal: "2026-07-21", status: "sakit" },
      { siswa_id: 1, tanggal: "2026-07-22", status: "alpha" },
    ];
    expect(hitungAlphaBerturut([siswaA], rows, 2)).toEqual([]);
  });

  it("beberapa siswa dihitung independen, hasil diurutkan dari yang paling lama alpha", () => {
    // Catatan: karena hari_valid dihitung global (lihat test di bawah), kedua
    // siswa harus punya record di hari_valid paling baru (24 Jul) supaya
    // adil dibandingkan — kalau tidak, yang gak punya record otomatis putus.
    const rows = [
      { siswa_id: 1, tanggal: "2026-07-24", status: "alpha" }, // Jumat
      { siswa_id: 1, tanggal: "2026-07-23", status: "hadir" }, // Kamis -> Andi putus di sini
      { siswa_id: 2, tanggal: "2026-07-24", status: "alpha" },
      { siswa_id: 2, tanggal: "2026-07-23", status: "alpha" },
      { siswa_id: 2, tanggal: "2026-07-22", status: "alpha" }, // Rabu
      { siswa_id: 2, tanggal: "2026-07-21", status: "alpha" }, // Selasa
      { siswa_id: 2, tanggal: "2026-07-20", status: "alpha" }, // Senin
    ];
    const hasil = hitungAlphaBerturut([siswaA, siswaB], rows, 1);
    expect(hasil.map((h) => h.nama)).toEqual(["Budi", "Andi"]); // Budi (5 hari) duluan dari Andi (1 hari)
  });

  it("CATATAN PERILAKU: hari_valid dihitung GLOBAL dari semua siswa, bukan per siswa — kalau siswa gak punya record di hari_valid paling baru, dia dianggap putus dari situ juga, walaupun hari-hari sebelumnya alpha semua", () => {
    const rows = [
      { siswa_id: 1, tanggal: "2026-07-20", status: "alpha" },
      { siswa_id: 1, tanggal: "2026-07-21", status: "alpha" },
      // siswa 1 TIDAK punya record di 22 Jul, tapi siswa 2 punya -> 22 Jul tetap
      // jadi hari_valid (karena minimal 1 siswa punya record di situ), dan
      // siswa 1 dianggap "putus" persis di hari itu (missing == bukan alpha).
      { siswa_id: 2, tanggal: "2026-07-22", status: "alpha" },
    ];
    const hasil = hitungAlphaBerturut([siswaA, siswaB], rows, 1);
    expect(hasil.map((h) => h.id)).toEqual([2]); // siswa 1 TIDAK kedeteksi, walau 2 hari alpha
  });

  it("siswa tanpa record sama sekali di hari_valid -> tidak masuk hasil", () => {
    const rows = [{ siswa_id: 1, tanggal: "2026-07-20", status: "alpha" }];
    // siswaB gak punya baris sama sekali -> dianggap "putus" dari hari pertama, gak masuk hasil
    const hasil = hitungAlphaBerturut([siswaA, siswaB], rows, 1);
    expect(hasil.map((h) => h.id)).toEqual([1]);
  });
});
