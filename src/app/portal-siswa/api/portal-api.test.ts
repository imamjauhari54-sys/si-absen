import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { konteksBaru, resetKonteks, kolomDipilih } from "@/lib/api/tiruan.testutil";

const h = vi.hoisted(() => ({
  sesi: null as null | { siswaId: number; nama: string; kelas: string; nisn: string },
  ctx: null as unknown as ReturnType<typeof import("@/lib/api/tiruan.testutil").konteksBaru>,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: () => undefined }));
vi.mock("@/lib/auth/student-session", () => ({ getStudentSession: async () => h.sesi }));
vi.mock("@/lib/supabase/server", async () => {
  const u = await import("@/lib/api/tiruan.testutil");
  h.ctx = u.konteksBaru();
  return { supabaseAdmin: u.buatTiruan(h.ctx) };
});

import { NextRequest } from "next/server";
import { GET as pengajuanGET, POST as pengajuanPOST } from "./pengajuan/route";
import { POST as batalPOST } from "./pengajuan/[id]/batal/route";
import { POST as pinPOST } from "./pin/route";
import { POST as signaturePOST } from "./lampiran/signature/route";

const CLOUD = "demo-cloud";
const URL_OK = `https://res.cloudinary.com/${CLOUD}/image/upload/v1700000000/si-absen/pengajuan/surat.jpg`;
const SISWA = { siswaId: 42, nama: "Budi", kelas: "5", nisn: "0012345678" };
const PIN_BENAR = "483920";

function post(url: string, body: unknown, tipe = "application/json") {
  return new NextRequest(`http://localhost${url}`, { method: "POST", headers: { "content-type": tipe }, body: typeof body === "string" ? body : JSON.stringify(body) });
}
const ajukanBody = { jenis: "izin", tanggal_dari: "2026-11-16", alasan: "Acara keluarga", pin: PIN_BENAR };
const idParams = (id: string) => ({ params: Promise.resolve({ id }) });
const pinOk = () => ({ data: { ok: true }, error: null });
const panggilan = (nama: string) => h.ctx.rpcCalls.filter((c) => c.name === nama);

