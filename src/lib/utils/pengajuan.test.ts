import { describe, it, expect } from "vitest";
import {
  bacaBodyJson,
  parseAjukan,
  parseAksiPin,
  parseBatal,
  parseGantiPin,
  parseHalaman,
  parseLampiranPengajuan,
  parsePin,
  parsePutuskan,
  petakanGalatDb,
  petakanHasilPin,
  pratinjauHariDisetujui,
  pratinjauHariTidakDisetujui,
  susunPratinjauHari,
  type StatusAbsensiAda,
} from "./pengajuan";

const CLOUD = "demo-cloud";
const URL_OK = `https://res.cloudinary.com/${CLOUD}/image/upload/v1700000000/si-absen/pengajuan/surat.jpg`;
const dasar = { jenis: "izin", tanggal_dari: "2026-11-16", alasan: "Acara keluarga", pin: "483920" };

function reqJson(isi: string, tipe = "application/json") {
  return new Request("http://x/api", { method: "POST", headers: { "content-type": tipe }, body: isi });
}

describe("bacaBodyJson", () => {
  it("menerima objek JSON", async () => expect(await bacaBodyJson(reqJson('{"a":1}'))).toEqual({ a: 1 }));
  it("menerima charset di Content-Type", async () => expect(await bacaBodyJson(reqJson("{}", "application/json; charset=utf-8"))).toEqual({}));
  it("menolak Content-Type selain JSON (formulir lintas-situs tidak bisa mengirimnya)", async () => {
    expect(await bacaBodyJson(reqJson('{"a":1}', "application/x-www-form-urlencoded"))).toBeNull();
    expect(await bacaBodyJson(reqJson('{"a":1}', "text/plain"))).toBeNull();
  });
  it("menolak body kosong, rusak, array, dan primitif", async () => {
    for (const s of ["", "{rusak", "[1,2]", "42", '"teks"', "null"]) expect(await bacaBodyJson(reqJson(s))).toBeNull();
  });
  it("menolak body terlalu besar", async () => {
    expect(await bacaBodyJson(reqJson(JSON.stringify({ a: "x".repeat(25_000) })))).toBeNull();
  });
});

describe("parsePin", () => {
  it("hanya 6 digit angka berbentuk string", () => {
    expect(parsePin("012345")).toBe("012345");
    for (const x of ["12345", "1234567", "12345a", " 123456", "123 456", 123456, null, undefined, "١٢٣٤٥٦"]) expect(parsePin(x)).toBeNull();
  });
});

describe("parseLampiranPengajuan", () => {
  it("kosong/undefined/null = tanpa lampiran", () => {
    for (const v of [undefined, null, ""]) expect(parseLampiranPengajuan(v, CLOUD)).toEqual({ ok: true, nilai: null });
  });
  it("menerima URL Cloudinary milik aplikasi di folder pengajuan", () => {
    expect(parseLampiranPengajuan(URL_OK, CLOUD)).toEqual({ ok: true, nilai: URL_OK });
  });
  it("menolak folder lain (mis. lampiran guru atau foto siswa)", () => {
    const lain = `https://res.cloudinary.com/${CLOUD}/image/upload/v1/si-absen/lampiran/x.jpg`;
    expect(parseLampiranPengajuan(lain, CLOUD)).toMatchObject({ ok: false, status: 400 });
  });
  it("menolak host/akun lain, non-HTTPS, dan sentinel __HAPUS__ milik form guru", () => {
    expect(parseLampiranPengajuan(`https://evil.example/${CLOUD}/image/upload/si-absen/pengajuan/x.jpg`, CLOUD)).toMatchObject({ ok: false });
    expect(parseLampiranPengajuan(URL_OK.replace("demo-cloud", "akun-lain"), CLOUD)).toMatchObject({ ok: false });
    expect(parseLampiranPengajuan(URL_OK.replace("https", "http"), CLOUD)).toMatchObject({ ok: false });
    expect(parseLampiranPengajuan("__HAPUS__", CLOUD)).toMatchObject({ ok: false, status: 400 });
    expect(parseLampiranPengajuan(123, CLOUD)).toMatchObject({ ok: false });
  });
  it("konfigurasi Cloudinary kosong gagal tertutup (500)", () => {
    expect(parseLampiranPengajuan(URL_OK, "")).toMatchObject({ ok: false, status: 500 });
  });
});

