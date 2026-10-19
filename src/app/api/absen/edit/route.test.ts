import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Row = Record<string, unknown>;
type PgError = { message: string; code?: string; hint?: string };

const CLOUD = "demo-cloud";
const URL_OK = `https://res.cloudinary.com/${CLOUD}/image/upload/v1700000000/surat.jpg`;

const h = vi.hoisted(() => ({
  session: null as null | { userId: number; username: string; role: string; kelas: string; nama: string },
  kelasWali: null as string | null,
  siswa: { id: 1, name: "Budi", class: "5", status: "aktif" } as Row | null,
  libur: { data: [] as { tanggal: string }[] | null, error: null as PgError | null },
  rpcCalls: [] as { name: string; args: Row }[],
  // null = mock membuat hasil wajar otomatis (satu baris per tanggal yang dikirim)
  rpcResult: null as null | { data: unknown; error: PgError | null },
  liburQueries: 0,
  siswaQueries: 0,
  siswaDiminta: [] as unknown[], // id yang diminta route ke tabel students
  kirimNotifAbsen: vi.fn(async () => {}),
  settingDipanggil: vi.fn(async () => ({ tapel: "2026/2027", semester: "ganjil" })),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: () => undefined }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => h.session }));
vi.mock("@/lib/data/wali-kelas", () => ({ getKelasWali: async () => h.kelasWali }));
// Setting aktif TIDAK boleh dipakai route edit (periode ditentukan per tanggal oleh database).
vi.mock("@/lib/data/dashboard", () => ({ getAbsensiSetting: h.settingDipanggil }));
vi.mock("@/lib/wa/notifikasi", () => ({ kirimNotifAbsen: h.kirimNotifAbsen }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: (t: string) => {
      if (t === "students") {
        // Realistis: hanya mengembalikan siswa jika id yang DIMINTA route sama dengan id siswa mock.
        return { select: () => ({ eq: (_kolom: string, id: unknown) => ({ maybeSingle: async () => { h.siswaQueries++; h.siswaDiminta.push(id); return { data: h.siswa && h.siswa.id === id ? h.siswa : null }; } }) }) };
      }
      // hari_libur: select().gte().lte() lalu di-await
      h.liburQueries++;
      const q = { gte: () => q, lte: () => q, then: (r: (v: unknown) => unknown) => Promise.resolve({ data: h.libur.data, error: h.libur.error }).then(r) };
      return { select: () => q };
    },
    rpc: async (name: string, args: Row) => {
      h.rpcCalls.push({ name, args });
      return h.rpcResult ?? { data: (args.p_tanggal as string[]).map((t) => ({ o_tanggal: t, o_diubah: true, o_periode_baru: null })), error: null };
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
  return new NextRequest("http://localhost/api/absen/edit", { method: "POST", body: fd });
}
const dasar = { action: "edit_status", siswa_id: "1", tanggal: "2026-10-16", status: "sakit", keterangan: "Demam" };

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", CLOUD);
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.session = ADMIN;
  h.kelasWali = null;
  h.siswa = { id: 1, name: "Budi", class: "5", status: "aktif" };
  h.libur = { data: [], error: null };
  h.rpcCalls = [];
  h.rpcResult = null;
  h.liburQueries = 0;
  h.siswaQueries = 0;
  h.siswaDiminta = [];
  h.kirimNotifAbsen.mockClear();
  h.settingDipanggil.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/absen/edit", () => {
  it("tanpa sesi -> 403 dan tidak menulis apa pun", async () => {
    h.session = null;
    expect((await POST(req(dasar))).status).toBe(403);
    expect(h.rpcCalls).toHaveLength(0);
    expect(h.liburQueries).toBe(0);
    expect(h.siswaQueries).toBe(0);
  });

  it("peran selain admin/guru -> 403 tanpa menyentuh database", async () => {
    h.session = { ...ADMIN, role: "siswa" };
    expect((await POST(req(dasar))).status).toBe(403);
    expect(h.rpcCalls).toHaveLength(0);
    expect(h.liburQueries).toBe(0);
  });

  it("guru TIDAK boleh mengedit siswa kelas lain (403, tanpa penulisan)", async () => {
    h.session = GURU5;
    h.kelasWali = "5";
    h.siswa = { id: 1, name: "Rian", class: "6", status: "aktif" };
    const res = await POST(req(dasar));
    expect(res.status).toBe(403);
    expect(h.rpcCalls).toHaveLength(0);
    expect(h.liburQueries).toBe(0); // otorisasi gagal: tidak ada query lanjutan sama sekali
  });

  it("guru boleh mengedit siswa kelas wali-nya", async () => {
    h.session = GURU5;
    h.kelasWali = "5";
    const res = await POST(req(dasar));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("ok");
    expect(h.rpcCalls).toHaveLength(1);
  });

  it("guru tanpa kelas wali ditolak (fail-closed)", async () => {
    h.session = GURU5;
    h.kelasWali = null;
    expect((await POST(req(dasar))).status).toBe(403);
    expect(h.rpcCalls).toHaveLength(0);
    expect(h.liburQueries).toBe(0);
  });

  it("siswa tidak ditemukan -> ditolak tanpa query libur atau penulisan", async () => {
    h.siswa = null;
    const res = await POST(req(dasar));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(h.rpcCalls).toHaveLength(0);
    expect(h.liburQueries).toBe(0);
  });

  it("admin bisa mengedit siswa kelas mana pun; satu panggilan atomik dengan 7 argumen, identitas editor dari sesi", async () => {
    h.siswa = { id: 1, name: "Rian", class: "6", status: "aktif" };
    const res = await POST(req(dasar));
    expect((await res.json()).status).toBe("ok");
    expect(h.rpcCalls).toHaveLength(1);
    expect(h.rpcCalls[0]).toEqual({
      name: "edit_manual_absensi",
      args: {
        p_siswa_id: 1,
        p_tanggal: ["2026-10-16"],
        p_status: "sakit",
        p_keterangan: "Demam",
        p_lampiran: null,
        p_editor_id: 1,
        p_editor_nama: "Imam (Admin)",
      },
    });
  });

  it("identitas editor tidak bisa disuntik dari input browser", async () => {
    await POST(req({ ...dasar, p_editor_id: "999", editor_nama: "Penyusup", p_editor_nama: "Penyusup" }));
    expect(h.rpcCalls[0].args).toMatchObject({ p_editor_id: 1, p_editor_nama: "Imam (Admin)" });
  });

  it("periode TIDAK ditentukan route: tidak memakai setting aktif dan tidak mengirim p_tapel/p_semester", async () => {
    await POST(req({ ...dasar, p_tapel: "2099/2100", p_semester: "genap", tapel: "2099/2100", semester: "genap" }));
    expect(h.settingDipanggil).not.toHaveBeenCalled();
    expect(h.rpcCalls[0].args).not.toHaveProperty("p_tapel");
    expect(h.rpcCalls[0].args).not.toHaveProperty("p_semester");
    expect(Object.keys(h.rpcCalls[0].args).sort()).toEqual(
      ["p_editor_id", "p_editor_nama", "p_keterangan", "p_lampiran", "p_siswa_id", "p_status", "p_tanggal"]
    );
  });

  it("edit manual tidak mengirim notifikasi WhatsApp", async () => {
    await POST(req(dasar));
    await POST(req({ ...dasar, status: "hadir" }));
    expect(h.kirimNotifAbsen).not.toHaveBeenCalled();
  });

  it("rentang: Minggu & libur dilewati, sisanya dikirim sekali jalan (semua atau tidak sama sekali)", async () => {
    h.libur = { data: [{ tanggal: "2026-10-20" }], error: null };
    h.rpcResult = {
      data: [
        { o_tanggal: "2026-10-16", o_diubah: true },
        { o_tanggal: "2026-10-17", o_diubah: true },
        { o_tanggal: "2026-10-19", o_diubah: false },
      ],
      error: null,
    };
    const res = await POST(req({ ...dasar, tanggal: "2026-10-16", tanggal_sampai: "2026-10-20" }));
    const body = await res.json();
    expect(h.rpcCalls).toHaveLength(1);
    expect(h.rpcCalls[0].args.p_tanggal).toEqual(["2026-10-16", "2026-10-17", "2026-10-19"]);
    expect(body).toMatchObject({ status: "ok", diproses: 3, diubah: 2, dilewati: 2, barisBaru: 0, periodeKalender: [] });
  });

  it("rentang melintasi pergantian semester/tapel dikirim utuh dalam satu panggilan (periode per tanggal ditentukan database)", async () => {
    await POST(req({ ...dasar, tanggal: "2026-06-29", tanggal_sampai: "2026-07-02" }));
    expect(h.rpcCalls).toHaveLength(1);
    expect(h.rpcCalls[0].args.p_tanggal).toEqual(["2026-06-29", "2026-06-30", "2026-07-01", "2026-07-02"]);
  });

  it("melaporkan baris baru dan tanggal yang periodenya terpaksa dari kalender", async () => {
    const dariRecord = { tapel: "2025/2026", semester: "genap", sumber_tapel: "record", sumber_semester: "record" };
    const dariKalender = { tapel: "2026/2027", semester: "ganjil", sumber_tapel: "kalender", sumber_semester: "kalender" };
    const semesterKalender = { tapel: "2025/2026", semester: "genap", sumber_tapel: "record", sumber_semester: "kalender" };
    h.rpcResult = {
      data: [
        { o_tanggal: "2026-06-29", o_diubah: true, o_periode_baru: dariRecord },
        { o_tanggal: "2026-06-30", o_diubah: true, o_periode_baru: semesterKalender },
        { o_tanggal: "2026-07-01", o_diubah: true, o_periode_baru: dariKalender },
        { o_tanggal: "2026-07-02", o_diubah: true, o_periode_baru: null },
      ],
      error: null,
    };
    const body = await (await POST(req({ ...dasar, tanggal: "2026-06-29", tanggal_sampai: "2026-07-02" }))).json();
    expect(body).toMatchObject({ status: "ok", diubah: 4, barisBaru: 3, periodeKalender: ["2026-06-30", "2026-07-01"] });
  });

  it("semua tanggal Minggu/libur -> error, tidak ada penulisan", async () => {
    const body = await (await POST(req({ ...dasar, tanggal: "2026-10-18" }))).json();
    expect(body.status).toBe("error");
    expect(h.rpcCalls).toHaveLength(0);
  });

  it("status/tanggal tidak valid ditolak sebelum menyentuh database", async () => {
    for (const f of [{ status: "pulang" }, { status: "" }, { tanggal: "2026-02-31" }, { tanggal: "" }, { siswa_id: "0" }]) {
      const body = await (await POST(req({ ...dasar, ...f }))).json();
      expect(body.status).toBe("error");
    }
    expect(h.rpcCalls).toHaveLength(0);
  });

  it("rentang lebih dari 92 hari ditolak tanpa penulisan", async () => {
    const body = await (await POST(req({ ...dasar, tanggal: "2026-01-01", tanggal_sampai: "2026-06-30" }))).json();
    expect(body.status).toBe("error");
    expect(h.rpcCalls).toHaveLength(0);
  });

  // ── Temuan 2: kegagalan query hari libur ────────────────────────────────
  describe("kegagalan query hari libur", () => {
    it("query error -> HTTP 500 pesan aman, proses dihentikan, tidak ada penulisan", async () => {
      h.libur = { data: null, error: { message: 'relation "public.hari_libur" does not exist (rahasia internal)' } };
      const res = await POST(req(dasar));
      const body = await res.json();
      expect(res.status).toBe(500);
      expect(body.status).toBe("error");
      expect(body.message).toMatch(/hari libur/i);
      expect(body.message).not.toMatch(/relation|rahasia|public\./);
      expect(h.rpcCalls).toHaveLength(0);
    });

    it("error DENGAN data parsial tetap menghentikan proses (tidak dianggap daftar libur kosong)", async () => {
      h.libur = { data: [], error: { message: "timeout" } };
      const res = await POST(req(dasar));
      expect(res.status).toBe(500);
      expect(h.rpcCalls).toHaveLength(0);
    });

    it("data null tanpa error juga gagal tertutup", async () => {
      h.libur = { data: null, error: null };
      expect((await POST(req(dasar))).status).toBe(500);
      expect(h.rpcCalls).toHaveLength(0);
    });

    it("daftar libur kosong yang sah (tanpa error) tetap lanjut", async () => {
      h.libur = { data: [], error: null };
      expect((await POST(req(dasar))).status).toBe(200);
      expect(h.rpcCalls).toHaveLength(1);
    });

    it("hari Minggu dan hari libur tetap dilewati seperti sebelumnya", async () => {
      h.libur = { data: [{ tanggal: "2026-10-16" }], error: null };
      // 16 Okt libur, 17 Okt Sabtu (diproses), 18 Okt Minggu (dilewati)
      const body = await (await POST(req({ ...dasar, tanggal: "2026-10-16", tanggal_sampai: "2026-10-18" }))).json();
      expect(h.rpcCalls).toHaveLength(1);
      expect(h.rpcCalls[0].args.p_tanggal).toEqual(["2026-10-17"]);
      expect(body).toMatchObject({ status: "ok", diproses: 1, dilewati: 2 });
    });
  });

  // ── Temuan 3: validasi lampiran Cloudinary ──────────────────────────────
  describe("lampiran", () => {
    it("kosong = tidak diubah (null), __HAPUS__ = hapus (\"\"), URL Cloudinary milik aplikasi = simpan", async () => {
      await POST(req({ ...dasar }));
      await POST(req({ ...dasar, lampiran_url: "__HAPUS__" }));
      await POST(req({ ...dasar, lampiran_url: URL_OK }));
      expect(h.rpcCalls.map((c) => c.args.p_lampiran)).toEqual([null, "", URL_OK]);
    });

    it.each([
      ["domain lain", "https://evil.example.com/x.jpg"],
      ["domain yang hanya memuat teks cloudinary.com", `https://evilcloudinary.com/${CLOUD}/image/upload/x.jpg`],
      ["subdomain Cloudinary lain", `https://x.res.cloudinary.com/${CLOUD}/image/upload/x.jpg`],
      ["kredensial pada host asli", `https://user:pw@res.cloudinary.com/${CLOUD}/image/upload/x.jpg`],
      ["akun Cloudinary lain", "https://res.cloudinary.com/akun-lain/image/upload/x.jpg"],
      ["bukan HTTPS", `http://res.cloudinary.com/${CLOUD}/image/upload/x.jpg`],
      ["bukan URL", "bukan url"],
    ])("URL tidak valid ditolak dengan 400 (tidak diam-diam jadi 'tidak diubah'): %s", async (_nama, url) => {
      const res = await POST(req({ ...dasar, lampiran_url: url }));
      const body = await res.json();
      expect(res.status).toBe(400);
      expect(body.status).toBe("error");
      expect(body.message).toMatch(/URL lampiran tidak valid/);
      expect(h.rpcCalls).toHaveLength(0);
    });

    it("konfigurasi NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME kosong -> 500 gagal tertutup untuk URL, tanpa penulisan", async () => {
      vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "");
      const res = await POST(req({ ...dasar, lampiran_url: URL_OK }));
      expect(res.status).toBe(500);
      expect((await res.json()).status).toBe("error");
      expect(h.rpcCalls).toHaveLength(0);
    });

    it("tanpa konfigurasi Cloudinary, edit tanpa mengubah lampiran dan penghapusan lampiran tetap jalan", async () => {
      vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "");
      expect((await POST(req(dasar))).status).toBe(200);
      expect((await POST(req({ ...dasar, lampiran_url: "__HAPUS__" }))).status).toBe(200);
      expect(h.rpcCalls.map((c) => c.args.p_lampiran)).toEqual([null, ""]);
    });
  });

  // ── Ketentuan 2: EM001 -> 422 ───────────────────────────────────────────
  describe("siswa tanpa riwayat_kelas pada tapel hasil penentuan (EM001)", () => {
    const pesanDb =
      "Siswa Budi tidak memiliki riwayat kelas pada tapel 2025/2026 (periode untuk tanggal 12-03-2026, ditentukan dari kalender). " +
      "Absensi baru tidak dibuat karena tidak akan muncul di Rekap. Tidak ada perubahan yang disimpan.";

    it("EM001 -> HTTP 422 dengan penyebab yang jelas, bukan error umum", async () => {
      h.rpcResult = { data: null, error: { code: "EM001", message: pesanDb, hint: "Periksa riwayat kelas siswa pada tapel tersebut." } };
      const res = await POST(req(dasar));
      const body = await res.json();
      expect(res.status).toBe(422);
      expect(body).toMatchObject({ status: "error", kode: "riwayat_kelas_kosong", message: pesanDb, saran: "Periksa riwayat kelas siswa pada tapel tersebut." });
      expect(body.message).not.toMatch(/^Gagal DB/);
    });

    it("EM001 tanpa hint tetap 422 (tanpa field saran)", async () => {
      h.rpcResult = { data: null, error: { code: "EM001", message: pesanDb } };
      const res = await POST(req(dasar));
      expect(res.status).toBe(422);
      expect(await res.json()).not.toHaveProperty("saran");
    });

    it("EM001 tanpa pesan memakai pesan cadangan yang jelas", async () => {
      h.rpcResult = { data: null, error: { code: "EM001", message: "" } };
      const res = await POST(req(dasar));
      expect(res.status).toBe(422);
      expect((await res.json()).message).toMatch(/riwayat kelas/i);
    });

    it("hanya kode EM001 yang menjadi 422; galat database lain tetap 500", async () => {
      for (const code of ["P0001", "23505", "42501", undefined]) {
        h.rpcResult = { data: null, error: { code, message: "boom" } };
        const res = await POST(req(dasar));
        expect(res.status).toBe(500);
        expect((await res.json()).status).toBe("error");
      }
    });
  });

  it("kegagalan database dilaporkan sebagai error 500, bukan berhasil", async () => {
    h.rpcResult = { data: null, error: { message: "boom" } };
    const res = await POST(req(dasar));
    expect(res.status).toBe(500);
    expect((await res.json()).status).toBe("error");
  });

  // ── Galat database tidak membocorkan detail internal ────────────────────
  describe("galat database", () => {
    it("browser hanya menerima pesan umum; detail masuk log server", async () => {
      const rahasia = 'permission denied for table absensi_edit_manual (host db.internal:5432, role service_role)';
      h.rpcResult = { data: null, error: { code: "42501", message: rahasia, hint: "grant ke service_role" } };
      const res = await POST(req(dasar));
      const teks = JSON.stringify(await res.json());
      expect(res.status).toBe(500);
      expect(teks).not.toMatch(/permission denied|absensi_edit_manual|db\.internal|service_role|42501|Gagal DB/);
      expect(teks).toMatch(/Gagal menyimpan perubahan/);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining("edit_manual_absensi"), expect.objectContaining({ code: "42501", message: rahasia }));
    });
  });

  // ── Hasil RPC harus utuh ────────────────────────────────────────────────
  describe("validasi hasil RPC", () => {
    const rentang = { ...dasar, tanggal: "2026-10-16", tanggal_sampai: "2026-10-17" }; // 2 tanggal diproses

    it.each([
      ["null", null],
      ["array kosong", []],
      ["bukan array", { o_tanggal: "2026-10-16", o_diubah: true }],
      ["kurang satu tanggal", [{ o_tanggal: "2026-10-16", o_diubah: true }]],
      ["tanggal ganda", [{ o_tanggal: "2026-10-16", o_diubah: true }, { o_tanggal: "2026-10-16", o_diubah: true }]],
      ["tanggal berbeda dari yang dikirim", [{ o_tanggal: "2026-10-16", o_diubah: true }, { o_tanggal: "2026-11-01", o_diubah: true }]],
      ["kelebihan baris", [{ o_tanggal: "2026-10-16", o_diubah: true }, { o_tanggal: "2026-10-17", o_diubah: true }, { o_tanggal: "2026-10-19", o_diubah: true }]],
      ["o_diubah tidak boolean", [{ o_tanggal: "2026-10-16", o_diubah: "ya" }, { o_tanggal: "2026-10-17", o_diubah: true }]],
    ])("RPC sukses tapi hasil %s -> 500, BUKAN ok", async (_n, data) => {
      h.rpcResult = { data, error: null };
      const res = await POST(req(rentang));
      const body = await res.json();
      expect(res.status).toBe(500);
      expect(body.status).toBe("error");
      expect(body).not.toHaveProperty("diproses");
      expect(body.message).toMatch(/Muat ulang Rekap/);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining("tidak sesuai"), expect.any(String));
    });

    it("hasil utuh (urutan bebas) tetap diterima", async () => {
      h.rpcResult = { data: [{ o_tanggal: "2026-10-17", o_diubah: false }, { o_tanggal: "2026-10-16", o_diubah: true }], error: null };
      const body = await (await POST(req(rentang))).json();
      expect(body).toMatchObject({ status: "ok", diproses: 2, diubah: 1 });
    });

    it("satu tanggal: null/kosong juga ditolak", async () => {
      for (const data of [null, []]) {
        h.rpcResult = { data, error: null };
        expect((await POST(req(dasar))).status).toBe(500);
      }
    });
  });

  // ── siswa_id ketat ──────────────────────────────────────────────────────
  describe("validasi siswa_id", () => {
    it.each(["1abc", "abc", "", "0", "01", "-1", "+1", "1.5", "1e3", " 1", "1 ", "9007199254740993", "1;drop"])(
      "siswa_id %j ditolak sebelum menyentuh database",
      async (v) => {
        const body = await (await POST(req({ ...dasar, siswa_id: v }))).json();
        expect(body.status).toBe("error");
        expect(h.siswaQueries).toBe(0);
        expect(h.liburQueries).toBe(0);
        expect(h.rpcCalls).toHaveLength(0);
      }
    );

    it("siswa_id yang tidak dikirim sama sekali ditolak", async () => {
      const { siswa_id: _abaikan, ...tanpa } = dasar;
      void _abaikan;
      expect((await (await POST(req(tanpa))).json()).status).toBe("error");
      expect(h.rpcCalls).toHaveLength(0);
    });

    it("siswa_id yang valid dicari sebagai angka di tabel siswa dan dikirim ke RPC sebagai angka yang sama", async () => {
      h.siswa = { id: 123, name: "Sari", class: "5", status: "aktif" }; // siswa yang diminta benar-benar ada
      const res = await POST(req({ ...dasar, siswa_id: "123" }));
      expect((await res.json()).status).toBe("ok");
      expect(h.siswaDiminta).toEqual([123]);
      expect(h.rpcCalls).toHaveLength(1);
      expect(h.rpcCalls[0].args.p_siswa_id).toBe(123);
    });

    it("siswa_id valid tetapi siswanya tidak ada -> ditolak, tidak ada query libur atau RPC", async () => {
      // h.siswa bawaan ber-id 1; yang diminta 123 -> tidak ditemukan
      const res = await POST(req({ ...dasar, siswa_id: "123" }));
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(h.siswaDiminta).toEqual([123]);
      expect(h.liburQueries).toBe(0);
      expect(h.rpcCalls).toHaveLength(0);
    });
  });
});
