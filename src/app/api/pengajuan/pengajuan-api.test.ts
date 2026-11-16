import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { konteksBaru, resetKonteks, kolomDipilih } from "@/lib/api/tiruan.testutil";

type Sesi = { userId: number; username: string; role: string; kelas: string; nama: string; foto: null };

const h = vi.hoisted(() => ({
  session: null as null | { userId: number; username: string; role: string; kelas: string; nama: string },
  kelasWali: null as string | null,
  ctx: null as unknown as ReturnType<typeof import("@/lib/api/tiruan.testutil").konteksBaru>,
  log: [] as unknown[][],
  after: [] as Array<() => unknown>,
  notif: [] as number[],
  segar: 0,
}));

vi.mock("server-only", () => ({}));
// after() hanya bisa jalan dalam lingkup permintaan sungguhan: di uji ditangkap lalu dijalankan manual.
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => { h.after.push(fn); } }));
vi.mock("@/lib/wa/notifikasi", () => ({ kirimNotifKeputusan: async (id: number) => { h.notif.push(id); } }));
vi.mock("@/lib/data/penanda-pengajuan", () => ({ segarkanPenandaPengajuan: () => { h.segar++; } }));
vi.mock("next/navigation", () => ({ redirect: () => undefined }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => h.session }));
vi.mock("@/lib/data/wali-kelas", () => ({ getKelasWali: async () => h.kelasWali }));
vi.mock("@/lib/data/log-aktivitas", () => ({ catatLog: async (...a: unknown[]) => { h.log.push(a); } }));
vi.mock("@/lib/utils/tanggal", async (orig) => ({ ...(await orig<typeof import("@/lib/utils/tanggal")>()), todayJakarta: () => "2026-11-13" }));
vi.mock("@/lib/supabase/server", async () => {
  const u = await import("@/lib/api/tiruan.testutil");
  h.ctx = u.konteksBaru();
  return { supabaseAdmin: u.buatTiruan(h.ctx) };
});

import { NextRequest } from "next/server";
import { GET as daftarGET } from "./route";
import { GET as detailGET } from "./[id]/route";
import { POST as putuskanPOST } from "./[id]/putuskan/route";
import { GET as pinGET, POST as pinPOST } from "../pin-ortu/route";

const ADMIN: Sesi = { userId: 1, username: "admin", role: "admin", kelas: "", nama: "Imam (Admin)", foto: null };
const GURU5: Sesi = { userId: 7, username: "guru5", role: "guru", kelas: "5", nama: "Bu Sri", foto: null };

const idParams = (id: string) => ({ params: Promise.resolve({ id }) });
const get = (url: string) => new NextRequest(`http://localhost${url}`);
const post = (url: string, body: unknown, tipe = "application/json") =>
  new NextRequest(`http://localhost${url}`, { method: "POST", headers: { "content-type": tipe }, body: typeof body === "string" ? body : JSON.stringify(body) });
const panggilan = (n: string) => h.ctx.rpcCalls.filter((c) => c.name === n);

function barisPengajuan(patch: Record<string, unknown> = {}) {
  return {
    id: 7, siswa_id: 1, jenis: "sakit", tanggal_dari: "2026-11-10", tanggal_sampai: "2026-11-16", alasan: "Demam", lampiran: null,
    status: "menunggu", diajukan_pada: "2026-11-10T01:00:00Z", diputuskan_nama: null, diputuskan_pada: null, catatan_keputusan: null,
    students: { id: 1, name: "Budi", class: "5", nisn: "001" },
    pengajuan_izin_hari: [
      { tanggal: "2026-11-16", disetujui: null, aktif: true, hasil: null },
      { tanggal: "2026-11-10", disetujui: null, aktif: true, hasil: null },
      { tanggal: "2026-11-13", disetujui: null, aktif: true, hasil: null },
    ],
    ...patch,
  };
}
/** Siswa 1 kelas 5 (ada), dipakai assertBolehAksesSiswa. */
function siswaAda(kelas = "5") {
  h.ctx.tabel.students = { error: null, data: [{ id: 1, name: "Budi", class: kelas, status: "aktif" }] };
}

