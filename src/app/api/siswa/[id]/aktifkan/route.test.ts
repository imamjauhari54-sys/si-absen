import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type PgError = { message: string; code?: string };

const h = vi.hoisted(() => ({
  session: null as null | { userId: number; username: string; role: string },
  rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
  rpcResult: { data: null as unknown, error: null as PgError | null },
  revalidated: [] as string[],
  fromCalled: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: (t: string) => h.revalidated.push(t) }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => h.session }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    // Route baru tidak boleh menyentuh tabel students langsung (UPDATE langsung = jalur yang dulu menghapus tanggal pindah).
    from: () => {
      h.fromCalled++;
      throw new Error("route tidak boleh memakai .from() — semua lewat fungsi SQL");
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      h.rpcCalls.push({ name, args });
      return h.rpcResult;
    },
  },
}));

import { NextRequest } from "next/server";
import { GET, POST } from "./route";

const ADMIN = { userId: 3, username: "admin", role: "admin" };
const GURU = { userId: 7, username: "guru5", role: "guru" };
const params = (id: string) => ({ params: Promise.resolve({ id }) });

function post(f: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(f)) fd.append(k, v);
  return new NextRequest("http://localhost/api/siswa/9/aktifkan", { method: "POST", body: fd });
}
const get = (q = "") => new NextRequest(`http://localhost/api/siswa/9/aktifkan${q}`);

beforeEach(() => {
  h.session = ADMIN;
  h.rpcCalls = [];
  h.rpcResult = { data: { mode: "batal_pindah", hari_alpha_diisi: 4 }, error: null };
  h.revalidated = [];
  h.fromCalled = 0;
});
afterEach(() => vi.restoreAllMocks());

