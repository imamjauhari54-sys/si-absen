import { describe, it, expect } from "vitest";
import { paginasi } from "./paginasi";

describe("paginasi", () => {
  it("halaman pertama", () => {
    expect(paginasi(25, 1, 10)).toEqual({ page: 1, totalPages: 3, dari: 0, sampai: 10 });
  });

  it("halaman terakhir berisi sisa", () => {
    expect(paginasi(25, 3, 10)).toEqual({ page: 3, totalPages: 3, dari: 20, sampai: 25 });
  });

  it("page di luar rentang dibatasi", () => {
    expect(paginasi(25, 99, 10).page).toBe(3);
    expect(paginasi(25, 0, 10).page).toBe(1);
    expect(paginasi(25, -4, 10).page).toBe(1);
    expect(paginasi(25, NaN, 10).page).toBe(1);
  });

  it("daftar kosong tetap 1 halaman", () => {
    expect(paginasi(0, 1, 10)).toEqual({ page: 1, totalPages: 1, dari: 0, sampai: 0 });
  });

  it("pas kelipatan ukuran halaman", () => {
    expect(paginasi(20, 2, 10)).toEqual({ page: 2, totalPages: 2, dari: 10, sampai: 20 });
  });
});
