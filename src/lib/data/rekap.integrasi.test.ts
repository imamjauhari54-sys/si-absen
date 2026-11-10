import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { buatFakeSupabase, type Db } from "./fake-supabase.testutil";
import { daftarTanggalRentang, hitungRekapSiswa, rentangFilter, statusHariSiswa, type KonteksSiswa } from "@/lib/utils/rekap-siswa";
import { tapelDariTanggal, semesterDariTanggal } from "@/lib/utils/tapel";
import type { JedaSiswa } from "@/lib/utils/siswa-harian";

/**
 * TES INTEGRASI lapisan data: fungsi data yang SEBENARNYA (Rekap Harian, Rekap Bulanan admin, kartu Portal, kartu ringkasan,
 * grafik tren) dijalankan terhadap database tiruan (meniru batas 1000 baris PostgREST), lalu dibandingkan dengan perhitungan ACUAN
 * yang dibuat langsung dari data mentah. Memastikan KABEL ke fungsi bersama benar: hari libur, batas awal (catatan pertama),
 * tanggal pindah, jeda, dan paginasi — bukan hanya rumusnya.
 */

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: () => {} }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: (t: string) => (h.client as { from: (t: string) => unknown }).from(t),
    rpc: (n: string, a: Record<string, unknown>) => (h.client as { rpc: (n: string, a: unknown) => unknown }).rpc(n, a),
  },
}));

const TODAY = "2026-10-20";
const TAPEL = "2026/2027";
type S = { siswa_id: number; nama: string; kelas: string; nisn: string | null; nonaktif_pada: string | null; alasan_nonaktif: "pindah" | null };
const SISWA: S[] = [
  { siswa_id: 1, nama: "Ani", kelas: "5", nisn: null, nonaktif_pada: null, alasan_nonaktif: null },
  { siswa_id: 2, nama: "Budi", kelas: "5", nisn: null, nonaktif_pada: "2026-10-12", alasan_nonaktif: "pindah" },
  { siswa_id: 3, nama: "Siti", kelas: "5", nisn: null, nonaktif_pada: null, alasan_nonaktif: null },
  { siswa_id: 4, nama: "Dewi", kelas: "5", nisn: null, nonaktif_pada: null, alasan_nonaktif: null },
  { siswa_id: 5, nama: "Eka", kelas: "5", nisn: null, nonaktif_pada: null, alasan_nonaktif: null },
];
const JEDA_SITI: JedaSiswa[] = [{ dari: "2026-10-02", sampai: "2026-10-15", alasan: "pindah" }];
const LIBUR = "2026-10-08";
vi.mock("@/lib/data/riwayat-kelas", () => ({
  getSiswaTapel: async () => SISWA,
  getKelasTapel: async () => ["5"],
  tapelUntukTanggal: async (t: string) => (await import("@/lib/utils/tapel")).tapelDariTanggal(t),
  tapelUntukBulan: async (b: string) => (await import("@/lib/utils/tapel")).tapelDariTanggal(`${b}-01`),
}));
vi.mock("@/lib/data/dashboard", () => ({ getAbsensiSetting: async () => ({ tapel: "2026/2027", semester: "ganjil" }) }));

const HARI_OKT = daftarTanggalRentang("2026-10-01", "2026-10-19"); // hari kerja sebelum "hari ini"
const rec = (siswa_id: number, tanggal: string, status = "hadir") => ({
  siswa_id, tanggal, status, tapel: tapelDariTanggal(tanggal), semester: semesterDariTanggal(tanggal),
  jam_masuk: null, jam_pulang: null, keterangan: null, lampiran: null, scan_oleh: "admin",
});