beforeEach(() => {
  resetKonteks(h.ctx);
  h.sesi = SISWA;
  vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", CLOUD);
  vi.stubEnv("CLOUDINARY_CLOUD_NAME", CLOUD);
  vi.stubEnv("CLOUDINARY_API_KEY", "key123");
  vi.stubEnv("CLOUDINARY_API_SECRET", "rahasia");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("tanpa sesi siswa -> 401 dan tidak menyentuh database", () => {
  it.each([
    ["GET pengajuan", () => pengajuanGET()],
    ["POST pengajuan", () => pengajuanPOST(post("/x", ajukanBody))],
    ["POST batal", () => batalPOST(post("/x", { pin: PIN_BENAR }), idParams("1"))],
    ["POST pin", () => pinPOST(post("/x", { pin_lama: PIN_BENAR, pin_baru: "715204" }))],
    ["POST signature", () => signaturePOST(post("/x", { pin: PIN_BENAR }))],
  ])("%s", async (_n, panggil) => {
    h.sesi = null;
    expect((await panggil()).status).toBe(401);
    expect(h.ctx.rpcCalls).toHaveLength(0);
    expect(h.ctx.query).toHaveLength(0);
  });
});

describe("GET /portal-siswa/api/pengajuan", () => {
  it("mengembalikan riwayat, status PIN, dan aturan; filter selalu memakai siswa dari sesi", async () => {
    h.ctx.tabel.pengajuan_izin = {
      error: null,
      data: [{
        id: 7, siswa_id: 42, jenis: "sakit", tanggal_dari: "2026-11-09", tanggal_sampai: "2026-11-10",
        alasan: "Demam tinggi, diperiksa dokter", lampiran: "https://res.cloudinary.com/x/y.jpg", status: "menunggu",
        diajukan_pada: "2026-11-09T01:00:00Z", diputuskan_nama: null, diputuskan_pada: null, catatan_keputusan: null,
        pengajuan_izin_hari: [{ tanggal: "2026-11-10", disetujui: null, aktif: true, hasil: null }, { tanggal: "2026-11-09", disetujui: null, aktif: true, hasil: null }],
      }],
    };
    h.ctx.tabel.kunci_ortu = { error: null, data: [{ terkunci_sampai: null }] };
    const res = await pengajuanGET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(json.pin).toEqual({ diatur: true, terkunciSampai: null });
    expect(json.aturan.maksHariSakit).toBe(14);
    expect(json.pengajuan[0].hari.map((x: { tanggal: string }) => x.tanggal)).toEqual(["2026-11-09", "2026-11-10"]);
    const q = h.ctx.query.find((x) => x.tabel === "pengajuan_izin")!;
    expect(q.ops).toContainEqual(["eq", ["siswa_id", 42]]);
  });

  it("TIDAK membocorkan alasan atau URL lampiran (login hanya NISN)", async () => {
    h.ctx.tabel.pengajuan_izin = {
      error: null,
      data: [{ id: 7, siswa_id: 42, jenis: "sakit", tanggal_dari: "2026-11-09", tanggal_sampai: "2026-11-09", alasan: "Demam tinggi",
        lampiran: "https://res.cloudinary.com/x/surat-dokter.jpg", status: "menunggu", diajukan_pada: "2026-11-09T01:00:00Z", pengajuan_izin_hari: [] }],
    };
    const teks = JSON.stringify(await (await pengajuanGET()).json());
    expect(teks).not.toContain("Demam tinggi");
    expect(teks).not.toContain("surat-dokter");
    expect(teks).toContain('"adaLampiran":true');
  });

  it("PIN belum dibuat -> diatur false; kunci yang sudah lewat tidak dilaporkan", async () => {
    h.ctx.tabel.pengajuan_izin = { error: null, data: [] };
    h.ctx.tabel.kunci_ortu = { error: null, data: [] };
    expect((await (await pengajuanGET()).json()).pin).toEqual({ diatur: false, terkunciSampai: null });
    h.ctx.tabel.kunci_ortu = { error: null, data: [{ terkunci_sampai: "2020-01-01T00:00:00Z" }] };
    expect((await (await pengajuanGET()).json()).pin).toEqual({ diatur: true, terkunciSampai: null });
  });

  it("hash PIN tidak pernah dipilih dari database", async () => {
    h.ctx.tabel.pengajuan_izin = { error: null, data: [] };
    h.ctx.tabel.kunci_ortu = { error: null, data: [] };
    await pengajuanGET();
    for (const kolom of kolomDipilih(h.ctx, "kunci_ortu")) expect(kolom).not.toContain("pin_hash");
  });

  it("galat database -> 500 generik tanpa membocorkan pesan; migrasi belum ada -> 503", async () => {
    h.ctx.tabel.pengajuan_izin = { data: null, error: { message: 'relation "pengajuan_izin" rahasia', code: "XX000" } };
    h.ctx.tabel.kunci_ortu = { error: null, data: [] };
    let res = await pengajuanGET();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("rahasia");
    h.ctx.tabel.pengajuan_izin = { data: null, error: { message: "tidak ada", code: "42P01" } };
    res = await pengajuanGET();
    expect(res.status).toBe(503);
  });
});

describe("POST /portal-siswa/api/pengajuan", () => {
  it("jalur sukses: PIN diperiksa DULU, lalu ajukan memakai siswa dari sesi", async () => {
    h.ctx.rpc.verifikasi_pin_ortu = pinOk;
    h.ctx.rpc.ajukan_pengajuan_izin = () => ({ data: { id: 9, jenis: "izin", hari_sekolah: ["2026-11-16"] }, error: null });
    const res = await pengajuanPOST(post("/x", { ...ajukanBody, siswa_id: 999 }));
    expect(res.status).toBe(201);
    expect((await res.json()).pengajuan.id).toBe(9);
    expect(h.ctx.rpcCalls.map((c) => c.name)).toEqual(["verifikasi_pin_ortu", "ajukan_pengajuan_izin"]);
    expect(h.ctx.rpcCalls[0].args).toEqual({ p_siswa_id: 42, p_pin: PIN_BENAR });
    expect(h.ctx.rpcCalls[1].args).toEqual({
      p_siswa_id: 42, p_jenis: "izin", p_dari: "2026-11-16", p_sampai: "2026-11-16", p_alasan: "Acara keluarga", p_lampiran: null,
    });
  });

  it("lampiran valid diteruskan", async () => {
    h.ctx.rpc.verifikasi_pin_ortu = pinOk;
    h.ctx.rpc.ajukan_pengajuan_izin = () => ({ data: { id: 1 }, error: null });
    await pengajuanPOST(post("/x", { ...ajukanBody, jenis: "sakit", tanggal_sampai: "2026-11-18", lampiran_url: URL_OK }));
    expect(panggilan("ajukan_pengajuan_izin")[0].args).toMatchObject({ p_jenis: "sakit", p_sampai: "2026-11-18", p_lampiran: URL_OK });
  });

  it("PIN salah -> 403 + sisa percobaan, dan ajukan TIDAK dipanggil", async () => {
    h.ctx.rpc.verifikasi_pin_ortu = () => ({ data: { ok: false, kode: "PIN_SALAH", sisa_percobaan: 4 }, error: null });
    const res = await pengajuanPOST(post("/x", ajukanBody));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ status: "error", kode: "PIN_SALAH", sisa_percobaan: 4 });
    expect(panggilan("ajukan_pengajuan_izin")).toHaveLength(0);
  });

  it("terkunci -> 429 dengan Retry-After", async () => {
    h.ctx.rpc.verifikasi_pin_ortu = () => ({ data: { ok: false, kode: "TERKUNCI", terkunci_sampai: new Date(Date.now() + 600_000).toISOString() }, error: null });
    const res = await pengajuanPOST(post("/x", ajukanBody));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(panggilan("ajukan_pengajuan_izin")).toHaveLength(0);
  });

  it("PIN belum diatur -> 409 dan tidak ada pengajuan dibuat", async () => {
    h.ctx.rpc.verifikasi_pin_ortu = () => ({ data: { ok: false, kode: "PIN_BELUM_DIATUR" }, error: null });
    const res = await pengajuanPOST(post("/x", ajukanBody));
    expect(res.status).toBe(409);
    expect(panggilan("ajukan_pengajuan_izin")).toHaveLength(0);
  });

  it("input salah bentuk ditolak SEBELUM menyentuh PIN (tidak membakar percobaan)", async () => {
    for (const body of [{ ...ajukanBody, jenis: "cuti" }, { ...ajukanBody, tanggal_dari: "2026-02-31" }, { ...ajukanBody, pin: "12" }, { ...ajukanBody, lampiran_url: "https://evil.example/x.jpg" }]) {
      expect((await pengajuanPOST(post("/x", body))).status).toBe(400);
    }
    expect(h.ctx.rpcCalls).toHaveLength(0);
  });

  it("bukan JSON / Content-Type salah -> 400 tanpa panggilan database", async () => {
    expect((await pengajuanPOST(post("/x", "jenis=izin", "application/x-www-form-urlencoded"))).status).toBe(400);
    expect((await pengajuanPOST(post("/x", "{rusak"))).status).toBe(400);
    expect(h.ctx.rpcCalls).toHaveLength(0);
  });

  it("aturan bisnis SQL (P0001) diteruskan sebagai 422 dengan pesannya", async () => {
    h.ctx.rpc.verifikasi_pin_ortu = pinOk;
    h.ctx.rpc.ajukan_pengajuan_izin = () => ({ data: null, error: { code: "P0001", message: "Alasan minimal 5 karakter." } });
    const res = await pengajuanPOST(post("/x", { ...ajukanBody, alasan: "x" }));
    expect(res.status).toBe(422);
    expect((await res.json()).message).toBe("Alasan minimal 5 karakter.");
  });

  it("dua pengajuan bersamaan yang berebut tanggal: kalah -> 409 yang jelas", async () => {
    h.ctx.rpc.verifikasi_pin_ortu = pinOk;
    h.ctx.rpc.ajukan_pengajuan_izin = () => ({ data: null, error: { code: "23505", message: "duplicate key uq_pengajuan_hari_aktif" } });
    const res = await pengajuanPOST(post("/x", ajukanBody));
    expect(res.status).toBe(409);
    expect(JSON.stringify(await res.json())).not.toContain("uq_pengajuan_hari_aktif");
  });

  it("galat tak terduga dari verifikasi PIN gagal tertutup (tidak lanjut mengajukan)", async () => {
    h.ctx.rpc.verifikasi_pin_ortu = () => ({ data: null, error: { code: "XX000", message: "boom" } });
    const res = await pengajuanPOST(post("/x", ajukanBody));
    expect(res.status).toBe(500);
    expect(panggilan("ajukan_pengajuan_izin")).toHaveLength(0);
  });

  it("hasil verifikasi yang janggal tidak pernah dianggap PIN benar", async () => {
    for (const data of [null, {}, { ok: "true" }, { ok: false }]) {
      h.ctx.rpc.verifikasi_pin_ortu = () => ({ data, error: null });
      expect((await pengajuanPOST(post("/x", ajukanBody))).status).toBeGreaterThanOrEqual(400);
    }
    expect(panggilan("ajukan_pengajuan_izin")).toHaveLength(0);
  });

  it("PIN tidak muncul di log server saat galat", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    h.ctx.rpc.verifikasi_pin_ortu = pinOk;
    h.ctx.rpc.ajukan_pengajuan_izin = () => ({ data: null, error: { code: "XX000", message: "boom" } });
    await pengajuanPOST(post("/x", ajukanBody));
    expect(JSON.stringify(spy.mock.calls)).not.toContain(PIN_BENAR);
  });
});