describe("parseAjukan", () => {
  it("izin satu hari: tanggal_sampai boleh kosong dan memakai tanggal_dari", () => {
    const r = parseAjukan(dasar, CLOUD);
    expect(r).toMatchObject({ ok: true, nilai: { jenis: "izin", dari: "2026-11-16", sampai: "2026-11-16", lampiran: null, pin: "483920" } });
  });
  it("sakit wajib mengisi tanggal_sampai", () => {
    expect(parseAjukan({ ...dasar, jenis: "sakit" }, CLOUD)).toMatchObject({ ok: false, status: 400 });
    expect(parseAjukan({ ...dasar, jenis: "sakit", tanggal_sampai: "2026-11-18", lampiran_url: URL_OK }, CLOUD)).toMatchObject({
      ok: true, nilai: { sampai: "2026-11-18", lampiran: URL_OK },
    });
  });
  it("alasan tidak dipotong/diubah di sini (aturan 5-300 karakter hanya di SQL)", () => {
    const r = parseAjukan({ ...dasar, alasan: "  x  " }, CLOUD);
    expect(r).toMatchObject({ ok: true, nilai: { alasan: "  x  " } });
  });
  it("menolak jenis, tanggal, dan tipe yang salah", () => {
    const tolak = (patch: Record<string, unknown>) => expect(parseAjukan({ ...dasar, ...patch }, CLOUD)).toMatchObject({ ok: false, status: 400 });
    tolak({ jenis: "cuti" });
    tolak({ jenis: undefined });
    tolak({ tanggal_dari: "2026-02-31" });
    tolak({ tanggal_dari: "16-11-2026" });
    tolak({ tanggal_dari: 20261116 });
    tolak({ tanggal_sampai: "bukan-tanggal" });
    tolak({ jenis: "sakit", tanggal_sampai: "2026-11-10" });
    tolak({ alasan: 123 });
    tolak({ alasan: undefined });
    tolak({ alasan: "x".repeat(2001) });
  });
  it("PIN wajib dan berformat benar", () => {
    for (const pin of [undefined, "", "12345", "abcdef", 483920]) {
      expect(parseAjukan({ ...dasar, pin }, CLOUD)).toMatchObject({ ok: false, status: 400, kode: "PIN_FORMAT" });
    }
  });
  it("lampiran buruk ditolak", () => {
    expect(parseAjukan({ ...dasar, lampiran_url: "https://evil.example/x.jpg" }, CLOUD)).toMatchObject({ ok: false });
  });
  it("mengabaikan siswa_id dari klien (tidak pernah ikut di hasil)", () => {
    const r = parseAjukan({ ...dasar, siswa_id: 999 }, CLOUD);
    expect(r.ok && Object.keys(r.nilai)).not.toContain("siswa_id");
  });
});

describe("parseBatal / parseGantiPin", () => {
  it("parseBatal butuh PIN valid", () => {
    expect(parseBatal({ pin: "483920" })).toEqual({ ok: true, pin: "483920" });
    expect(parseBatal({})).toMatchObject({ ok: false, kode: "PIN_FORMAT" });
  });
  it("parseGantiPin: format, dan PIN baru harus beda", () => {
    expect(parseGantiPin({ pin_lama: "483920", pin_baru: "715204" })).toEqual({ ok: true, pinLama: "483920", pinBaru: "715204" });
    expect(parseGantiPin({ pin_lama: "483920", pin_baru: "12" })).toMatchObject({ ok: false, kode: "PIN_FORMAT" });
    expect(parseGantiPin({ pin_lama: "483920", pin_baru: "483920" })).toMatchObject({ ok: false, status: 422, kode: "PIN_SAMA" });
  });
});

describe("parsePutuskan", () => {
  it("setujui semua hari", () => {
    expect(parsePutuskan({ keputusan: "setujui" })).toEqual({ ok: true, nilai: { keputusan: "setujui", hari: null, catatan: null } });
  });
  it("persetujuan sebagian: hari diurutkan dan dibuang gandanya", () => {
    const r = parsePutuskan({ keputusan: "setujui", hari: ["2026-11-18", "2026-11-16", "2026-11-16"], catatan: "  Lampiran jelas  " });
    expect(r).toEqual({ ok: true, nilai: { keputusan: "setujui", hari: ["2026-11-16", "2026-11-18"], catatan: "Lampiran jelas" } });
  });
  it("tolak tidak boleh membawa daftar hari", () => {
    expect(parsePutuskan({ keputusan: "tolak", hari: ["2026-11-16"] })).toMatchObject({ ok: false, status: 400 });
    expect(parsePutuskan({ keputusan: "tolak", catatan: "Surat tidak jelas" })).toMatchObject({ ok: true });
  });
  it("menolak keputusan/daftar hari/catatan tidak sah", () => {
    expect(parsePutuskan({ keputusan: "mungkin" })).toMatchObject({ ok: false });
    expect(parsePutuskan({})).toMatchObject({ ok: false });
    expect(parsePutuskan({ keputusan: "setujui", hari: [] })).toMatchObject({ ok: false });
    expect(parsePutuskan({ keputusan: "setujui", hari: "2026-11-16" })).toMatchObject({ ok: false });
    expect(parsePutuskan({ keputusan: "setujui", hari: ["2026-13-01"] })).toMatchObject({ ok: false });
    expect(parsePutuskan({ keputusan: "setujui", hari: [20261116] })).toMatchObject({ ok: false });
    expect(parsePutuskan({ keputusan: "setujui", hari: Array(32).fill("2026-11-16") })).toMatchObject({ ok: false });
    expect(parsePutuskan({ keputusan: "setujui", catatan: 5 })).toMatchObject({ ok: false });
    expect(parsePutuskan({ keputusan: "setujui", catatan: "x".repeat(501) })).toMatchObject({ ok: false });
  });
  it("catatan kosong menjadi null", () => {
    expect(parsePutuskan({ keputusan: "setujui", catatan: "   " })).toMatchObject({ ok: true, nilai: { catatan: null } });
  });
});