function bangunDb(): Db {
  const absensi: Record<string, unknown>[] = [];
  // Ani: riwayat panjang sejak Juli 2022 (>1000 baris) + seluruh Oktober; catatan di hari libur diabaikan
  for (const t of daftarTanggalRentang("2022-07-01", "2026-09-30")) absensi.push(rec(1, t, t.endsWith("-13") ? "sakit" : "hadir"));
  for (const t of HARI_OKT) absensi.push(rec(1, t));
  // Budi: hadir sampai sebelum pindah (12 Okt); catatan SESUDAH pindah ada tetapi harus diabaikan
  for (const t of HARI_OKT) absensi.push(rec(2, t, t >= "2026-10-12" ? "alpha" : "hadir"));
  // Siti: 1 Okt hadir; catatan nyasar di dalam jeda (5 Okt) diabaikan; kembali 15 Okt, 16 Okt tanpa catatan
  absensi.push(rec(3, "2026-10-01"), rec(3, "2026-10-05"));
  for (const t of ["2026-10-15", "2026-10-17", "2026-10-19"]) absensi.push(rec(3, t));
  // Dewi: catatan pertama 14 Okt. Eka: tidak punya catatan sama sekali.
  for (const t of HARI_OKT.filter((x) => x >= "2026-10-14")) absensi.push(rec(4, t));
  // Isi catatan yang TIDAK BOLEH bocor bila harinya tidak dihitung: libur (Ani), tanggal pindah (Budi), awal jeda (Siti).
  const isi = (id: number, tgl: string, o: Record<string, unknown>) => Object.assign(absensi.find((r) => r.siswa_id === id && r.tanggal === tgl) ?? absensi[absensi.push(rec(id, tgl)) - 1], o);
  isi(1, LIBUR, { keterangan: "demam tinggi", lampiran: "surat-dokter.pdf", jam_masuk: "07:01:00", jam_pulang: "12:00:00", scan_oleh: "manual" });
  isi(2, "2026-10-12", { keterangan: "pindah sekolah", lampiran: "surat-pindah.pdf", jam_masuk: "07:05:00", scan_oleh: "manual" });
  isi(3, "2026-10-02", { keterangan: "masa jeda", lampiran: "jeda.pdf", jam_masuk: "07:10:00", scan_oleh: "manual" });
  // Siti: pengajuan MENUNGGU untuk 16 Okt (ada baris Alpha lama) dan 17 Okt (sudah ada catatan Hadir: scan menang)
  isi(3, "2026-10-16", { status: "alpha", keterangan: "alpha otomatis", lampiran: "lama.pdf" });
  return {
    absensi,
    pengajuan_menunggu: [{ siswa_id: 3, tanggal: "2026-10-16" }, { siswa_id: 3, tanggal: "2026-10-17" }],
    hari_libur: [{ tanggal: LIBUR, keterangan: "uji" }],
    students: SISWA.map((s) => ({ id: s.siswa_id, status: s.nonaktif_pada ? "pindah" : "aktif" })),
    riwayat_kelas: [{ siswa_id: 2, tapel: TAPEL, nonaktif_pada: "2026-10-12" }],
    riwayat_status_siswa: [{ id: 1, siswa_id: 3, tapel: TAPEL, mode: "kembali_setelah_jeda", pindah_pada: "2026-10-02", kembali_pada: "2026-10-15", alasan: "pindah" }],
  };
}

/** ACUAN: konteks dibangun langsung dari data mentah (bukan lewat lapisan data yang diuji). */
function acuan(db: Db, s: S, tglRef: string): KonteksSiswa {
  const mine = (db.absensi as { siswa_id: number; tanggal: string; status: string; tapel: string }[]).filter((r) => r.siswa_id === s.siswa_id);
  const tapel = tapelDariTanggal(tglRef);
  const mulai = mine.filter((r) => r.tapel === tapel).map((r) => r.tanggal).sort()[0] ?? null;
  return {
    today: TODAY,
    libur: new Set((db.hari_libur as { tanggal: string }[]).map((r) => r.tanggal)),
    absensi: new Map(mine.map((r) => [r.tanggal, r.status])),
    nonaktifPada: s.nonaktif_pada,
    jeda: s.siswa_id === 3 ? JEDA_SITI : [],
    menunggu: new Set((db.pengajuan_menunggu as { siswa_id: number; tanggal: string }[]).filter((r) => r.siswa_id === s.siswa_id).map((r) => r.tanggal)),
    mulai,
  };
}
const bulanTgl = (b: string) => { const r = rentangFilter({ bulan: b })!; return daftarTanggalRentang(r.dari, r.sampai); };
const liburMap = new Map([[LIBUR, "uji"]]);

