import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  siswa: null as { id: number; name: string; class: string; status: string } | null,
  kelasWali: null as string | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error("REDIRECT:" + url);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.siswa }) }) }) }),
  },
}));
vi.mock("@/lib/data/wali-kelas", () => ({ getKelasWali: async () => h.kelasWali }));

import { assertBolehAksesSiswa, getBatasKelas, kelasHalamanAtauRedirect } from "./akses-kelas";
import type { SessionPayload } from "@/types";

const guru = { userId: 7, username: "g", nama: "Guru", role: "guru", kelas: "5", foto: null } as SessionPayload;
const admin = { ...guru, role: "admin", kelas: "" } as SessionPayload;

beforeEach(() => {
  h.siswa = { id: 1, name: "Budi", class: "6", status: "aktif" };
  h.kelasWali = "5";
});

describe("assertBolehAksesSiswa", () => {
  it("guru ditolak untuk siswa kelas lain walau JWT-nya bilang kelas itu miliknya", async () => {
    const jwtBasi = { ...guru, kelas: "6" } as SessionPayload; // JWT lama; DB sudah kelas 5
    expect(await assertBolehAksesSiswa(jwtBasi, 1)).toMatchObject({ ok: false, status: 403 });
  });
  it("guru boleh siswa kelas wali-nya (menurut DB)", async () => {
    h.siswa = { id: 2, name: "Ani", class: "5", status: "aktif" };
    expect(await assertBolehAksesSiswa(guru, 2)).toMatchObject({ ok: true });
  });
  it("guru yang kelasnya sudah dicabut ditolak semua", async () => {
    h.kelasWali = null;
    h.siswa = { id: 2, name: "Ani", class: "5", status: "aktif" };
    expect(await assertBolehAksesSiswa(guru, 2)).toMatchObject({ ok: false, status: 403 });
  });
  it("admin boleh semua; siswa tidak ada -> 404", async () => {
    expect(await assertBolehAksesSiswa(admin, 1)).toMatchObject({ ok: true });
    h.siswa = null;
    expect(await assertBolehAksesSiswa(admin, 99)).toMatchObject({ ok: false, status: 404 });
  });
});

describe("getBatasKelas & kelasHalamanAtauRedirect", () => {
  it("admin = semua; guru = kelas dari DB; guru tanpa kelas = null", async () => {
    expect(await getBatasKelas(admin)).toEqual({ semua: true });
    expect(await getBatasKelas(guru)).toEqual({ semua: false, kelas: "5" });
    h.kelasWali = null;
    expect(await getBatasKelas(guru)).toEqual({ semua: false, kelas: null });
  });
  it("halaman: admin -> '' ; guru -> kelas ; guru tanpa kelas -> redirect (tidak pernah '')", async () => {
    expect(await kelasHalamanAtauRedirect(admin)).toBe("");
    expect(await kelasHalamanAtauRedirect(guru)).toBe("5");
    h.kelasWali = null;
    await expect(kelasHalamanAtauRedirect(guru)).rejects.toThrow("REDIRECT:/tanpa-kelas");
  });
});
