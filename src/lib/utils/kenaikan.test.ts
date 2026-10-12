import { describe, it, expect } from "vitest";
import {
  LULUS,
  parseKelas,
  urutKelas,
  tingkatAkhirDefault,
  usulanTujuan,
  petaEfektif,
  opsiTujuanKelas,
  pengecualianSah,
  tujuanSiswa,
  ringkasKenaikan,
  kelasTujuanBaru,
  buatPayload,
  type SiswaKenaikan,
} from "./kenaikan";

const S = (id: number, kelas: string): SiswaKenaikan => ({ id, name: `S${id}`, class: kelas });

describe("parseKelas / urutKelas", () => {
  it("memisahkan angka dan akhiran", () => {
    expect(parseKelas("5A")).toEqual({ angka: 5, akhiran: "A" });
    expect(parseKelas("6")).toEqual({ angka: 6, akhiran: "" });
    expect(parseKelas("Kelas X")).toBeNull();
    expect(parseKelas("VI")).toBeNull();
  });

  it("urut alami, tidak berangka di belakang", () => {
    expect(["10", "2", "5B", "5A", "Pelangi"].sort(urutKelas)).toEqual(["2", "5A", "5B", "10", "Pelangi"]);
  });
});

describe("usulanTujuan", () => {
  it("angka +1, akhiran tetap", () => {
    expect(usulanTujuan("1A", 6)).toBe("2A");
    expect(usulanTujuan("5", 6)).toBe("6");
    expect(usulanTujuan("4 B", 6)).toBe("5 B");
  });

  it("tingkat akhir → lulus", () => {
    expect(usulanTujuan("6", 6)).toBe(LULUS);
    expect(usulanTujuan("6B", 6)).toBe(LULUS);
    expect(usulanTujuan("9", 9)).toBe(LULUS);
  });

  it("nama tak berangka → kosong (admin memilih)", () => {
    expect(usulanTujuan("Pelangi", 6)).toBe("");
  });
});

describe("tingkatAkhirDefault", () => {
  it("minimal 6 (sekolah yang hanya berisi kelas 4–5 tidak dianggap lulus di 5)", () => {
    expect(tingkatAkhirDefault(["4", "5"])).toBe(6);
    expect(tingkatAkhirDefault(["1", "6"])).toBe(6);
  });
  it("mengikuti tingkat tertinggi kalau lebih dari 6 (SMP)", () => {
    expect(tingkatAkhirDefault(["7A", "8A", "9B"])).toBe(9);
  });
});

describe("petaEfektif", () => {
  it("override menang atas usulan; tingkat akhir bisa diubah", () => {
    expect(petaEfektif(["5", "6"], {}, 6)).toEqual({ "5": "6", "6": LULUS });
    expect(petaEfektif(["5", "6"], { "5": "5" }, 6)).toEqual({ "5": "5", "6": LULUS });
    expect(petaEfektif(["6"], {}, 9)).toEqual({ "6": "7" });
  });
});

describe("opsiTujuanKelas", () => {
  it("kelas biasa: hanya naik ke kelas berikutnya dan tidak naik", () => {
    expect(opsiTujuanKelas("5", 6, ["5", "6"])).toEqual([
      { value: "6", label: "Naik ke Kelas 6" },
      { value: "5", label: "Tidak naik (tetap Kelas 5)" },
    ]);
  });

  it("akhiran dipertahankan dan kelas yang belum ada diberi tanda (baru)", () => {
    expect(opsiTujuanKelas("2A", 6, ["2A"])).toEqual([
      { value: "3A", label: "Naik ke Kelas 3A (baru)" },
      { value: "2A", label: "Tidak naik (tetap Kelas 2A)" },
    ]);
  });

  it("tingkat akhir: Lulus dan tidak naik", () => {
    expect(opsiTujuanKelas("6", 6, ["6"])).toEqual([
      { value: LULUS, label: "Lulus" },
      { value: "6", label: "Tidak naik (tetap Kelas 6)" },
    ]);
  });

  it("nama tak berangka → null (pemanggil memakai pilihan lengkap)", () => {
    expect(opsiTujuanKelas("Pelangi", 6, [])).toBeNull();
  });
});