let db: Db;
let fake: ReturnType<typeof buatFakeSupabase>;
function pasang(opsi: { batasBaris?: number } = {}) {
  db = bangunDb();
  fake = buatFakeSupabase(db, {
    ...opsi,
    rpc: {
      tanggal_menunggu: (a) =>
        (db.pengajuan_menunggu as { siswa_id: number; tanggal: string }[]).filter(
          (r) => (a.p_siswa_ids as number[]).includes(r.siswa_id) && r.tanggal >= (a.p_dari as string) && r.tanggal <= (a.p_sampai as string)
        ),
      awal_catatan_siswa: (a) => {
        const per = new Map<number, string>();
        for (const r of db.absensi as { siswa_id: number; tanggal: string; tapel: string }[]) {
          if (r.tapel !== a.p_tapel || !(a.p_ids as number[]).includes(r.siswa_id)) continue;
          if (!per.has(r.siswa_id) || r.tanggal < per.get(r.siswa_id)!) per.set(r.siswa_id, r.tanggal);
        }
        return [...per].map(([siswa_id, mulai]) => ({ siswa_id, mulai }));
      },
    },
  });
  h.client = fake.client;
}

beforeAll(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-20T05:00:00Z")); });
afterAll(() => vi.useRealTimers());

describe("Rekap Harian (getRekapHarian) memakai fungsi bersama", () => {
  it("setiap baris = hasil acuan untuk banyak tanggal (libur, sebelum catatan pertama, pindah, jeda, hari ini)", async () => {
    pasang();
    const { getRekapHarian } = await import("./rekap");
    for (const tgl of ["2026-10-01", "2026-10-02", "2026-10-05", "2026-10-08", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-19", "2026-10-20"]) {
      const { rows, stat } = await getRekapHarian(tgl, "");
      const hitung = { hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpha: 0 } as Record<string, number>;
      for (const r of rows) {
        const s = SISWA.find((x) => x.siswa_id === r.id)!;
        const a = statusHariSiswa(tgl, acuan(db, s, tgl));
        const harapStatus = a === "nonaktif" || a === "libur" || a === "menunggu" ? "kosong" : a;
        expect(r.status, `${tgl} ${s.nama}`).toBe(harapStatus);
        expect(!!r.tidakDihitung, `${tgl} ${s.nama} tidakDihitung`).toBe(a === "nonaktif");
        expect(!!r.libur, `${tgl} ${s.nama} libur`).toBe(a === "libur");
        expect(!!r.menunggu, `${tgl} ${s.nama} menunggu`).toBe(a === "menunggu");
        if (harapStatus in hitung) hitung[harapStatus]++;
      }
      expect(stat, `stat ${tgl}`).toEqual(hitung);
    }
  });

  it("hari libur: semua baris libur, tidak ada yang dihitung (catatan di hari libur diabaikan)", async () => {
    pasang();
    const { getRekapHarian } = await import("./rekap");
    const { rows, stat } = await getRekapHarian(LIBUR, "");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.libur === true && r.status === "kosong" && r.jam_masuk === null)).toBe(true);
    expect(stat).toEqual({ hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpha: 0 });
  });

  it("siswa sebelum catatan pertama / tanpa catatan: 'belumTercatat', BUKAN Alpha", async () => {
    pasang();
    const { getRekapHarian } = await import("./rekap");
    const { rows } = await getRekapHarian("2026-10-09", "");
    const dewi = rows.find((r) => r.name === "Dewi")!, eka = rows.find((r) => r.name === "Eka")!, ani = rows.find((r) => r.name === "Ani")!;
    expect(dewi.belumTercatat).toBe(true);
    expect(eka.belumTercatat).toBe(true);
    expect(dewi.status).toBe("kosong");
    expect(ani.belumTercatat).toBeUndefined();
    expect(ani.status).toBe("hadir");
  });
});

