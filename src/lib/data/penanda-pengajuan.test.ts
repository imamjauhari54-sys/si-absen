import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ hitung: vi.fn(), tag: vi.fn(), kunci: [] as unknown[][] }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => unknown, kunci: unknown, opsi: unknown) => { h.kunci.push([kunci, opsi]); return fn; },
  revalidateTag: h.tag,
}));
vi.mock("@/lib/data/pengajuan", () => ({ hitungPengajuanMenunggu: h.hitung }));

import { hitungPenandaPengajuan, segarkanPenandaPengajuan, TAG_PENANDA_PENGAJUAN } from "./penanda-pengajuan";

beforeEach(() => { vi.clearAllMocks(); h.kunci.length = 0; });

describe("hitungPenandaPengajuan", () => {
  it("mengembalikan jumlah; kunci cache memisahkan kelas dan 'semua', dengan tag + masa berlaku singkat", async () => {
    h.hitung.mockResolvedValue(4);
    expect(await hitungPenandaPengajuan("5")).toBe(4);
    expect(await hitungPenandaPengajuan(null)).toBe(4);
    expect(h.hitung).toHaveBeenNthCalledWith(1, "5");
    expect(h.hitung).toHaveBeenNthCalledWith(2, null);
    expect(h.kunci[0]).toEqual([["penanda-pengajuan", "5"], { tags: [TAG_PENANDA_PENGAJUAN], revalidate: 30 }]);
    expect(h.kunci[1][0]).toEqual(["penanda-pengajuan", "*"]);
  });
  it("galat database (mis. migrasi 027 belum jalan) -> 0, tidak melempar (layout aman)", async () => {
    h.hitung.mockRejectedValue(new Error("relation does not exist"));
    await expect(hitungPenandaPengajuan("5")).resolves.toBe(0);
  });
});

describe("segarkanPenandaPengajuan", () => {
  it("membuang tag; bila revalidateTag melempar (di luar permintaan) diabaikan", () => {
    segarkanPenandaPengajuan();
    expect(h.tag).toHaveBeenCalledWith(TAG_PENANDA_PENGAJUAN, "max");
    h.tag.mockImplementation(() => { throw new Error("Invariant"); });
    expect(() => segarkanPenandaPengajuan()).not.toThrow();
  });
});