beforeEach(() => {
  resetKonteks(h.ctx);
  h.log = [];
  h.after = [];
  h.notif = [];
  h.segar = 0;
  h.session = ADMIN;
  h.kelasWali = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("otorisasi dasar", () => {
  it.each([
    ["GET daftar", () => daftarGET(get("/api/pengajuan"))],
    ["GET detail", () => detailGET(get("/api/pengajuan/7"), idParams("7"))],
    ["POST putuskan", () => putuskanPOST(post("/x", { keputusan: "tolak" }), idParams("7"))],
    ["GET pin", () => pinGET(get("/api/pin-ortu?kelas=5"))],
    ["POST pin", () => pinPOST(post("/x", { action: "buat", siswa_ids: [1] }))],
  ])("%s: tanpa sesi -> 403 dan database tidak disentuh", async (_n, panggil) => {
    h.session = null;
    expect((await panggil()).status).toBe(403);
    expect(h.ctx.rpcCalls).toHaveLength(0);
    expect(h.ctx.query).toHaveLength(0);
  });
  it("peran asing (bukan admin/guru) ditolak", async () => {
    h.session = { ...ADMIN, role: "siswa" };
    expect((await daftarGET(get("/api/pengajuan"))).status).toBe(403);
    expect((await putuskanPOST(post("/x", { keputusan: "tolak" }), idParams("7"))).status).toBe(403);
  });
});

describe("GET /api/pengajuan (daftar)", () => {
  it("admin: semua kelas, filter kelas opsional, bawaan hanya Menunggu", async () => {
    h.ctx.tabel.pengajuan_izin = { error: null, data: [barisPengajuan()], count: 1 };
    const res = await daftarGET(get("/api/pengajuan"));
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j).toMatchObject({ total: 1, halaman: 1, perHalaman: 20, totalHalaman: 1 });
    expect(j.pengajuan[0]).toMatchObject({ alasan: "Demam", siswa: { name: "Budi", class: "5" } });
    // hari terurut naik walau dari database tidak berurutan
    expect(j.pengajuan[0].hari.map((x: { tanggal: string }) => x.tanggal)).toEqual(["2026-11-10", "2026-11-13", "2026-11-16"]);
    const ops = h.ctx.query[0].ops;
    expect(ops).toContainEqual(["eq", ["status", "menunggu"]]);
    expect(ops.some(([m, a]) => m === "eq" && a[0] === "students.class")).toBe(false);
  });
  it("admin memfilter kelas dan status semua", async () => {
    h.ctx.tabel.pengajuan_izin = { error: null, data: [], count: 0 };
    await daftarGET(get("/api/pengajuan?kelas=6&status=semua&page=3"));
    const ops = h.ctx.query[0].ops;
    expect(ops).toContainEqual(["eq", ["students.class", "6"]]);
    expect(ops.some(([m, a]) => m === "eq" && a[0] === "status")).toBe(false);
    expect(ops).toContainEqual(["range", [40, 59]]);
  });
  it("guru: kelas SELALU dari database; parameter kelas dari klien diabaikan", async () => {
    h.session = GURU5;
    h.kelasWali = "5";
    h.ctx.tabel.pengajuan_izin = { error: null, data: [], count: 0 };
    await daftarGET(get("/api/pengajuan?kelas=6&status=semua"));
    expect(h.ctx.query[0].ops).toContainEqual(["eq", ["students.class", "5"]]);
    expect(h.ctx.query[0].ops).not.toContainEqual(["eq", ["students.class", "6"]]);
  });
  it("guru yang BUKAN wali kelas -> 403 (tidak pernah jatuh ke semua kelas)", async () => {
    h.session = GURU5;
    h.kelasWali = null;
    expect((await daftarGET(get("/api/pengajuan"))).status).toBe(403);
    expect(h.ctx.query).toHaveLength(0);
  });
  it("halaman buruk jatuh ke 1; galat database -> 500 generik", async () => {
    h.ctx.tabel.pengajuan_izin = { error: null, data: [], count: 0 };
    await daftarGET(get("/api/pengajuan?page=-5"));
    expect(h.ctx.query[0].ops).toContainEqual(["range", [0, 19]]);
    h.ctx.tabel.pengajuan_izin = { data: null, error: { message: "rahasia internal", code: "XX000" } };
    const res = await daftarGET(get("/api/pengajuan"));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("rahasia");
  });
});

describe("GET /api/pengajuan/[id] (detail + pratinjau)", () => {
  function siapDetail() {
    // pengajuan_izin dibaca dua kali (pemilik lalu detail); tiruan mengembalikan baris pertama untuk keduanya.
    h.ctx.tabel.pengajuan_izin = { error: null, data: [barisPengajuan()] };
    h.ctx.tabel.students = { error: null, data: [{ id: 1, name: "Budi", class: "5", status: "aktif" }] };
    h.ctx.tabel.absensi = { error: null, data: [{ tanggal: "2026-11-10", status: "hadir" }, { tanggal: "2026-11-13", status: "alpha" }] };
  }
  it("admin: detail dengan pratinjau per hari", async () => {
    siapDetail();
    const res = await detailGET(get("/x"), idParams("7"));
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.hariIni).toBe("2026-11-13");
    expect(j.pratinjau).toEqual([
      { tanggal: "2026-11-10", absensi: "hadir", jikaDisetujui: "scan_menang", jikaTidak: "tidak_berubah" },
      { tanggal: "2026-11-13", absensi: "alpha", jikaDisetujui: "ditulis", jikaTidak: "tidak_berubah" },
      { tanggal: "2026-11-16", absensi: null, jikaDisetujui: "direncanakan", jikaTidak: "tidak_berubah" },
    ]);
    expect(j.pengajuan.alasan).toBe("Demam");
  });
  it("guru kelas lain -> 403 dan detail TIDAK dibaca", async () => {
    siapDetail();
    h.session = GURU5;
    h.kelasWali = "6";
    expect((await detailGET(get("/x"), idParams("7"))).status).toBe(403);
    expect(h.ctx.query.some((q) => q.tabel === "absensi")).toBe(false);
  });
  it("guru kelasnya sendiri -> 200", async () => {
    siapDetail();
    h.session = GURU5;
    h.kelasWali = "5";
    expect((await detailGET(get("/x"), idParams("7"))).status).toBe(200);
  });
  it("tidak ada: admin 404; guru 403 (sama dengan kelas lain, anti-enumerasi)", async () => {
    h.ctx.tabel.pengajuan_izin = { error: null, data: [] };
    expect((await detailGET(get("/x"), idParams("7"))).status).toBe(404);
    h.session = GURU5;
    h.kelasWali = "5";
    expect((await detailGET(get("/x"), idParams("7"))).status).toBe(403);
  });
  it("id tidak sah -> 404 tanpa database", async () => {
    for (const id of ["abc", "0", "1abc"]) expect((await detailGET(get("/x"), idParams(id))).status).toBe(404);
    expect(h.ctx.query).toHaveLength(0);
  });
});