describe("POST /api/siswa/[id]/aktifkan", () => {
  it("hanya admin: guru dan tanpa sesi ditolak 403, database tidak disentuh", async () => {
    h.session = GURU;
    expect((await POST(post({ mode: "batal_pindah" }), params("9"))).status).toBe(403);
    h.session = null;
    expect((await POST(post({ mode: "batal_pindah" }), params("9"))).status).toBe(403);
    expect(h.rpcCalls).toHaveLength(0);
  });

  it("ID tidak valid -> 400", async () => {
    for (const id of ["0", "abc", "-3", "9abc", "09", "9.5", "1e3", " 9", "99999999999999999999"]) {
      expect((await POST(post({ mode: "batal_pindah" }), params(id))).status, id).toBe(400);
      expect((await GET(get(), params(id))).status, id).toBe(400);
    }
    expect(h.rpcCalls).toHaveLength(0);
  });

  it("mode A: memanggil aktifkan_siswa dengan id admin dari SESI (bukan dari form), lalu revalidate", async () => {
    const res = await POST(post({ mode: "batal_pindah", p_admin_id: "999" }), params("9"));
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.hasil).toMatchObject({ hari_alpha_diisi: 4 });
    expect(h.rpcCalls).toEqual([
      { name: "aktifkan_siswa", args: { p_id: 9, p_mode: "batal_pindah", p_kembali: null, p_admin_id: 3 } },
    ]);
    expect(h.revalidated).toEqual(["siswa"]);
    expect(h.fromCalled).toBe(0);
  });

  it("mode tidak valid / kosong ditolak sebelum menyentuh database", async () => {
    expect((await (await POST(post({ mode: "asal" }), params("9"))).json()).status).toBe("error");
    expect((await (await POST(post({}), params("9"))).json()).status).toBe("error");
    expect(h.rpcCalls).toHaveLength(0);
  });

  it("mode B: diteruskan ke fungsi SQL dengan tanggal kembali", async () => {
    h.rpcResult = { data: { mode: "kembali_setelah_jeda", kembali_pada: "2026-10-01" }, error: null };
    const body = await (await POST(post({ mode: "kembali_setelah_jeda", kembali: "2026-10-01" }), params("9"))).json();
    expect(body.status).toBe("ok");
    expect(h.rpcCalls).toEqual([
      { name: "aktifkan_siswa", args: { p_id: 9, p_mode: "kembali_setelah_jeda", p_kembali: "2026-10-01", p_admin_id: 3 } },
    ]);
    expect(h.revalidated).toEqual(["siswa"]);
  });

  it("mode B: tanggal kembali kosong/tidak valid/masa depan ditolak sebelum menyentuh database", async () => {
    for (const kembali of ["", "2026-02-31", "besok", "2999-01-01"]) {
      const body = await (await POST(post({ mode: "kembali_setelah_jeda", kembali }), params("9"))).json();
      expect(body.status, kembali).toBe("error");
    }
    expect(h.rpcCalls).toHaveLength(0);
  });

  it("mode B: aturan 'kembali harus sesudah pindah' dari database diteruskan sebagai pesan", async () => {
    h.rpcResult = { data: null, error: { message: "Tanggal kembali harus sesudah tanggal pindah (2026-08-15).", code: "P0001" } };
    const body = await (await POST(post({ mode: "kembali_setelah_jeda", kembali: "2026-08-15" }), params("9"))).json();
    expect(body.status).toBe("error");
    expect(body.message).toMatch(/sesudah tanggal pindah/);
    expect(h.revalidated).toEqual([]);
  });

  it("klik ganda / admin lain lebih dulu: status sudah_aktif (bukan galat), daftar di-revalidate", async () => {
    h.rpcResult = { data: null, error: { message: "Siswa ini sudah aktif.", code: "P0001" } };
    const body = await (await POST(post({ mode: "batal_pindah" }), params("9"))).json();
    expect(body.status).toBe("sudah_aktif");
    expect(h.revalidated).toEqual(["siswa"]);
  });

  it("bentrok NISN: pesan jelas, tidak revalidate", async () => {
    h.rpcResult = { data: null, error: { message: 'violates unique constraint "idx_students_nisn_aktif"', code: "23505" } };
    const body = await (await POST(post({ mode: "batal_pindah" }), params("9"))).json();
    expect(body.status).toBe("error");
    expect(body.message).toMatch(/NISN/);
    expect(h.revalidated).toEqual([]);
  });

  it("migrasi belum dijalankan: gagal jelas, TANPA jatuh ke cara lama (UPDATE langsung)", async () => {
    h.rpcResult = { data: null, error: { message: "not found", code: "PGRST202" } };
    const body = await (await POST(post({ mode: "batal_pindah" }), params("9"))).json();
    expect(body.message).toMatch(/migrasi 025/);
    expect(h.fromCalled).toBe(0);
  });
});

describe("GET /api/siswa/[id]/aktifkan (pratinjau)", () => {
  it("hanya admin", async () => {
    h.session = GURU;
    expect((await GET(get(), params("9"))).status).toBe(403);
    expect(h.rpcCalls).toHaveLength(0);
  });

  it("meneruskan pratinjau dari database; tanpa kembali = null", async () => {
    h.rpcResult = { data: { nama: "Budi", hari_belum_tercatat: 47 }, error: null };
    const body = await (await GET(get(), params("9"))).json();
    expect(body).toEqual({ status: "ok", pratinjau: { nama: "Budi", hari_belum_tercatat: 47 } });
    expect(h.rpcCalls).toEqual([{ name: "pratinjau_aktifkan_siswa", args: { p_id: 9, p_kembali: null } }]);
  });

  it("tanggal kembali diteruskan bila valid, ditolak bila tidak", async () => {
    await GET(get("?kembali=2026-10-01"), params("9"));
    expect(h.rpcCalls[0].args).toEqual({ p_id: 9, p_kembali: "2026-10-01" });
    h.rpcCalls = [];
    const res = await GET(get("?kembali=2026-02-31"), params("9"));
    expect(res.status).toBe(400); // masukan salah = 400, bukan 200
    expect((await res.json()).status).toBe("error");
    expect(h.rpcCalls).toHaveLength(0);
  });

  it("siswa sudah aktif: sudah_aktif", async () => {
    h.rpcResult = { data: null, error: { message: "Siswa ini sudah aktif." } };
    expect((await (await GET(get(), params("9"))).json()).status).toBe("sudah_aktif");
  });
});
