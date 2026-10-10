import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Database palsu di memori (cukup untuk query yang dipakai route proses) ─────────────────
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const h = vi.hoisted(() => {
  const state = {
    session: null as null | { userId: number; role: string; kelas: string; nama: string },
    kelasWali: null as string | null,
    db: {} as Record<string, Row[]>,
    rpcCalls: [] as { name: string; args: Row }[],
    afterTasks: [] as (() => unknown)[],
    onBeforeInsertAbsensi: null as null | (() => void),
  };
  return { state, kirimNotifAbsen: vi.fn(async () => {}), registerScanner: vi.fn(async () => {}), bumpScannerStats: vi.fn(async () => {}) };
});

class Q {
  private filters: [string, unknown][] = [];
  private op: "select" | "insert" | "update" = "select";
  private payload: Row = {};
  constructor(private table: string) {}
  select() { return this; }
  eq(c: string, v: unknown) { this.filters.push([c, v]); return this; }
  is(c: string, v: unknown) { this.filters.push([c, v]); return this; }
  order() { return this; }
  limit() { return this; }
  insert(row: Row) { this.op = "insert"; this.payload = row; return this; }
  update(v: Row) { this.op = "update"; this.payload = v; return this; }
  private rows() {
    const t = (h.state.db[this.table] ??= []);
    return t.filter((r) => this.filters.every(([c, v]) => (v === null ? r[c] == null : r[c] === v)));
  }
  private exec(): { data: Row[] | null; error: { code?: string; message: string } | null } {
    const tabel = (h.state.db[this.table] ??= []);
    if (this.op === "insert") {
      if (this.table === "absensi") h.state.onBeforeInsertAbsensi?.();
      const dup =
        (this.table === "absensi" && tabel.some((r) => r.siswa_id === this.payload.siswa_id && r.tanggal === this.payload.tanggal)) ||
        (this.table === "absensi_log" && this.payload.scan_id && tabel.some((r) => r.scan_id === this.payload.scan_id));
      if (dup) return { data: null, error: { code: "23505", message: "duplicate key" } };
      tabel.push({ id: tabel.length + 1, created_at: new Date().toISOString(), ...this.payload });
      return { data: null, error: null };
    }
    if (this.op === "update") {
      const kena = this.rows();
      kena.forEach((r) => Object.assign(r, this.payload));
      return { data: kena.map((r) => ({ id: r.id })), error: null };
    }
    return { data: this.rows(), error: null };
  }
  maybeSingle() { const r = this.exec(); return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error }); }
  then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return Promise.resolve(this.exec()).then(res, rej); }
}

// Meniru koreksi_absen_masuk (migrasi 014) — logika SQL-nya diuji terpisah di Postgres asli.
function rpcKoreksi(a: Row) {
  const row = (h.state.db.absensi ?? []).find((r) => r.siswa_id === a.p_siswa_id && r.tanggal === a.p_tanggal);
  if (!row) return [{ dikoreksi: false, status_lama: null, jam_lama: null }];
  const boleh =
    ((row.status === "hadir" || row.status === "terlambat") && row.jam_masuk && row.jam_masuk > a.p_jam) ||
    (row.status === "alpha" && row.keterangan === a.p_ket_alpha_sistem);
  const log = (h.state.db.absensi_log ??= []);
  if (!boleh || (a.p_scan_id && log.some((l) => l.scan_id === a.p_scan_id))) {
    return [{ dikoreksi: false, status_lama: row.status, jam_lama: row.jam_masuk }];
  }
  const lama = { status: row.status, jam: row.jam_masuk };
  log.push({ id: log.length + 1, siswa_id: a.p_siswa_id, status_lama: lama.status, status_baru: a.p_status_baru, keterangan: "Koreksi scan offline", scan_id: a.p_scan_id });
  Object.assign(row, { jam_masuk: a.p_jam, status: a.p_status_baru, keterangan: row.status === "alpha" ? null : row.keterangan });
  return [{ dikoreksi: true, status_lama: lama.status, jam_lama: lama.jam }];
}

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: (t: string) => new Q(t),
    rpc: async (name: string, args: Row) => {
      h.state.rpcCalls.push({ name, args });
      return { data: rpcKoreksi(args), error: null };
    },
  },
}));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => h.state.session }));
vi.mock("@/lib/data/wali-kelas", () => ({ getKelasWali: async () => h.state.kelasWali }));
vi.mock("@/lib/data/dashboard", () => ({
  getAbsensiSetting: async () => ({
    jam_masuk: "07:00:00", batas_terlambat: "07:15:00", jam_pulang_mulai: "11:30:00",
    tapel: "2026/2027", semester: "ganjil", durasi_kunci_menit: 120, toleransi_pagi_menit: 60,
  }),
}));
vi.mock("@/lib/data/scanner", () => ({ registerScanner: h.registerScanner, bumpScannerStats: h.bumpScannerStats }));
vi.mock("@/lib/wa/notifikasi", () => ({ kirimNotifAbsen: h.kirimNotifAbsen }));
vi.mock("next/server", async (orig) => {
  const m = await orig<typeof import("next/server")>();
  return { ...m, after: (fn: () => unknown) => { h.state.afterTasks.push(fn); } };
});

