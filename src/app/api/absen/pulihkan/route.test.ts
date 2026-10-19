import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Row = Record<string, unknown>;
type PgError = { message: string; code?: string; hint?: string; details?: string };

const h = vi.hoisted(() => ({
  session: null as null | { userId: number; username: string; role: string; kelas: string; nama: string },
  kelasWali: null as string | null,
  siswa: { id: 1, name: "Budi", class: "5", status: "aktif" } as Row | null,
  rpcCalls: [] as { name: string; args: Row }[],
  rpcResult: { data: null as unknown, error: null as PgError | null },
  siswaQueries: 0,
  siswaDiminta: [] as unknown[], // id yang diminta route ke tabel students
  kirimNotifAbsen: vi.fn(async () => {}),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: () => undefined }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => h.session }));
vi.mock("@/lib/data/wali-kelas", () => ({ getKelasWali: async () => h.kelasWali }));
vi.mock("@/lib/wa/notifikasi", () => ({ kirimNotifAbsen: h.kirimNotifAbsen }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    // Realistis: hanya mengembalikan siswa jika id yang DIMINTA route sama dengan id siswa mock.
    from: () => ({ select: () => ({ eq: (_kolom: string, id: unknown) => ({ maybeSingle: async () => { h.siswaQueries++; h.siswaDiminta.push(id); return { data: h.siswa && h.siswa.id === id ? h.siswa : null }; } }) }) }),
    rpc: async (name: string, args: Row) => {
      h.rpcCalls.push({ name, args });
      return h.rpcResult;
    },
  },
}));

import { NextRequest } from "next/server";
import { POST } from "./route";

const ADMIN = { userId: 1, username: "admin", role: "admin", kelas: "", nama: "Imam (Admin)" };
const GURU5 = { userId: 7, username: "guru5", role: "guru", kelas: "5", nama: "Bu Sri" };

