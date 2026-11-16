import { describe, expect, it } from "vitest";
import { susunPratinjauHari, parsePutuskan } from "./pengajuan";
import { PENJELASAN_MODE, bangunBodyPutuskan, kalimatAkibat, keteranganPratinjau, MAKS_CATATAN, ringkasAkibat, validasiKeputusan } from "./keputusan-pengajuan";

const HARI_INI = "2026-11-13";
const H = ["2026-11-11", "2026-11-12", "2026-11-16"]; // lampau, lampau, mendatang
const pratinjau = susunPratinjauHari(H, new Map([["2026-11-12", "hadir"]]), HARI_INI);
const set = (...t: string[]) => new Set(t);

describe("validasiKeputusan", () => {
  it("setujui semua dan tolak selalu sah (tanpa memeriksa pilihan hari)", () => {
    expect(validasiKeputusan({ mode: "semua", terpilih: set(), catatan: "" }, H)).toBeNull();
    expect(validasiKeputusan({ mode: "tolak", terpilih: set(), catatan: "" }, H)).toBeNull();
  });
  it("sebagian wajib memilih >=1 hari, semuanya milik pengajuan", () => {
    expect(validasiKeputusan({ mode: "sebagian", terpilih: set(), catatan: "" }, H)).toMatch(/minimal satu hari/);
    expect(validasiKeputusan({ mode: "sebagian", terpilih: set("2026-12-01"), catatan: "" }, H)).toMatch(/minimal satu hari/);
    expect(validasiKeputusan({ mode: "sebagian", terpilih: set(H[0]), catatan: "" }, H)).toBeNull();
  });
  it("catatan dipangkas dulu sebelum dihitung; batas ketat", () => {
    expect(validasiKeputusan({ mode: "semua", terpilih: set(), catatan: " ".repeat(500) + "ok" }, H)).toBeNull();
    expect(validasiKeputusan({ mode: "semua", terpilih: set(), catatan: "x".repeat(MAKS_CATATAN + 1) }, H)).toMatch(/maksimal/);
  });
});

describe("bangunBodyPutuskan", () => {
  it("semua: tanpa daftar hari", () => {
    expect(bangunBodyPutuskan({ mode: "semua", terpilih: set(), catatan: "" }, H)).toEqual({ keputusan: "setujui" });
  });
  it("sebagian: hanya hari terpilih, urut sesuai pengajuan", () => {
    expect(bangunBodyPutuskan({ mode: "sebagian", terpilih: set(H[2], H[0]), catatan: " baik " }, H)).toEqual({ keputusan: "setujui", hari: [H[0], H[2]], catatan: "baik" });
  });
  it("sebagian yang memilih SEMUA dikirim sebagai setujui penuh", () => {
    expect(bangunBodyPutuskan({ mode: "sebagian", terpilih: set(...H), catatan: "" }, H)).toEqual({ keputusan: "setujui" });
  });
  it("tolak tidak pernah membawa daftar hari, meski ada pilihan sisa", () => {
    expect(bangunBodyPutuskan({ mode: "tolak", terpilih: set(H[0]), catatan: "tidak ada surat" }, H)).toEqual({ keputusan: "tolak", catatan: "tidak ada surat" });
  });
  it("semua bentuk body lolos parsePutuskan di server (kontrak klien-server)", () => {
    for (const mode of ["semua", "sebagian", "tolak"] as const) {
      const body = bangunBodyPutuskan({ mode, terpilih: set(H[1]), catatan: "c" }, H);
      expect(parsePutuskan(body as unknown as Record<string, unknown>).hasOwnProperty("nilai")).toBe(true);
    }
  });
});

describe("ringkasAkibat", () => {
  it("setujui semua: hari hadir tidak diubah, mendatang dijadwalkan, lampau tanpa catatan ditulis", () => {
    const r = ringkasAkibat(pratinjau, "semua", set());
    expect(r).toEqual({ disetujui: 3, dialpha: 0, tidakBerubah: 1, dijadwalkan: 1 });
  });
  it("tolak: hanya hari lampau tanpa catatan jadi Alpha", () => {
    expect(ringkasAkibat(pratinjau, "tolak", set())).toEqual({ disetujui: 0, dialpha: 1, tidakBerubah: 0, dijadwalkan: 0 });
  });
  it("sebagian: yang tidak dicentang mengikuti aturan tidak-disetujui", () => {
    const r = ringkasAkibat(pratinjau, "sebagian", set(H[2]));
    expect(r).toEqual({ disetujui: 1, dialpha: 1, tidakBerubah: 0, dijadwalkan: 1 });
  });
  it("kalimat akibat hanya memuat bagian yang bernilai", () => {
    expect(kalimatAkibat({ disetujui: 0, dialpha: 0, tidakBerubah: 0, dijadwalkan: 0 })).toEqual([]);
    expect(kalimatAkibat({ disetujui: 2, dialpha: 1, tidakBerubah: 0, dijadwalkan: 0 })).toEqual(["2 hari disetujui.", "1 hari lampau tanpa catatan akan dicatat Alpha."]);
  });
});

describe("keteranganPratinjau", () => {
  it("menyebut catatan yang sudah ada dan akibat kedua pilihan", () => {
    const k = keteranganPratinjau(pratinjau[1]);
    expect(k.ada).toBe("Hadir");
    expect(k.setuju).toMatch(/tidak diubah/);
    expect(k.tidak).toBe("Tidak berubah");
    expect(keteranganPratinjau(pratinjau[0])).toMatchObject({ ada: null, setuju: "Dicatat sekarang", tidak: "Dicatat Alpha" });
  });
});

describe("PENJELASAN_MODE", () => {
  it("ada untuk setiap pilihan dan menyebut akibat Alpha pada pilihan yang bisa menimbulkannya", () => {
    for (const m of ["semua", "sebagian", "tolak"] as const) expect(PENJELASAN_MODE[m].isi.length).toBeGreaterThan(40);
    expect(PENJELASAN_MODE.semua.isi).not.toMatch(/Alpha/);
    expect(PENJELASAN_MODE.sebagian.isi).toMatch(/Alpha/);
    expect(PENJELASAN_MODE.tolak.isi).toMatch(/Alpha/);
  });
});