describe("POST /portal-siswa/api/pengajuan/[id]/batal", () => {
  it("jalur sukses: PIN dulu, lalu batalkan dengan siswa dari sesi", async () => {
    h.ctx.rpc.verifikasi_pin_ortu = pinOk;
    h.ctx.rpc.batalkan_pengajuan_izin = () => ({ data: { status: "dibatalkan", hari_alpha: 0 }, error: null });
    const res = await batalPOST(post("/x", { pin: PIN_BENAR }), idParams("7"));
    expect(res.status).toBe(200);
    expect(h.ctx.rpcCalls.map((c) => c.name)).toEqual(["verifikasi_pin_ortu", "batalkan_pengajuan_izin"]);
    expect(panggilan("batalkan_pengajuan_izin")[0].args).toEqual({ p_id: 7, p_siswa_id: 42 });
  });
  it("id tidak sah -> 404 tanpa menyentuh database", async () => {
    for (const id of ["abc", "0", "-1", "1.5", "1abc", "007"]) expect((await batalPOST(post("/x", { pin: PIN_BENAR }), idParams(id))).status).toBe(404);
    expect(h.ctx.rpcCalls).toHaveLength(0);
  });
  it("PIN salah -> batalkan tidak dipanggil", async () => {
    h.ctx.rpc.verifikasi_pin_ortu = () => ({ data: { ok: false, kode: "PIN_SALAH", sisa_percobaan: 2 }, error: null });
    expect((await batalPOST(post("/x", { pin: PIN_BENAR }), idParams("7"))).status).toBe(403);
    expect(panggilan("batalkan_pengajuan_izin")).toHaveLength(0);
  });
  it("pengajuan milik siswa lain (SQL: tidak ditemukan) -> 404", async () => {
    h.ctx.rpc.verifikasi_pin_ortu = pinOk;
    h.ctx.rpc.batalkan_pengajuan_izin = () => ({ data: null, error: { code: "P0001", message: "Pengajuan tidak ditemukan." } });
    expect((await batalPOST(post("/x", { pin: PIN_BENAR }), idParams("7"))).status).toBe(404);
  });
  it("sudah diputuskan -> 422 dengan pesan SQL", async () => {
    h.ctx.rpc.verifikasi_pin_ortu = pinOk;
    h.ctx.rpc.batalkan_pengajuan_izin = () => ({ data: null, error: { code: "P0001", message: "Pengajuan sudah diputuskan, tidak dapat dibatalkan." } });
    const res = await batalPOST(post("/x", { pin: PIN_BENAR }), idParams("7"));
    expect(res.status).toBe(422);
  });
  it("PIN tanpa format benar -> 400", async () => {
    expect((await batalPOST(post("/x", {}), idParams("7"))).status).toBe(400);
    expect(h.ctx.rpcCalls).toHaveLength(0);
  });
});