describe("POST /api/pengajuan/[id]/putuskan", () => {
  beforeEach(() => {
    h.ctx.tabel.pengajuan_izin = { error: null, data: [{ siswa_id: 1 }] };
    siswaAda("5");
  });
  it("setujui semua: pemutus dari sesi, p_hari null", async () => {
    h.ctx.rpc.putuskan_pengajuan_izin = () => ({ data: { status: "disetujui", disetujui: 3, ditulis: 2, hari_alpha: 0 }, error: null });
    const res = await putuskanPOST(post("/x", { keputusan: "setujui", editor_id: 999, p_editor_id: 999 }), idParams("7"));
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j).toMatchObject({ status: "ok", pengajuanId: 7, siswaId: 1, hasil: { status: "disetujui" } });
    expect(panggilan("putuskan_pengajuan_izin")[0].args).toEqual({
      p_id: 7, p_keputusan: "setujui", p_hari: null, p_catatan: null, p_editor_id: 1, p_editor_nama: "Imam (Admin)",
    });
  });
  it("persetujuan sebagian meneruskan hari terurut dan catatan", async () => {
    h.ctx.rpc.putuskan_pengajuan_izin = () => ({ data: { status: "disetujui_sebagian" }, error: null });
    await putuskanPOST(post("/x", { keputusan: "setujui", hari: ["2026-11-16", "2026-11-10"], catatan: " Surat jelas " }), idParams("7"));
    expect(panggilan("putuskan_pengajuan_izin")[0].args).toMatchObject({ p_hari: ["2026-11-10", "2026-11-16"], p_catatan: "Surat jelas" });
  });
  it("tolak", async () => {
    h.ctx.rpc.putuskan_pengajuan_izin = () => ({ data: { status: "ditolak", hari_alpha: 1 }, error: null });
    const res = await putuskanPOST(post("/x", { keputusan: "tolak", catatan: "Surat tidak terbaca" }), idParams("7"));
    expect(res.status).toBe(200);
    expect(panggilan("putuskan_pengajuan_izin")[0].args).toMatchObject({ p_keputusan: "tolak", p_hari: null, p_catatan: "Surat tidak terbaca" });
  });
  it("guru memutuskan dengan id & nama dirinya", async () => {
    h.session = GURU5;
    h.kelasWali = "5";
    h.ctx.rpc.putuskan_pengajuan_izin = () => ({ data: { status: "disetujui" }, error: null });
    await putuskanPOST(post("/x", { keputusan: "setujui" }), idParams("7"));
    expect(panggilan("putuskan_pengajuan_izin")[0].args).toMatchObject({ p_editor_id: 7, p_editor_nama: "Bu Sri" });
  });
  it("guru kelas lain -> 403 dan keputusan TIDAK dipanggil", async () => {
    h.session = GURU5;
    h.kelasWali = "6";
    expect((await putuskanPOST(post("/x", { keputusan: "setujui" }), idParams("7"))).status).toBe(403);
    expect(panggilan("putuskan_pengajuan_izin")).toHaveLength(0);
  });
  it("guru tanpa kelas wali -> 403", async () => {
    h.session = GURU5;
    h.kelasWali = null;
    expect((await putuskanPOST(post("/x", { keputusan: "setujui" }), idParams("7"))).status).toBe(403);
    expect(panggilan("putuskan_pengajuan_izin")).toHaveLength(0);
  });
  it("input tidak sah ditolak sebelum otorisasi/DB", async () => {
    for (const b of [{}, { keputusan: "mungkin" }, { keputusan: "setujui", hari: [] }, { keputusan: "tolak", hari: ["2026-11-10"] }, { keputusan: "setujui", hari: ["bukan"] }]) {
      expect((await putuskanPOST(post("/x", b), idParams("7"))).status).toBe(400);
    }
    expect((await putuskanPOST(post("/x", "keputusan=setujui", "text/plain"), idParams("7"))).status).toBe(400);
    expect(h.ctx.query).toHaveLength(0);
    expect(h.ctx.rpcCalls).toHaveLength(0);
  });
  it("sudah diputuskan orang lain (SQL) -> 422 dengan pesannya", async () => {
    h.ctx.rpc.putuskan_pengajuan_izin = () => ({ data: null, error: { code: "P0001", message: "Pengajuan sudah diputuskan." } });
    const res = await putuskanPOST(post("/x", { keputusan: "setujui" }), idParams("7"));
    expect(res.status).toBe(422);
    expect((await res.json()).message).toBe("Pengajuan sudah diputuskan.");
  });
  it("siswa tanpa riwayat kelas (EM001) -> 422 riwayat_kelas_kosong", async () => {
    h.ctx.rpc.putuskan_pengajuan_izin = () => ({ data: null, error: { code: "EM001", message: "Tidak ada riwayat kelas pada tapel." } });
    const res = await putuskanPOST(post("/x", { keputusan: "setujui" }), idParams("7"));
    expect(res.status).toBe(422);
    expect((await res.json()).kode).toBe("riwayat_kelas_kosong");
  });
  it("galat tak terduga -> 500 generik", async () => {
    h.ctx.rpc.putuskan_pengajuan_izin = () => ({ data: null, error: { code: "XX000", message: "rahasia" } });
    const res = await putuskanPOST(post("/x", { keputusan: "setujui" }), idParams("7"));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("rahasia");
  });
  it("sukses: notifikasi WA keputusan dijadwalkan di after() (bukan dijalankan sebelum respons) dan penanda menu disegarkan", async () => {
    h.ctx.rpc.putuskan_pengajuan_izin = () => ({ data: { status: "disetujui" }, error: null });
    expect((await putuskanPOST(post("/x", { keputusan: "setujui" }), idParams("7"))).status).toBe(200);
    expect(h.after).toHaveLength(1);
    expect(h.notif).toEqual([]); // belum jalan saat respons dikirim
    await h.after[0]();
    expect(h.notif).toEqual([7]); // id dari URL yang sudah lolos otorisasi, bukan dari body
    expect(h.segar).toBe(1);
  });
  it("tolak juga memberi tahu orang tua", async () => {
    h.ctx.rpc.putuskan_pengajuan_izin = () => ({ data: { status: "ditolak" }, error: null });
    await putuskanPOST(post("/x", { keputusan: "tolak" }), idParams("7"));
    await Promise.all(h.after.map((f) => f()));
    expect(h.notif).toEqual([7]);
  });
  it("GAGAL (SQL menolak, 403, input salah, galat server): tidak ada WA dan penanda tidak disegarkan", async () => {
    h.ctx.rpc.putuskan_pengajuan_izin = () => ({ data: null, error: { code: "P0001", message: "Pengajuan sudah diputuskan." } });
    await putuskanPOST(post("/x", { keputusan: "setujui" }), idParams("7"));
    h.ctx.rpc.putuskan_pengajuan_izin = () => ({ data: null, error: { code: "XX000", message: "x" } });
    await putuskanPOST(post("/x", { keputusan: "setujui" }), idParams("7"));
    await putuskanPOST(post("/x", { keputusan: "mungkin" }), idParams("7"));
    h.session = GURU5;
    h.kelasWali = "6";
    await putuskanPOST(post("/x", { keputusan: "setujui" }), idParams("7"));
    expect(h.after).toHaveLength(0);
    expect(h.segar).toBe(0);
  });
});