describe("Rekap Harian tidak membocorkan isi catatan pada hari yang tidak dihitung", () => {
  const BOCOR = ["jam_masuk", "jam_pulang", "keterangan", "lampiran", "pulihkan", "sumber", "sumberKet"] as const;
  const opsiPenuh = { denganPulihkan: true, denganSumber: true };

  it.each([
    ["hari libur", LIBUR, "Ani", { libur: true }],
    ["tanggal pindah (tampil tetapi tidak dihitung)", "2026-10-12", "Budi", { tidakDihitung: true }],
    ["awal jeda (tampil tetapi tidak dihitung)", "2026-10-02", "Siti", { tidakDihitung: true }],
  ])("%s: keterangan, lampiran, jam, asal catatan, dan Pulihkan disembunyikan", async (_nama, tgl, siswa, tanda) => {
    pasang();
    const { getRekapHarian } = await import("./rekap");
    const { rows } = await getRekapHarian(tgl, "", opsiPenuh);
    const r = rows.find((x) => x.name === siswa)!;
    expect(r, `${siswa} ada di baris`).toBeDefined();
    expect(r).toMatchObject(tanda);
    for (const k of BOCOR) expect(r[k], `${tgl} ${siswa} ${k}`).toBeNull();
  });

  it("seluruh baris pada hari libur tidak membawa isi catatan sama sekali", async () => {
    pasang();
    const { getRekapHarian } = await import("./rekap");
    const { rows } = await getRekapHarian(LIBUR, "", opsiPenuh);
    for (const r of rows) for (const k of BOCOR) expect(r[k], `${r.name} ${k}`).toBeNull();
  });

  it("hari biasa tetap menampilkan isi catatannya (tidak ikut disembunyikan)", async () => {
    pasang();
    (db.absensi as Record<string, unknown>[]).find((r) => r.siswa_id === 1 && r.tanggal === "2026-10-06")!.keterangan = "izin acara keluarga";
    const { getRekapHarian } = await import("./rekap");
    const { rows } = await getRekapHarian("2026-10-06", "", opsiPenuh);
    const ani = rows.find((x) => x.name === "Ani")!;
    expect(ani.keterangan).toBe("izin acara keluarga");
    expect(ani.sumber).not.toBeNull();
  });

  it("catatan tidak dihapus: bila hari itu bukan libur lagi, isinya muncul kembali", async () => {
    pasang();
    db.hari_libur = [];
    const { getRekapHarian } = await import("./rekap");
    const { rows } = await getRekapHarian(LIBUR, "", opsiPenuh);
    const ani = rows.find((x) => x.name === "Ani")!;
    expect(ani.keterangan).toBe("demam tinggi");
    expect(ani.lampiran).toBe("surat-dokter.pdf");
    expect(ani.libur).toBeUndefined();
  });
});

describe("Rekap Bulanan admin, kartu Portal, dan kartu ringkasan: angka identik dengan acuan", () => {
  it("Rekap Bulanan admin (Oktober) = acuan untuk setiap siswa", async () => {
    pasang();
    const { getRekapBulanan } = await import("./rekap");
    const { rows, tglList } = await getRekapBulanan("2026-10", "", liburMap);
    expect(tglList).toEqual(bulanTgl("2026-10"));
    for (const r of rows) {
      const s = SISWA.find((x) => x.siswa_id === r.id)!;
      const a = hitungRekapSiswa(tglList, acuan(db, s, "2026-10-01"));
      expect({ d: r.d, hadir: r.hadir, terlambat: r.terlambat, izin: r.izin, sakit: r.sakit, alpha: r.alpha }, s.nama)
        .toEqual({ d: a.d, hadir: a.hadir, terlambat: a.terlambat, izin: a.izin, sakit: a.sakit, alpha: a.alpha });
    }
    const eka = rows.find((r) => r.nama === "Eka")!;
    expect(Object.values(eka.d).every((v) => v === "kosong" || v === "libur")).toBe(true);
  });

  it("PORTAL (kartu bulanan & kartu ringkasan) == ADMIN == acuan, untuk semua siswa", async () => {
    pasang();
    const { getRekapBulanan, getRekapBulananSiswa } = await import("./rekap");
    const { getRingkasanKehadiran } = await import("./rekap-siswa");
    const admin = (await getRekapBulanan("2026-10", "", liburMap)).rows;
    for (const s of SISWA) {
      const portal = await getRekapBulananSiswa(s.siswa_id, "2026-10", liburMap);
      const adm = admin.find((r) => r.id === s.siswa_id)!;
      expect({ d: portal.d, hadir: portal.hadir, terlambat: portal.terlambat, izin: portal.izin, sakit: portal.sakit, alpha: portal.alpha }, `portal==admin ${s.nama}`)
        .toEqual({ d: adm.d, hadir: adm.hadir, terlambat: adm.terlambat, izin: adm.izin, sakit: adm.sakit, alpha: adm.alpha });
      const kartu = await getRingkasanKehadiran(s.siswa_id, { tapel: TAPEL, semester: "ganjil", bulan: "2026-10" }, liburMap);
      expect(kartu.stat, `kartu atas ${s.nama}`).toEqual({ hadir: adm.hadir, terlambat: adm.terlambat, izin: adm.izin, sakit: adm.sakit, alpha: adm.alpha });
      expect(kartu.totalHari).toBe(adm.hadir + adm.terlambat + adm.izin + adm.sakit + adm.alpha);
    }
  });

  it("kartu ringkasan semester = acuan; hari sebelum catatan pertama (Juli) tidak ikut", async () => {
    pasang();
    const { getRingkasanKehadiran } = await import("./rekap-siswa");
    for (const s of SISWA) {
      const sem = rentangFilter({ tapel: TAPEL, semester: "ganjil", bulan: "" })!;
      const a = hitungRekapSiswa(daftarTanggalRentang(sem.dari, sem.sampai), acuan(db, s, sem.dari));
      const k = await getRingkasanKehadiran(s.siswa_id, { tapel: TAPEL, semester: "ganjil", bulan: "" }, liburMap);
      expect(k.stat, s.nama).toEqual({ hadir: a.hadir, terlambat: a.terlambat, izin: a.izin, sakit: a.sakit, alpha: a.alpha });
      expect(k.totalHari, s.nama).toBe(a.hariDihitung);
    }
  });
});