describe("POST /portal-siswa/api/pin (ganti PIN)", () => {
  it("sukses: atur_pin_ortu TANPA paksa dan dengan PIN lama", async () => {
    h.ctx.rpc.atur_pin_ortu = () => ({ data: { ok: true }, error: null });
    const res = await pinPOST(post("/x", { pin_lama: PIN_BENAR, pin_baru: "715204" }));
    expect(res.status).toBe(200);
    expect(panggilan("atur_pin_ortu")[0].args).toEqual({ p_siswa_id: 42, p_pin_baru: "715204", p_pin_lama: PIN_BENAR, p_paksa: false });
  });
  it("klien tidak bisa memaksa p_paksa (abaikan field asing)", async () => {
    h.ctx.rpc.atur_pin_ortu = () => ({ data: { ok: true }, error: null });
    await pinPOST(post("/x", { pin_lama: PIN_BENAR, pin_baru: "715204", paksa: true, p_paksa: true, siswa_id: 1 }));
    expect(panggilan("atur_pin_ortu")[0].args).toMatchObject({ p_siswa_id: 42, p_paksa: false });
  });
  it("PIN lama salah -> 403; terkunci -> 429; terlalu mudah -> 422", async () => {
    h.ctx.rpc.atur_pin_ortu = () => ({ data: { ok: false, kode: "PIN_SALAH", sisa_percobaan: 1 }, error: null });
    expect((await pinPOST(post("/x", { pin_lama: PIN_BENAR, pin_baru: "715204" }))).status).toBe(403);
    h.ctx.rpc.atur_pin_ortu = () => ({ data: { ok: false, kode: "TERKUNCI", menit: 15 }, error: null });
    expect((await pinPOST(post("/x", { pin_lama: PIN_BENAR, pin_baru: "715204" }))).status).toBe(429);
    h.ctx.rpc.atur_pin_ortu = () => ({ data: { ok: false, kode: "PIN_TERLALU_MUDAH" }, error: null });
    expect((await pinPOST(post("/x", { pin_lama: PIN_BENAR, pin_baru: "111111" }))).status).toBe(422);
  });
  it("PIN sama / format salah ditolak sebelum database", async () => {
    expect((await pinPOST(post("/x", { pin_lama: PIN_BENAR, pin_baru: PIN_BENAR }))).status).toBe(422);
    expect((await pinPOST(post("/x", { pin_lama: PIN_BENAR, pin_baru: "12" }))).status).toBe(400);
    expect(h.ctx.rpcCalls).toHaveLength(0);
  });
  it("hasil janggal dari database tidak dianggap sukses", async () => {
    h.ctx.rpc.atur_pin_ortu = () => ({ data: null, error: null });
    expect((await pinPOST(post("/x", { pin_lama: PIN_BENAR, pin_baru: "715204" }))).status).toBe(500);
  });
});