describe("GET /api/pin-ortu", () => {
  it("guru: kelas dari DB; hash/PIN tidak pernah dipilih; status dihitung dari baris kunci", async () => {
    h.session = GURU5;
    h.kelasWali = "5";
    h.ctx.tabel.students = { error: null, data: [{ id: 1, name: "Ani", nisn: "001" }, { id: 2, name: "Budi", nisn: "002" }, { id: 3, name: "Cici", nisn: null }] };
    h.ctx.tabel.kunci_ortu = {
      error: null,
      data: [
        { siswa_id: 1, dibagikan_pada: "2026-11-01T00:00:00Z", terkunci_sampai: null },
        { siswa_id: 2, dibagikan_pada: null, terkunci_sampai: "2099-01-01T00:00:00Z" },
      ],
    };
    const res = await pinGET(get("/api/pin-ortu?kelas=9"));
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.kelas).toBe("5");
    expect(h.ctx.query.find((q) => q.tabel === "students")!.ops).toContainEqual(["eq", ["class", "5"]]);
    expect(j.siswa).toEqual([
      { id: 1, name: "Ani", nisn: "001", pinDiatur: true, dibagikanPada: "2026-11-01T00:00:00Z", terkunciSampai: null },
      { id: 2, name: "Budi", nisn: "002", pinDiatur: true, dibagikanPada: null, terkunciSampai: "2099-01-01T00:00:00Z" },
      { id: 3, name: "Cici", nisn: null, pinDiatur: false, dibagikanPada: null, terkunciSampai: null },
    ]);
    for (const kolom of kolomDipilih(h.ctx, "kunci_ortu")) expect(kolom).not.toContain("pin_hash");
    expect(JSON.stringify(j)).not.toContain("pin_hash");
  });
  it("admin wajib memilih kelas; guru tanpa kelas ditolak", async () => {
    expect((await pinGET(get("/api/pin-ortu"))).status).toBe(400);
    h.session = GURU5;
    h.kelasWali = null;
    expect((await pinGET(get("/api/pin-ortu"))).status).toBe(403);
  });
});