describe("parseAksiPin", () => {
  it("menerima aksi dan id unik terurut", () => {
    expect(parseAksiPin({ action: "buat", siswa_ids: [5, 3, 5] })).toEqual({ ok: true, aksi: "buat", siswaIds: [3, 5] });
  });
  it("menolak aksi, daftar kosong/terlalu banyak, dan id tidak aman", () => {
    expect(parseAksiPin({ action: "hapus", siswa_ids: [1] })).toMatchObject({ ok: false });
    expect(parseAksiPin({ action: "buat", siswa_ids: [] })).toMatchObject({ ok: false });
    expect(parseAksiPin({ action: "buat" })).toMatchObject({ ok: false });
    expect(parseAksiPin({ action: "buat", siswa_ids: Array.from({ length: 101 }, (_, i) => i + 1) })).toMatchObject({ ok: false });
    for (const bad of [0, -1, 1.5, "1", null, Number.MAX_SAFE_INTEGER + 2]) {
      expect(parseAksiPin({ action: "buat", siswa_ids: [bad] })).toMatchObject({ ok: false });
    }
  });
});

describe("parseHalaman", () => {
  it("bawaan untuk nilai buruk, dibatasi maksimum", () => {
    expect(parseHalaman(null, 1, 50)).toBe(1);
    expect(parseHalaman("0", 1, 50)).toBe(1);
    expect(parseHalaman("-3", 1, 50)).toBe(1);
    expect(parseHalaman("2abc", 1, 50)).toBe(1);
    expect(parseHalaman("007", 1, 50)).toBe(1);
    expect(parseHalaman("3", 1, 50)).toBe(3);
    expect(parseHalaman("999", 1, 50)).toBe(50);
  });
});

describe("petakanHasilPin", () => {
  const sekarang = new Date("2026-11-13T02:00:00Z"); // 09:00 WIB
  it("ok = null (PIN benar)", () => expect(petakanHasilPin({ ok: true })).toBeNull());
  it("PIN_SALAH -> 403 dengan sisa percobaan", () => {
    expect(petakanHasilPin({ ok: false, kode: "PIN_SALAH", sisa_percobaan: 3 })).toMatchObject({
      status: 403, kode: "PIN_SALAH", message: "PIN salah. Sisa percobaan: 3.", tambahan: { sisa_percobaan: 3 },
    });
  });
  it("TERKUNCI dengan terkunci_sampai -> 429 + Retry-After + jam WIB", () => {
    const g = petakanHasilPin({ ok: false, kode: "TERKUNCI", terkunci_sampai: "2026-11-13T02:15:00Z" }, sekarang)!;
    expect(g.status).toBe(429);
    expect(g.retryAfter).toBe(900);
    expect(g.message).toContain("09:15 WIB");
  });
  it("TERKUNCI dengan menit (kunci baru saja dipasang)", () => {
    const g = petakanHasilPin({ ok: false, kode: "TERKUNCI", menit: 15 }, sekarang)!;
    expect(g).toMatchObject({ status: 429, retryAfter: 900 });
    expect(g.message).toContain("09:15 WIB");
  });
  it("PIN_BELUM_DIATUR -> 409, SISWA_TIDAK_AKTIF -> 403, TERLALU_MUDAH -> 422, FORMAT -> 400", () => {
    expect(petakanHasilPin({ ok: false, kode: "PIN_BELUM_DIATUR" })).toMatchObject({ status: 409, kode: "PIN_BELUM_DIATUR" });
    expect(petakanHasilPin({ ok: false, kode: "SISWA_TIDAK_AKTIF" })).toMatchObject({ status: 403 });
    expect(petakanHasilPin({ ok: false, kode: "PIN_TERLALU_MUDAH" })).toMatchObject({ status: 422 });
    expect(petakanHasilPin({ ok: false, kode: "PIN_FORMAT" })).toMatchObject({ status: 400 });
  });
  it("bentuk tak dikenal gagal tertutup (500), tidak pernah dianggap benar", () => {
    for (const x of [null, undefined, "ok", 1, {}, { ok: false }, { ok: "true" }, { ok: false, kode: "ANEH" }]) {
      expect(petakanHasilPin(x)).toMatchObject({ ok: false, status: 500 });
    }
  });
});