function req(f: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(f)) fd.append(k, v);
  return new NextRequest("http://localhost/api/absen/pulihkan", { method: "POST", body: fd });
}
const dasar = { siswa_id: "1", tanggal: "2026-10-16", edit_id: "77" }; // edit_id = edit yang dikonfirmasi pengguna
const kode = (o_kode: string) => ({ data: [{ o_kode }], error: null });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.siswaQueries = 0;
  h.siswaDiminta = [];
  h.session = ADMIN;
  h.kelasWali = null;
  h.siswa = { id: 1, name: "Budi", class: "5", status: "aktif" };
  h.rpcCalls = [];
  h.rpcResult = kode("ok");
  h.kirimNotifAbsen.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/absen/pulihkan", () => {
  it("tanpa sesi -> 403", async () => {
    h.session = null;
    expect((await POST(req(dasar))).status).toBe(403);
    expect(h.rpcCalls).toHaveLength(0);
    expect(h.siswaQueries).toBe(0);
  });

  it("peran selain admin/guru -> 403 tanpa menyentuh database", async () => {
    h.session = { ...ADMIN, role: "siswa" };
    expect((await POST(req(dasar))).status).toBe(403);
    expect(h.rpcCalls).toHaveLength(0);
    expect(h.siswaQueries).toBe(0);
  });

  it("guru TIDAK boleh memulihkan siswa kelas lain (hak akses sama dengan edit)", async () => {
    h.session = GURU5;
    h.kelasWali = "5";
    h.siswa = { id: 1, name: "Rian", class: "6", status: "aktif" };
    expect((await POST(req(dasar))).status).toBe(403);
    expect(h.rpcCalls).toHaveLength(0);
  });

  it("guru boleh memulihkan siswa kelas wali-nya; pemulih tercatat", async () => {
    h.session = GURU5;
    h.kelasWali = "5";
    const res = await POST(req(dasar));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("ok");
    expect(h.rpcCalls[0]).toEqual({
      name: "pulihkan_edit_manual",
      args: { p_siswa_id: 1, p_tanggal: "2026-10-16", p_edit_id: 77, p_pemulih_id: 7, p_pemulih_nama: "Bu Sri" },
    });
  });

  it("admin boleh memulihkan siswa kelas mana pun", async () => {
    h.siswa = { id: 1, name: "Rian", class: "6", status: "aktif" };
    expect((await POST(req(dasar))).status).toBe(200);
  });

  it("penolakan dari database diteruskan apa adanya dan tidak pernah tampak berhasil", async () => {
    for (const [k, http] of [["sudah_berubah", 409], ["kedaluwarsa", 409], ["sudah_dipulihkan", 409], ["tidak_ada_edit", 404]] as const) {
      h.rpcResult = kode(k);
      const res = await POST(req(dasar));
      expect(res.status).toBe(http);
      expect((await res.json()).status).toBe("error");
    }
  });

  it("input tidak valid -> 400 tanpa menyentuh database", async () => {
    for (const f of [{ siswa_id: "0" }, { siswa_id: "abc" }, { tanggal: "2026-02-31" }, { tanggal: "" }]) {
      expect((await POST(req({ ...dasar, ...f }))).status).toBe(400);
    }
    expect(h.rpcCalls).toHaveLength(0);
  });

  it("galat database -> 500", async () => {
    h.rpcResult = { data: null, error: { message: "boom" } };
    expect((await POST(req(dasar))).status).toBe(500);
  });

  it("pemulihan tidak mengirim WhatsApp", async () => {
    await POST(req(dasar));
    expect(h.kirimNotifAbsen).not.toHaveBeenCalled();
  });

  it("guru tanpa kelas wali ditolak (fail-closed), tanpa memanggil RPC", async () => {
    h.session = GURU5;
    h.kelasWali = null;
    expect((await POST(req(dasar))).status).toBe(403);
    expect(h.rpcCalls).toHaveLength(0);
  });

  it("siswa tidak ditemukan -> ditolak tanpa memanggil RPC", async () => {
    h.siswa = null;
    expect((await POST(req(dasar))).status).toBeGreaterThanOrEqual(400);
    expect(h.rpcCalls).toHaveLength(0);
  });

  describe("validasi siswa_id", () => {
    it.each(["1abc", "abc", "", "0", "01", "-1", "+1", "1.5", "1e3", " 1", "1 ", "9007199254740993"])(
      "siswa_id %j -> 400 sebelum menyentuh database",
      async (v) => {
        expect((await POST(req({ ...dasar, siswa_id: v }))).status).toBe(400);
        expect(h.siswaQueries).toBe(0);
        expect(h.rpcCalls).toHaveLength(0);
      }
    );

    it("siswa_id valid dicari sebagai angka di tabel siswa dan dikirim ke RPC sebagai angka yang sama", async () => {
      h.siswa = { id: 123, name: "Sari", class: "5", status: "aktif" }; // siswa yang diminta benar-benar ada
      const res = await POST(req({ ...dasar, siswa_id: "123" }));
      expect(res.status).toBe(200);
      expect(h.siswaDiminta).toEqual([123]);
      expect(h.rpcCalls).toHaveLength(1);
      expect(h.rpcCalls[0].args.p_siswa_id).toBe(123);
    });

    it("siswa_id valid tetapi siswanya tidak ada -> ditolak tanpa memanggil RPC", async () => {
      // h.siswa bawaan ber-id 1; yang diminta 123 -> tidak ditemukan
      const res = await POST(req({ ...dasar, siswa_id: "123" }));
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(h.siswaDiminta).toEqual([123]);
      expect(h.rpcCalls).toHaveLength(0);
    });

    it("siswa_id yang tidak dikirim -> 400", async () => {
      expect((await POST(req({ tanggal: dasar.tanggal }))).status).toBe(400);
      expect(h.rpcCalls).toHaveLength(0);
    });
  });

  describe("galat database", () => {
    it("browser hanya menerima pesan umum; detail masuk log server", async () => {
      const rahasia = "permission denied for table absensi_edit_manual (host db.internal:5432)";
      h.rpcResult = { data: null, error: { code: "42501", message: rahasia } };
      const res = await POST(req(dasar));
      const teks = JSON.stringify(await res.json());
      expect(res.status).toBe(500);
      expect(teks).not.toMatch(/permission denied|absensi_edit_manual|db\.internal|42501|Gagal DB/);
      expect(teks).toMatch(/Gagal memulihkan data/);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining("pulihkan_edit_manual"), expect.objectContaining({ code: "42501", message: rahasia }));
    });
  });

  describe("hasil RPC yang tidak sesuai tidak pernah tampak berhasil", () => {
    it.each([
      ["null", null],
      ["array kosong", []],
      ["bukan array", { o_kode: "ok" }],
      ["lebih dari satu baris", [{ o_kode: "ok" }, { o_kode: "ok" }]],
      ["baris tanpa o_kode", [{}]],
      ["o_kode bukan string", [{ o_kode: true }]],
      ["kode asing", [{ o_kode: "berhasil_kok" }]],
    ])("%s -> 500, bukan ok", async (_n, data) => {
      h.rpcResult = { data, error: null };
      const res = await POST(req(dasar));
      const body = await res.json();
      expect(res.status).toBe(500);
      expect(body.status).toBe("error");
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining("tidak sesuai"), expect.any(String));
    });
  });

  // ── edit_id: yang dipulihkan harus persis edit yang dikonfirmasi pengguna ────
  describe("edit_id (ID edit yang dikonfirmasi)", () => {
    it("dikirim ke RPC sebagai angka yang sama, tidak diturunkan dari tempat lain", async () => {
      await POST(req({ ...dasar, edit_id: "123456789" }));
      expect(h.rpcCalls).toHaveLength(1);
      expect(h.rpcCalls[0].args.p_edit_id).toBe(123456789);
      expect(Object.keys(h.rpcCalls[0].args).sort()).toEqual(["p_edit_id", "p_pemulih_id", "p_pemulih_nama", "p_siswa_id", "p_tanggal"]);
    });

    it("edit_id wajib: tidak dikirim -> 400 sebelum menyentuh database", async () => {
      const { edit_id: _abaikan, ...tanpa } = dasar;
      void _abaikan;
      const res = await POST(req(tanpa));
      expect(res.status).toBe(400);
      expect(h.siswaQueries).toBe(0);
      expect(h.rpcCalls).toHaveLength(0);
    });

    it.each(["", "0", "01", "-1", "+1", "1abc", "abc", "1.5", "1e3", " 1", "1 ", "9007199254740993", "null", "undefined"])(
      "edit_id %j ditolak 400 sebelum menyentuh database",
      async (v) => {
        const res = await POST(req({ ...dasar, edit_id: v }));
        expect(res.status).toBe(400);
        expect(h.siswaQueries).toBe(0);
        expect(h.rpcCalls).toHaveLength(0);
      }
    );

    it("edit usang (sudah ada edit baru) -> 409 sudah_berubah: ditolak, dilaporkan jelas, bukan ok", async () => {
      h.rpcResult = kode("sudah_berubah");
      const res = await POST(req(dasar));
      const body = await res.json();
      expect(res.status).toBe(409);
      expect(body.status).toBe("error");
      expect(body.message).toBe("Data sudah berubah sejak edit yang dipilih. Muat ulang Rekap, lalu pilih Pulihkan dari edit terbaru.");
    });

    it("hak akses tetap diperiksa lebih dulu: guru kelas lain dengan edit_id valid -> 403, RPC tidak dipanggil", async () => {
      h.session = GURU5;
      h.kelasWali = "5";
      h.siswa = { id: 1, name: "Rian", class: "6", status: "aktif" };
      const res = await POST(req({ ...dasar, edit_id: "5" }));
      expect(res.status).toBe(403);
      expect(h.rpcCalls).toHaveLength(0);
    });
  });
});