describe("Grafik tren memakai fungsi bersama, RPC batas awal, dan paginasi", () => {
  it("setiap bulan pada grafik = acuan; batas awal dari RPC awal_catatan_siswa", async () => {
    pasang();
    const { getChartTren6Bulan } = await import("./history");
    const data = await getChartTren6Bulan(2); // Budi: pindah 12 Okt
    expect(fake.log.rpc).toContain("awal_catatan_siswa");
    const budi = SISWA[1];
    const ctxOkt = acuan(db, budi, "2026-10-01");
    const okt = hitungRekapSiswa(bulanTgl("2026-10"), ctxOkt);
    expect(data.at(-1)).toMatchObject({ label: "Okt 2026", hadir: okt.hadir + okt.terlambat, alpha: okt.alpha });
    // bulan lain (Juli-Sep 2026) tidak punya catatan Budi di tapel ini -> tidak ada hari dihitung -> tidak muncul
    expect(data.map((d) => d.label)).toEqual(["Okt 2026"]);
  });

  it("siswa dengan >1000 catatan total: grafik benar, query DIBATASI jendela waktu dan tidak terpotong diam-diam", async () => {
    pasang(); // batas server 1000 baris seperti Supabase
    const { getChartTren6Bulan } = await import("./history");
    const ani = SISWA[0];
    const totalAni = (db.absensi as { siswa_id: number }[]).filter((r) => r.siswa_id === 1).length;
    expect(totalAni).toBeGreaterThan(1000); // mengambil SELURUH riwayat tanpa paginasi akan terpotong dan menyesatkan
    const data = await getChartTren6Bulan(1);
    const bulan = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];
    const label = (b: string) => { const [y, m] = b.split("-"); return `${["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"][Number(m) - 1]} ${y}`; };
    expect(data.map((d) => d.label)).toEqual(bulan.map(label));
    for (const b of bulan) {
      const a = hitungRekapSiswa(bulanTgl(b), acuan(db, ani, `${b}-01`));
      expect(data.find((d) => d.label === label(b)), b).toMatchObject({ hadir: a.hadir + a.terlambat, alpha: a.alpha });
    }
    const absensiReq = fake.log.permintaan.filter((p) => p.tabel === "absensi");
    expect(absensiReq.some((p) => p.terpotong)).toBe(false); // tidak ada query yang terpotong diam-diam
    const diambil = absensiReq.reduce((n, p) => n + p.jumlah, 0);
    expect(diambil).toBeLessThan(24 * 27); // hanya jendela 24 bulan, bukan seluruh riwayat 4+ tahun
    expect(diambil).toBeLessThan(totalAni);
  });
});