describe("petakanGalatDb", () => {
  it("P0001 (raise exception biasa) diteruskan sebagai 422 dengan pesan SQL", () => {
    expect(petakanGalatDb({ code: "P0001", message: "Alasan minimal 5 karakter." })).toMatchObject({ status: 422, message: "Alasan minimal 5 karakter." });
  });
  it("EM001 -> 422 riwayat_kelas_kosong", () => {
    expect(petakanGalatDb({ code: "EM001", message: "Tidak ada riwayat kelas." })).toMatchObject({ status: 422, kode: "riwayat_kelas_kosong" });
  });
  it("tabrakan indeks unik (permintaan bersamaan) -> 409; deadlock/serialisasi -> 409", () => {
    expect(petakanGalatDb({ code: "23505", message: "duplicate key value violates unique constraint uq_pengajuan_hari_aktif" })).toMatchObject({ status: 409 });
    for (const code of ["40001", "40P01", "55P03"]) expect(petakanGalatDb({ code })).toMatchObject({ status: 409 });
  });
  it("migrasi belum dijalankan -> 503", () => {
    for (const code of ["PGRST202", "42883", "42P01", "PGRST205"]) expect(petakanGalatDb({ code })).toMatchObject({ status: 503 });
  });
  it("galat lain -> 500 TANPA membocorkan pesan internal", () => {
    const g = petakanGalatDb({ code: "XX000", message: 'relation "kunci_ortu" secret detail' });
    expect(g.status).toBe(500);
    expect(g.message).not.toContain("kunci_ortu");
  });
});

describe("pratinjau nasib hari (cermin putuskan_pengajuan_izin)", () => {
  const HARI_INI = "2026-11-13";
  const LALU = "2026-11-10";
  const BESOK = "2026-11-16";
  const kasus: [string, string, StatusAbsensiAda, string, string][] = [
    // [label, tanggal, absensi, jikaDisetujui, jikaTidak]
    ["lampau tanpa catatan", LALU, null, "ditulis", "dialpha"],
    ["lampau Alpha", LALU, "alpha", "ditulis", "tidak_berubah"],
    ["lampau Hadir", LALU, "hadir", "scan_menang", "tidak_berubah"],
    ["lampau Terlambat", LALU, "terlambat", "scan_menang", "tidak_berubah"],
    ["lampau Izin", LALU, "izin", "sudah_tercatat", "tidak_berubah"],
    ["lampau Sakit", LALU, "sakit", "sudah_tercatat", "tidak_berubah"],
    ["hari ini tanpa catatan", HARI_INI, null, "direncanakan", "tidak_berubah"],
    ["hari ini Alpha", HARI_INI, "alpha", "ditulis", "tidak_berubah"],
    ["hari ini Hadir", HARI_INI, "hadir", "scan_menang", "tidak_berubah"],
    ["mendatang tanpa catatan", BESOK, null, "direncanakan", "tidak_berubah"],
    ["mendatang Alpha (data aneh)", BESOK, "alpha", "direncanakan", "tidak_berubah"],
  ];
  it.each(kasus)("%s", (_l, tgl, abs, setuju, tidak) => {
    expect(pratinjauHariDisetujui(tgl, abs, HARI_INI)).toBe(setuju);
    expect(pratinjauHariTidakDisetujui(tgl, abs, HARI_INI)).toBe(tidak);
  });
  it("susunPratinjauHari mengurutkan dan memakai catatan per tanggal", () => {
    const peta = new Map<string, StatusAbsensiAda>([[LALU, "hadir"]]);
    const r = susunPratinjauHari([BESOK, LALU], peta, HARI_INI);
    expect(r.map((x) => x.tanggal)).toEqual([LALU, BESOK]);
    expect(r[0]).toMatchObject({ absensi: "hadir", jikaDisetujui: "scan_menang" });
    expect(r[1]).toMatchObject({ absensi: null, jikaDisetujui: "direncanakan" });
  });
});