import { NextRequest } from "next/server";
import { POST } from "./route";

const TOKEN_5 = "a".repeat(32); // siswa kelas 5
const TOKEN_6 = "b".repeat(32); // siswa kelas 6
const T = (hhmmWib: string) => new Date(`2026-10-08T${String(Number(hhmmWib.slice(0, 2)) - 7).padStart(2, "0")}:${hhmmWib.slice(3, 5)}:00.000Z`);
const ADMIN = { userId: 1, role: "admin", kelas: "", nama: "Admin" };
const GURU5 = { userId: 7, role: "guru", kelas: "5", nama: "Bu Wali 5" };

async function kirim(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const res = await POST(new NextRequest("http://localhost/api/scan-absen/proses", { method: "POST", body: fd }));
  return { status: res.status, body: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
async function jalankanAfter() {
  const tugas = h.state.afterTasks.splice(0);
  for (const t of tugas) await t();
}
const absensi = () => h.state.db.absensi ?? [];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T("08:30")); // Kamis 8 Okt 2026, 08.30 WIB
  vi.clearAllMocks();
  h.state.session = ADMIN;
  h.state.kelasWali = null;
  h.state.rpcCalls = [];
  h.state.afterTasks = [];
  h.state.onBeforeInsertAbsensi = null;
  h.state.db = {
    hari_libur: [],
    students: [
      { id: 501, name: "Budi (5)", class: "5", status: "aktif" },
      { id: 601, name: "Sari (6)", class: "6", status: "aktif" },
    ],
    absensi_qr_token: [
      { token: TOKEN_5, siswa_id: 501, students: { id: 501, name: "Budi (5)", class: "5", status: "aktif" } },
      { token: TOKEN_6, siswa_id: 601, students: { id: 601, name: "Sari (6)", class: "6", status: "aktif" } },
    ],
    absensi: [],
    absensi_log: [],
  };
});
afterEach(() => vi.useRealTimers());

describe("akses wali kelas (divalidasi di server)", () => {
  beforeEach(() => { h.state.session = GURU5; h.state.kelasWali = "5"; vi.setSystemTime(T("07:05")); });

  it("guru kelas 5 scan siswa kelas 5 -> berhasil tercatat", async () => {
    const r = await kirim({ token: `SIELISA:${TOKEN_5}`, scanner_id: "HP-WALI" });
    expect(r.body.status).toBe("hadir");
    expect(absensi()).toHaveLength(1);
    await jalankanAfter();
    expect(h.kirimNotifAbsen).toHaveBeenCalledTimes(1);
  });

  it("guru kelas 5 scan siswa kelas 6 -> ditolak server, tanpa nama, tanpa tulis data, tanpa WA", async () => {
    const r = await kirim({ token: `SIELISA:${TOKEN_6}`, scanner_id: "HP-WALI" });
    expect(r.body.status).toBe("error");
    expect(r.body.message).toContain("bukan kelas Anda");
    expect(JSON.stringify(r.body)).not.toContain("Sari");
    expect(absensi()).toHaveLength(0);
    expect(h.state.db.absensi_log).toHaveLength(0);
    await jalankanAfter();
    expect(h.kirimNotifAbsen).not.toHaveBeenCalled();
  });

  it("jalur manual: guru kelas 5 memilih siswa_id kelas 6 -> ditolak", async () => {
    const r = await kirim({ manual: "1", siswa_id: "601", scanner_id: "HP-WALI" });
    expect(r.body.status).toBe("error");
    expect(absensi()).toHaveLength(0);
  });

  it("guru yang bukan wali kelas -> ditolak", async () => {
    h.state.kelasWali = null;
    const r = await kirim({ token: `SIELISA:${TOKEN_5}`, scanner_id: "HP-WALI" });
    expect(r.body.status).toBe("error");
    expect(absensi()).toHaveLength(0);
  });

  it("admin tetap boleh semua kelas", async () => {
    h.state.session = ADMIN;
    expect((await kirim({ token: `SIELISA:${TOKEN_6}`, scanner_id: "HP-ADMIN" })).body.status).toBe("hadir");
  });

  it("role lain / belum login -> 403", async () => {
    h.state.session = { userId: 9, role: "siswa", kelas: "", nama: "x" };
    expect((await kirim({ token: `SIELISA:${TOKEN_5}` })).status).toBe(403);
    h.state.session = null;
    expect((await kirim({ token: `SIELISA:${TOKEN_5}` })).status).toBe(403);
  });
});