describe("POST /api/pin-ortu", () => {
  const siswa = (id: number, name: string, kelas: string, status = "aktif") => ({ id, name, class: kelas, status });

  it("buat: hanya siswa yang belum punya PIN; PIN polos hanya di respons (no-store) dan TIDAK di log", async () => {
    h.ctx.tabel.students = { error: null, data: [siswa(1, "Budi", "5"), siswa(2, "Ani", "5")] };
    h.ctx.tabel.kunci_ortu = { error: null, data: [{ siswa_id: 2 }] }; // Ani sudah punya PIN
    h.ctx.rpc.buat_pin_acak_ortu = () => ({ data: [{ siswa_id: 1, pin: "483920" }], error: null });
    const res = await pinPOST(post("/x", { action: "buat", siswa_ids: [1, 2] }));
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(panggilan("buat_pin_acak_ortu")[0].args).toEqual({ p_siswa_ids: [1] });
    expect(j.pin).toEqual([{ siswaId: 1, nama: "Budi", kelas: "5", pin: "483920" }]);
    expect(j.dilewati).toEqual([{ siswaId: 2, nama: "Ani", alasan: expect.stringContaining("PIN sudah dibuat") }]);
    expect(h.log).toHaveLength(1);
    expect(JSON.stringify(h.log)).not.toContain("483920");
    expect(h.log[0][1]).toBe("buat_pin_ortu");
  });
  it("reset: menimpa PIN yang ada (PIN lama mati)", async () => {
    h.ctx.tabel.students = { error: null, data: [siswa(2, "Ani", "5")] };
    h.ctx.rpc.buat_pin_acak_ortu = () => ({ data: [{ siswa_id: 2, pin: "715204" }], error: null });
    const res = await pinPOST(post("/x", { action: "reset", siswa_ids: [2] }));
    expect(res.status).toBe(200);
    expect(panggilan("buat_pin_acak_ortu")[0].args).toEqual({ p_siswa_ids: [2] });
    expect(h.ctx.query.some((q) => q.tabel === "kunci_ortu")).toBe(false); // reset tidak menyaring
    expect(h.log[0][1]).toBe("reset_pin_ortu");
    expect(JSON.stringify(h.log)).not.toContain("715204");
  });
  it("PIN diurutkan menurut nama", async () => {
    h.ctx.tabel.students = { error: null, data: [siswa(1, "Zahra", "5"), siswa(2, "Ani", "5")] };
    h.ctx.tabel.kunci_ortu = { error: null, data: [] };
    h.ctx.rpc.buat_pin_acak_ortu = () => ({ data: [{ siswa_id: 1, pin: "111222" }, { siswa_id: 2, pin: "333444" }], error: null });
    const j = await (await pinPOST(post("/x", { action: "buat", siswa_ids: [1, 2] }))).json();
    expect(j.pin.map((p: { nama: string }) => p.nama)).toEqual(["Ani", "Zahra"]);
  });
  it("siswa tidak aktif dilewati dan dilaporkan; semuanya dilewati -> tanpa panggilan SQL", async () => {
    h.ctx.tabel.students = { error: null, data: [siswa(1, "Budi", "5", "pindah")] };
    const res = await pinPOST(post("/x", { action: "reset", siswa_ids: [1] }));
    const j = await res.json();
    expect(j.pin).toEqual([]);
    expect(j.dilewati[0]).toMatchObject({ siswaId: 1, alasan: "Siswa tidak aktif" });
    expect(panggilan("buat_pin_acak_ortu")).toHaveLength(0);
    expect(h.log).toHaveLength(0);
  });
  it("GURU: satu saja siswa kelas lain -> seluruh permintaan ditolak, tidak ada PIN dibuat", async () => {
    h.session = GURU5;
    h.kelasWali = "5";
    h.ctx.tabel.students = { error: null, data: [siswa(1, "Budi", "5"), siswa(2, "Ani", "6")] };
    const res = await pinPOST(post("/x", { action: "buat", siswa_ids: [1, 2] }));
    expect(res.status).toBe(403);
    expect(h.ctx.rpcCalls).toHaveLength(0);
    expect(h.log).toHaveLength(0);
  });
  it("GURU: id yang tidak ada dijawab sama dengan kelas lain (403); admin 404", async () => {
    h.ctx.tabel.students = { error: null, data: [siswa(1, "Budi", "5")] };
    h.session = GURU5;
    h.kelasWali = "5";
    expect((await pinPOST(post("/x", { action: "buat", siswa_ids: [1, 99] }))).status).toBe(403);
    h.session = ADMIN;
    expect((await pinPOST(post("/x", { action: "buat", siswa_ids: [1, 99] }))).status).toBe(404);
    expect(h.ctx.rpcCalls).toHaveLength(0);
  });
  it("GURU tanpa kelas wali -> 403 sebelum menyentuh siswa", async () => {
    h.session = GURU5;
    h.kelasWali = null;
    expect((await pinPOST(post("/x", { action: "buat", siswa_ids: [1] }))).status).toBe(403);
    expect(h.ctx.query).toHaveLength(0);
  });
  it("admin boleh lintas kelas", async () => {
    h.ctx.tabel.students = { error: null, data: [siswa(1, "Budi", "5"), siswa(2, "Ani", "6")] };
    h.ctx.tabel.kunci_ortu = { error: null, data: [] };
    h.ctx.rpc.buat_pin_acak_ortu = () => ({ data: [{ siswa_id: 1, pin: "111222" }, { siswa_id: 2, pin: "333444" }], error: null });
    expect((await pinPOST(post("/x", { action: "buat", siswa_ids: [1, 2] }))).status).toBe(200);
    expect(h.log[0][2]).toBe("Kelas 5, 6");
  });
  it("tandai_dibagikan: memanggil SQL dan mencatat log hanya bila ada yang berubah", async () => {
    h.ctx.tabel.students = { error: null, data: [siswa(1, "Budi", "5"), siswa(2, "Ani", "5")] };
    h.ctx.rpc.tandai_pin_dibagikan = () => ({ data: 2, error: null });
    const res = await pinPOST(post("/x", { action: "tandai_dibagikan", siswa_ids: [1, 2] }));
    expect((await res.json()).ditandai).toBe(2);
    expect(panggilan("tandai_pin_dibagikan")[0].args).toEqual({ p_siswa_ids: [1, 2] });
    expect(h.log).toHaveLength(1);
    h.log = [];
    h.ctx.rpc.tandai_pin_dibagikan = () => ({ data: 0, error: null });
    await pinPOST(post("/x", { action: "tandai_dibagikan", siswa_ids: [1, 2] }));
    expect(h.log).toHaveLength(0);
  });
  it("tandai_dibagikan untuk siswa kelas lain oleh guru -> 403", async () => {
    h.session = GURU5;
    h.kelasWali = "5";
    h.ctx.tabel.students = { error: null, data: [siswa(2, "Ani", "6")] };
    expect((await pinPOST(post("/x", { action: "tandai_dibagikan", siswa_ids: [2] }))).status).toBe(403);
    expect(panggilan("tandai_pin_dibagikan")).toHaveLength(0);
  });
  it("input tidak sah -> 400 tanpa database", async () => {
    for (const b of [{}, { action: "hapus", siswa_ids: [1] }, { action: "buat", siswa_ids: [] }, { action: "buat", siswa_ids: ["1"] }, { action: "buat", siswa_ids: [1.5] }]) {
      expect((await pinPOST(post("/x", b))).status).toBe(400);
    }
    expect(h.ctx.query).toHaveLength(0);
  });
  it("galat RPC -> 500 generik dan tidak ada log 'berhasil'", async () => {
    h.ctx.tabel.students = { error: null, data: [siswa(1, "Budi", "5")] };
    h.ctx.rpc.buat_pin_acak_ortu = () => ({ data: null, error: { code: "XX000", message: "rahasia" } });
    const res = await pinPOST(post("/x", { action: "reset", siswa_ids: [1] }));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("rahasia");
    expect(h.log).toHaveLength(0);
  });
});