describe("Pengajuan izin/sakit MENUNGGU (Siti: 16 Okt Alpha lama, 17 Okt sudah Hadir)", () => {
  const opsiPenuh = { denganPulihkan: true, denganSumber: true };

  it("Rekap Harian: hari Menunggu tampil Menunggu, tidak dihitung, isi catatan Alpha lama tidak bocor", async () => {
    pasang();
    const { getRekapHarian } = await import("./rekap");
    const { rows, stat } = await getRekapHarian("2026-10-16", "", opsiPenuh);
    const siti = rows.find((r) => r.name === "Siti")!;
    expect(siti.menunggu).toBe(true);
    expect(siti.status).toBe("kosong");
    for (const k of ["keterangan", "lampiran", "jam_masuk", "sumber"] as const) expect(siti[k], k).toBeNull();
    const hitungAlpha = rows.filter((r) => r.status === "alpha").length;
    expect(stat.alpha).toBe(hitungAlpha); // Siti tidak ikut
  });

  it("SCAN MENANG: hari yang menunggu tetapi sudah ada catatan Hadir tetap Hadir (tidak ditandai menunggu)", async () => {
    pasang();
    const { getRekapHarian } = await import("./rekap");
    const siti = (await getRekapHarian("2026-10-17", "", opsiPenuh)).rows.find((r) => r.name === "Siti")!;
    expect(siti.status).toBe("hadir");
    expect(siti.menunggu).toBeUndefined();
  });

  it("Rekap Bulanan admin, kartu Portal, dan kartu ringkasan: Menunggu tidak dihitung, ketiganya identik", async () => {
    pasang();
    const { getRekapBulanan, getRekapBulananSiswa } = await import("./rekap");
    const { getRingkasanKehadiran } = await import("./rekap-siswa");
    const adm = (await getRekapBulanan("2026-10", "", liburMap)).rows.find((r) => r.nama === "Siti")!;
    const portal = await getRekapBulananSiswa(3, "2026-10", liburMap);
    const kartu = await getRingkasanKehadiran(3, { tapel: TAPEL, semester: "ganjil", bulan: "2026-10" }, liburMap);
    expect(adm.d["2026-10-16"]).toBe("menunggu");
    expect(adm.d["2026-10-17"]).toBe("hadir");
    expect(adm.menunggu).toBe(1);
    expect(adm.ket["2026-10-16"]).toMatch(/Menunggu persetujuan/);
    expect(portal.d).toEqual(adm.d);
    expect(portal.menunggu).toBe(1);
    expect(portal.catatanMenunggu).toMatch(/1 hari menunggu persetujuan guru/);
    expect(portal.ket["2026-10-16"]).toMatch(/belum dianggap Alpha/);
    expect(kartu.stat).toEqual({ hadir: adm.hadir, terlambat: adm.terlambat, izin: adm.izin, sakit: adm.sakit, alpha: adm.alpha });
    const a = hitungRekapSiswa(bulanTgl("2026-10"), acuan(db, SISWA[2], "2026-10-01"));
    expect({ hadir: adm.hadir, alpha: adm.alpha }).toEqual({ hadir: a.hadir, alpha: a.alpha });
  });

  it("DITOLAK/DIBATALKAN (tidak lagi menunggu): hari kembali ke baseline, rekap & portal sama-sama Alpha", async () => {
    pasang();
    const { getRekapBulanan, getRekapBulananSiswa } = await import("./rekap");
    const sebelum = (await getRekapBulanan("2026-10", "", liburMap)).rows.find((r) => r.nama === "Siti")!.alpha;
    db.pengajuan_menunggu = [];
    const adm = (await getRekapBulanan("2026-10", "", liburMap)).rows.find((r) => r.nama === "Siti")!;
    const portal = await getRekapBulananSiswa(3, "2026-10", liburMap);
    expect(adm.d["2026-10-16"]).toBe("alpha");
    expect(portal.d["2026-10-16"]).toBe("alpha");
    expect(portal.catatanMenunggu).toBeNull();
    expect(adm.alpha).toBe(sebelum + 1);
  });

  it("Grafik tren: hari Menunggu tidak dihitung (sama dengan acuan)", async () => {
    pasang();
    const { getChartTren6Bulan } = await import("./history");
    const data = await getChartTren6Bulan(3);
    const a = hitungRekapSiswa(bulanTgl("2026-10"), acuan(db, SISWA[2], "2026-10-01"));
    expect(data.at(-1)).toMatchObject({ label: "Okt 2026", hadir: a.hadir + a.terlambat, alpha: a.alpha });
  });
});
