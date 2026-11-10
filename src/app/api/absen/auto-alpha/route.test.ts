import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Baris = Record<string, unknown>;
type RpcHasil = { data: unknown; error: { message: string; code?: string } | null };

const h = vi.hoisted(() => ({
  session: null as null | { userId: number; role: string },
  siswa: [] as { id: number; name: string; class: string }[],
  absensiHariIni: [] as { siswa_id: number }[],
  /** baris absensi tambahan yang baru "muncul" SETELAH rpc terapkan_rencana_pengajuan (izin dari pengajuan) */
  absensiSetelahRpc: [] as { siswa_id: number }[],
  rpcHasil: { data: { ditulis: 0, menunggu: [] as number[] }, error: null } as RpcHasil,
  urutan: [] as string[],
  upserts: [] as Baris[][],
  wa: [] as { id: number }[][],
  after: [] as (() => Promise<void>)[],
  rpcSudah: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => {
  const a = await importOriginal<typeof import("next/server")>();
  return { ...a, after: (fn: () => Promise<void>) => void h.after.push(fn) };
});
vi.mock("@/lib/auth/session", () => ({ getSession: async () => h.session }));
vi.mock("@/lib/wa/notifikasi", () => ({
  kirimNotifAlphaMassal: async (daftar: { id: number }[]) => void h.wa.push(daftar),
}));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    rpc: async (nama: string) => {
      h.urutan.push(`rpc:${nama}`);
      h.rpcSudah = true;
      return h.rpcHasil;
    },
    from: (tabel: string) => {
      const b: Record<string, unknown> = {};
      const sendiri = () => b;
      b.select = sendiri; b.eq = sendiri; b.limit = sendiri;
      b.maybeSingle = async () => ({ data: tabel === "absensi_setting" ? { tapel: "2026/2027", semester: "ganjil" } : null });
      b.upsert = async (rows: Baris[]) => { h.urutan.push("upsert"); h.upserts.push(rows); return { error: null }; };
      b.then = (res: (v: unknown) => unknown) => {
        if (tabel === "students") return Promise.resolve({ data: h.siswa }).then(res);
        if (tabel === "absensi") {
          h.urutan.push("baca-absensi");
          return Promise.resolve({ data: [...h.absensiHariIni, ...(h.rpcSudah ? h.absensiSetelahRpc : [])] }).then(res);
        }
        return Promise.resolve({ data: [] }).then(res);
      };
      return b;
    },
  },
}));

import { NextRequest } from "next/server";
import { POST } from "./route";

const req = () => new NextRequest("http://localhost/api/absen/auto-alpha", { method: "POST" });
const SISWA = [1, 2, 3, 4].map((id) => ({ id, name: `S${id}`, class: "5" }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-04T05:00:00Z")); // Rabu 12:00 WIB
  Object.assign(h, { session: { userId: 1, role: "admin" }, siswa: SISWA, absensiHariIni: [], absensiSetelahRpc: [], urutan: [], upserts: [], wa: [], after: [], rpcSudah: false });
  h.rpcHasil = { data: { ditulis: 0, menunggu: [] }, error: null };
});
afterEach(() => vi.useRealTimers());

const jalankan = async () => { const r = await POST(req()); const body = await r.json(); for (const fn of h.after) await fn(); return { status: r.status, body }; };
const idAlpha = () => h.upserts.flat().map((r) => r.siswa_id as number).sort();
const idWa = () => h.wa.flat().map((s) => s.id).sort();

describe("auto-alpha: pengajuan izin/sakit orang tua", () => {
  it("tanpa pengajuan: perilaku lama utuh (semua yang belum absen Alpha + WA)", async () => {
    const { body } = await jalankan();
    expect(idAlpha()).toEqual([1, 2, 3, 4]);
    expect(idWa()).toEqual([1, 2, 3, 4]);
    expect(body.alpha).toBe(4);
  });

  it("pengajuan MENUNGGU hari ini: TIDAK ditulis Alpha dan TIDAK dikirimi WA Alpha", async () => {
    h.rpcHasil = { data: { ditulis: 0, menunggu: [2, 3] }, error: null };
    const { body } = await jalankan();
    expect(idAlpha()).toEqual([1, 4]);
    expect(idWa()).toEqual([1, 4]);
    expect(body.ditunda).toBe(2);
    expect(body.message).toMatch(/2 siswa ditunda/);
  });

  it("pengajuan disetujui ditulis SEBELUM absensi dibaca, sehingga siswa itu tidak ikut Alpha/WA", async () => {
    h.rpcHasil = { data: { ditulis: 1, menunggu: [] }, error: null };
    h.absensiSetelahRpc = [{ siswa_id: 3 }]; // baris izin dari pengajuan baru ada SETELAH rpc
    const { body } = await jalankan();
    expect(h.urutan.indexOf("rpc:terapkan_rencana_pengajuan")).toBeLessThan(h.urutan.indexOf("baca-absensi"));
    expect(idAlpha()).toEqual([1, 2, 4]);
    expect(idWa()).toEqual([1, 2, 4]);
    expect(body.dariPengajuan).toBe(1);
    expect(body.message).toMatch(/1 izin\/sakit dari pengajuan/);
  });

  it("siswa yang sudah discan tidak disentuh (scan menang), siswa Menunggu yang sudah punya catatan tidak dihitung ditunda", async () => {
    h.absensiHariIni = [{ siswa_id: 1 }];
    h.rpcHasil = { data: { ditulis: 0, menunggu: [1, 2] }, error: null };
    const { body } = await jalankan();
    expect(idAlpha()).toEqual([3, 4]);
    expect(body.ditunda).toBe(1); // hanya siswa 2 yang benar-benar ditunda (siswa 1 sudah punya catatan)
  });

  it("fitur belum terpasang (migrasi 027 belum jalan): lanjut seperti biasa", async () => {
    h.rpcHasil = { data: null, error: { message: "function not found", code: "PGRST202" } };
    await jalankan();
    expect(idAlpha()).toEqual([1, 2, 3, 4]);
  });

  it("GAGAL TERTUTUP: galat lain pada pengajuan -> 500, tidak ada Alpha dan tidak ada WA", async () => {
    h.rpcHasil = { data: null, error: { message: "boom", code: "XX000" } };
    const { status, body } = await jalankan();
    expect(status).toBe(500);
    expect(body.message).toMatch(/Alpha otomatis ditunda/);
    expect(h.upserts).toHaveLength(0);
    expect(h.wa).toHaveLength(0);
  });

  it("bukan admin dan tanpa CRON_SECRET: ditolak 403, tidak menyentuh pengajuan", async () => {
    h.session = null;
    const r = await POST(req());
    expect(r.status).toBe(403);
    expect(h.urutan).toEqual([]);
  });

  it("hari Minggu: berhenti sebelum memproses pengajuan", async () => {
    vi.setSystemTime(new Date("2026-11-08T05:00:00Z")); // Minggu
    const r = await POST(req());
    expect((await r.json()).message).toMatch(/Minggu/);
    expect(h.urutan.filter((x) => x.startsWith("rpc"))).toEqual([]);
  });
});