describe("POST /portal-siswa/api/lampiran/signature", () => {
  it("PIN benar -> tanda tangan sah untuk folder pengajuan + format gambar", async () => {
    h.ctx.rpc.verifikasi_pin_ortu = pinOk;
    const res = await signaturePOST(post("/x", { pin: PIN_BENAR }));
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j).toMatchObject({ apiKey: "key123", cloudName: CLOUD, folder: "si-absen/pengajuan", allowedFormats: "jpg,jpeg,png,webp" });
    const crypto = await import("crypto");
    const harapan = crypto.createHash("sha1").update(`allowed_formats=jpg,jpeg,png,webp&folder=si-absen/pengajuan&timestamp=${j.timestamp}rahasia`).digest("hex");
    expect(j.signature).toBe(harapan);
    expect(JSON.stringify(j)).not.toContain("rahasia");
  });
  it("PIN salah -> tidak ada tanda tangan", async () => {
    h.ctx.rpc.verifikasi_pin_ortu = () => ({ data: { ok: false, kode: "PIN_SALAH", sisa_percobaan: 4 }, error: null });
    const res = await signaturePOST(post("/x", { pin: PIN_BENAR }));
    expect(res.status).toBe(403);
    expect(JSON.stringify(await res.json())).not.toContain("signature");
  });
  it("Cloudinary belum dikonfigurasi -> 500 dan PIN tidak dibakar", async () => {
    vi.stubEnv("CLOUDINARY_API_SECRET", "");
    expect((await signaturePOST(post("/x", { pin: PIN_BENAR }))).status).toBe(500);
    expect(h.ctx.rpcCalls).toHaveLength(0);
  });
});
