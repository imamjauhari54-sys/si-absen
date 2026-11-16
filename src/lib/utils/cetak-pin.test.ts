import { describe, expect, it } from "vitest";
import { bacaPinBaru, bagiHalaman, formatPinTampil, gabungPin, keadaanPin } from "./cetak-pin";

describe("formatPinTampil", () => {
  it("memberi spasi di tengah hanya untuk 6 digit", () => {
    expect(formatPinTampil("482913")).toBe("482 913");
    expect(formatPinTampil("12345")).toBe("12345");
    expect(formatPinTampil("12a456")).toBe("12a456");
  });
});

describe("bagiHalaman", () => {
  it("memotong per lembar dan tidak kehilangan elemen", () => {
    const a = Array.from({ length: 19 }, (_, i) => i);
    const h = bagiHalaman(a, 8);
    expect(h.map((x) => x.length)).toEqual([8, 8, 3]);
    expect(h.flat()).toEqual(a);
    expect(bagiHalaman([], 8)).toEqual([]);
    expect(bagiHalaman([1, 2], 0)).toEqual([[1], [2]]);
  });
});

describe("bacaPinBaru", () => {
  it("membuang entri rusak, PIN bukan 6 digit, dan bentuk non-array", () => {
    expect(bacaPinBaru(null)).toEqual([]);
    expect(bacaPinBaru({})).toEqual([]);
    const r = bacaPinBaru([
      { siswaId: 1, nama: "A", kelas: "5", pin: "123456" },
      { siswaId: 2, nama: "B", kelas: "5", pin: "12345" },
      { siswaId: "3", nama: "C", kelas: "5", pin: "123456" },
      null,
      { siswaId: 4, pin: "654321" },
    ]);
    expect(r).toEqual([
      { siswaId: 1, nama: "A", kelas: "5", pin: "123456" },
      { siswaId: 4, nama: "", kelas: "", pin: "654321" },
    ]);
  });
});

describe("gabungPin", () => {
  it("PIN terbaru siswa yang sama menang dan hasil terurut nama", () => {
    const lama = [{ siswaId: 1, nama: "Budi", kelas: "5", pin: "111111" }, { siswaId: 2, nama: "Ani", kelas: "5", pin: "222222" }];
    const baru = [{ siswaId: 1, nama: "Budi", kelas: "5", pin: "999999" }];
    const g = gabungPin(lama, baru);
    expect(g.map((x) => x.nama)).toEqual(["Ani", "Budi"]);
    expect(g.find((x) => x.siswaId === 1)?.pin).toBe("999999");
  });
});

describe("keadaanPin", () => {
  const dasar = { pinDiatur: true, dibagikanPada: null, terkunciSampai: null };
  it("urutan prioritas", () => {
    expect(keadaanPin({ ...dasar, pinDiatur: false }, false)).toBe("belum");
    expect(keadaanPin({ ...dasar, terkunciSampai: "x", dibagikanPada: "y" }, true)).toBe("terkunci");
    expect(keadaanPin({ ...dasar, dibagikanPada: "y" }, true)).toBe("baru");
    expect(keadaanPin({ ...dasar, dibagikanPada: "y" }, false)).toBe("dibagikan");
    expect(keadaanPin(dasar, false)).toBe("belum_dibagikan");
  });
});