describe("scan paling awal menang (sinkronisasi antrean offline)", () => {
  const replay = (jamScanWib: string, extra: Record<string, string> = {}) => ({
    token: `SIELISA:${TOKEN_5}`, scanner_id: "HP-ADMIN",
    scan_at: T(jamScanWib).toISOString(), device_now: String(Date.now()), ...extra,
  });

  it("offline 07.10 (admin), online 07.20 (wali) -> jam masuk 07.10, status hadir, WA hanya dari scan online", async () => {
    // 07.20: wali kelas scan online lebih dulu sampai ke server -> terlambat
    vi.setSystemTime(T("07:20"));
    h.state.session = GURU5; h.state.kelasWali = "5";
    expect((await kirim({ token: `SIELISA:${TOKEN_5}`, scanner_id: "HP-WALI" })).body.status).toBe("terlambat");
    await jalankanAfter();
    expect(h.kirimNotifAbsen).toHaveBeenCalledTimes(1);

    // 08.30: HP admin kembali online, antrean (scan 07.10) tersinkron
    vi.setSystemTime(T("08:30"));
    h.state.session = ADMIN; h.state.kelasWali = null;
    const r = await kirim(replay("07:10", { scan_id: "11111111-1111-4111-8111-111111111111" }));
    expect(r.body.dikoreksi).toBe(true);
    expect(absensi()[0]).toMatchObject({ jam_masuk: "07:10:00", status: "hadir" });
    await jalankanAfter();
    expect(h.kirimNotifAbsen).toHaveBeenCalledTimes(1); // TIDAK ada WA koreksi
    expect(h.state.db.absensi_log.some((l) => String(l.keterangan).startsWith("Koreksi"))).toBe(true);
  });

  it("scan offline tersinkron setelah cron alpha -> alpha sistem dikoreksi jadi hadir", async () => {
    absensi().push({ id: 1, siswa_id: 501, tanggal: "2026-10-08", status: "alpha", jam_masuk: null, keterangan: "Tanpa Keterangan (Sistem)" });
    vi.setSystemTime(T("13:00")); // HP baru online setelah cron 12.00
    const r = await kirim(replay("07:10", { scan_id: "22222222-2222-4222-8222-222222222222" }));
    expect(r.body.dikoreksi).toBe(true);
    expect(absensi()[0]).toMatchObject({ status: "hadir", jam_masuk: "07:10:00", keterangan: null });
    await jalankanAfter();
    expect(h.kirimNotifAbsen).not.toHaveBeenCalled();
  });

  it("siswa berstatus sakit/izin/alpha manual -> status manual dipertahankan", async () => {
    for (const [status, ket] of [["sakit", "Demam"], ["izin", "Acara keluarga"], ["alpha", "Tidak ada kabar"]] as const) {
      h.state.db.absensi = [{ id: 1, siswa_id: 501, tanggal: "2026-10-08", status, jam_masuk: null, keterangan: ket }];
      h.state.db.absensi_log = [];
      const r = await kirim(replay("07:10"));
      expect(r.body.dikoreksi).toBeUndefined();
      expect(absensi()[0]).toMatchObject({ status, jam_masuk: null, keterangan: ket });
      expect(h.state.db.absensi_log).toHaveLength(0);
    }
  });

  it("jam HP salah (+2 jam) tetap menghasilkan jam scan yang benar", async () => {
    absensi().push({ id: 1, siswa_id: 501, tanggal: "2026-10-08", status: "terlambat", jam_masuk: "07:20:00", keterangan: null });
    const jamHpSaatScan = new Date(T("07:10").getTime() + 2 * 3600 * 1000).toISOString(); // HP maju 2 jam
    const deviceNow = String(Date.now() + 2 * 3600 * 1000);
    const r = await kirim({ token: `SIELISA:${TOKEN_5}`, scanner_id: "HP-ADMIN", scan_at: jamHpSaatScan, device_now: deviceNow });
    expect(r.body.dikoreksi).toBe(true);
    expect(absensi()[0]).toMatchObject({ jam_masuk: "07:10:00", status: "hadir" });
  });

  it("sinkron ulang item antrean yang sama -> tidak ada efek kedua, tidak ada WA kedua", async () => {
    vi.setSystemTime(T("08:30"));
    const item = replay("07:05", { scan_id: "33333333-3333-4333-8333-333333333333" });
    expect((await kirim(item)).body.status).toBe("hadir"); // pertama: absensi dibuat dengan jam scan asli
    await jalankanAfter();
    expect(absensi()[0]).toMatchObject({ jam_masuk: "07:05:00", status: "hadir" });

    const ulang = await kirim(item); // kirim ulang (balasan pertama hilang di jaringan)
    expect(ulang.body.status).toBe("sudah");
    await jalankanAfter();
    expect(absensi()).toHaveLength(1);
    expect(h.state.db.absensi_log.filter((l) => l.scan_id === "33333333-3333-4333-8333-333333333333")).toHaveLength(1);
    expect(h.kirimNotifAbsen).toHaveBeenCalledTimes(1);
  });
});