describe("override basi diabaikan", () => {
  it("petaEfektif: pilihan di luar naik/lulus/tidak naik dibuang", () => {
    // admin memilih Lulus untuk kelas 6, lalu mengubah kelas terakhir jadi 9 → kembali ke usulan (naik ke 7)
    expect(petaEfektif(["6"], { "6": LULUS }, 9)).toEqual({ "6": "7" });
    // "Tidak naik" selalu sah
    expect(petaEfektif(["6"], { "6": "6" }, 9)).toEqual({ "6": "6" });
    // nilai asing dibuang
    expect(petaEfektif(["5"], { "5": "9" }, 6)).toEqual({ "5": "6" });
  });

  it("petaEfektif: kelas tak berangka menerima pilihan apa pun", () => {
    expect(petaEfektif(["Pelangi"], { Pelangi: "Bintang" }, 6)).toEqual({ Pelangi: "Bintang" });
  });

  it("pengecualianSah: hanya naik/lulus atau tidak naik", () => {
    const siswa = [S(1, "5"), S(2, "6"), S(3, "Pelangi")];
    expect(pengecualianSah(siswa, { 1: "5", 2: LULUS, 3: "Bintang" }, 6)).toEqual({ 1: "5", 2: LULUS, 3: "Bintang" });
    // tingkat akhir diubah → "Lulus" untuk kelas 6 tidak sah lagi; nilai asing untuk kelas 5 dibuang
    expect(pengecualianSah(siswa, { 1: "9", 2: LULUS }, 9)).toEqual({});
  });
});

describe("tujuanSiswa", () => {
  it("pengecualian menang atas pemetaan kelas", () => {
    const peta = { "5": "6" };
    expect(tujuanSiswa(S(1, "5"), peta, {})).toBe("6");
    expect(tujuanSiswa(S(1, "5"), peta, { 1: "5" })).toBe("5");
    expect(tujuanSiswa(S(1, "5"), peta, { 1: LULUS })).toBe(LULUS);
    expect(tujuanSiswa(S(1, "9"), peta, {})).toBe("");
  });
});

describe("ringkasKenaikan", () => {
  const siswa = [S(1, "4"), S(2, "5"), S(3, "5"), S(4, "6"), S(5, "6")];
  const peta = { "4": "5", "5": "6", "6": LULUS };

  it("menghitung naik/tetap/lulus; pemetaan berantai dihitung dari kelas AWAL", () => {
    const r = ringkasKenaikan(siswa, peta, { 3: "5" });
    expect(r.total).toEqual({ naik: 2, tetap: 1, lulus: 2, belum: 0, siswa: 5 });
    expect(r.jumlahPengecualian).toBe(1);
    expect(r.perKelas.map((k) => [k.dari, k.naik, k.tetap, k.lulus])).toEqual([
      ["4", 1, 0, 0],
      ["5", 1, 1, 0],
      ["6", 0, 0, 2],
    ]);
    expect(r.belumDipetakan).toEqual([]);
  });

  it("mendeteksi kelas yang belum dipetakan", () => {
    const r = ringkasKenaikan(siswa, { "4": "5", "5": "6" }, {});
    expect(r.belumDipetakan).toEqual(["6"]);
    expect(r.total.belum).toBe(2);
  });

  it("pengecualian menyelamatkan siswa dari kelas yang belum dipetakan", () => {
    const r = ringkasKenaikan([S(1, "6")], {}, { 1: LULUS });
    expect(r.belumDipetakan).toEqual([]);
    expect(r.total.lulus).toBe(1);
  });
});

describe("kelasTujuanBaru", () => {
  it("hanya kelas tujuan yang belum ada di master", () => {
    const siswa = [S(1, "5"), S(2, "6")];
    expect(kelasTujuanBaru(siswa, { "5": "6", "6": LULUS }, {}, ["5", "6"])).toEqual([]);
    expect(kelasTujuanBaru(siswa, { "5": "6", "6": "7" }, {}, ["5", "6"])).toEqual(["7"]);
  });
});

describe("buatPayload", () => {
  const siswa = [S(1, "5"), S(2, "5"), S(3, "6")];
  const peta = { "5": "6", "6": LULUS, "9": "10" }; // "9" tidak punya siswa → tidak ikut

  it("hanya kelas yang berisi siswa", () => {
    expect(buatPayload(siswa, peta, {}).pemetaan).toEqual([
      { dari: "5", ke: "6" },
      { dari: "6", ke: LULUS },
    ]);
  });

  it("membuang pengecualian yang sama dengan pemetaan, siswa tak dikenal, dan nilai kosong", () => {
    const p = buatPayload(siswa, peta, { 1: "6", 2: "5", 3: "", 99: "5" });
    expect(p.pengecualian).toEqual([{ siswa_id: 2, ke: "5" }]);
  });
});