describe("identitas antrean (scan_id)", () => {
  it("item yang sudah tercatat di log tidak diproses lagi: tidak ada panggilan koreksi, tidak ada perubahan", async () => {
    // Log item X sudah ada, tetapi absensinya kini (mis. diedit manual) tercatat lebih lambat dari scan X.
    absensi().push({ id: 1, siswa_id: 501, tanggal: "2026-10-08", status: "terlambat", jam_masuk: "07:20:00", keterangan: null });
    (h.state.db.absensi_log ??= []).push({ id: 1, siswa_id: 501, scan_id: "44444444-4444-4444-8444-444444444444", keterangan: "Scan offline: HADIR" });

    const r = await kirim({
      token: `SIELISA:${TOKEN_5}`, scanner_id: "HP-ADMIN", scan_id: "44444444-4444-4444-8444-444444444444",
      scan_at: T("07:10").toISOString(), device_now: String(Date.now()),
    });
    expect(r.body.status).toBe("sudah");
    expect(r.body.keterangan).toContain("sudah diproses");
    expect(h.state.rpcCalls).toHaveLength(0);
    expect(absensi()[0]).toMatchObject({ status: "terlambat", jam_masuk: "07:20:00" });
    await jalankanAfter();
    expect(h.kirimNotifAbsen).not.toHaveBeenCalled();
  });
});

describe("dua perangkat mengirim scan bersamaan", () => {
  it("yang kalah INSERT mendapat 'sudah' -> tidak ada absensi ganda, log, atau WA ganda", async () => {
    vi.setSystemTime(T("07:05"));
    // Simulasi balapan: sebelum INSERT kita, perangkat lain sudah menulis baris yang sama.
    h.state.onBeforeInsertAbsensi = () => {
      h.state.onBeforeInsertAbsensi = null;
      absensi().push({ id: 99, siswa_id: 501, tanggal: "2026-10-08", status: "hadir", jam_masuk: "07:05:00", keterangan: null });
    };
    const r = await kirim({ token: `SIELISA:${TOKEN_5}`, scanner_id: "HP-B" });
    expect(r.body.status).toBe("sudah");
    expect(absensi()).toHaveLength(1);
    expect(h.state.db.absensi_log).toHaveLength(0);
    await jalankanAfter();
    expect(h.kirimNotifAbsen).not.toHaveBeenCalled();
  });
});

describe("validasi scan_at / scan_id di server", () => {
  const dasar = { token: `SIELISA:${TOKEN_5}`, scanner_id: "HP-ADMIN" };
  const tolak = async (extra: Record<string, string>) => {
    const r = await kirim({ ...dasar, ...extra });
    expect(r.status).toBe(400);
    expect(absensi()).toHaveLength(0);
  };
  it("format scan_at rusak", async () => tolak({ scan_at: "kemarin pagi" }));
  it("scan_at di masa depan", async () => tolak({ scan_at: T("09:30").toISOString() }));
  it("scan_at lebih dari 3 hari", async () => tolak({ scan_at: "2026-10-04T00:10:00.000Z" }));
  it("device_now rusak", async () => tolak({ scan_at: T("07:10").toISOString(), device_now: "abc" }));
  it("scan_id bukan UUID", async () => tolak({ scan_at: T("07:10").toISOString(), scan_id: "1; drop table absensi" }));
});
