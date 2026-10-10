import { describe, it, expect } from "vitest";
import {
  KETERANGAN_ALPHA_SISTEM,
  bolehScanSiswa,
  rencanaKoreksiMasuk,
  tentukanStatusMasuk,
  validasiScanId,
  validasiWaktuScanOffline,
} from "./absen-scan";

const SETTING = { jamBuka: "06:00:00", jamPulangMulai: "11:30:00", batasTerlambat: "07:15:00" };

describe("tentukanStatusMasuk", () => {
  it("tepat di batas = hadir, lewat satu detik = terlambat", () => {
    expect(tentukanStatusMasuk("07:15:00", "07:15:00")).toBe("hadir");
    expect(tentukanStatusMasuk("07:15:01", "07:15:00")).toBe("terlambat");
  });
});

describe("bolehScanSiswa (akses wali kelas)", () => {
  it("admin boleh semua kelas", () => {
    expect(bolehScanSiswa("admin", null, "6")).toBe(true);
  });
  it("guru boleh siswa kelasnya sendiri", () => {
    expect(bolehScanSiswa("guru", "5", "5")).toBe(true);
    expect(bolehScanSiswa("guru", " 5A ", "5a")).toBe(true); // spasi & huruf besar-kecil diabaikan
  });
  it("guru ditolak untuk kelas lain", () => {
    expect(bolehScanSiswa("guru", "5", "6")).toBe(false);
    expect(bolehScanSiswa("guru", "5", "5A")).toBe(false); // bukan awalan-cocok
  });
  it("guru tanpa kelas wali ditolak; role lain ditolak", () => {
    expect(bolehScanSiswa("guru", null, "5")).toBe(false);
    expect(bolehScanSiswa("siswa", "5", "5")).toBe(false);
  });
});

describe("rencanaKoreksiMasuk — scan paling awal menang", () => {
  const koreksi = (absen: Parameters<typeof rencanaKoreksiMasuk>[0]["absen"], jamScan: string) =>
    rencanaKoreksiMasuk({ absen, jamScan, ...SETTING });

  it("offline 07.10, online tercatat 07.20 (terlambat) -> jam 07.10 & status hadir", () => {
    const r = koreksi({ status: "terlambat", jam_masuk: "07:20:00", keterangan: null }, "07:10:00");
    expect(r).toEqual({ aksi: "koreksi", statusBaru: "hadir", jamBaru: "07:10:00", alasan: "lebih_awal" });
  });

  it("offline 07.10, online tercatat 07.12 (hadir) -> hanya jam digeser, status tetap hadir", () => {
    const r = koreksi({ status: "hadir", jam_masuk: "07:12:00", keterangan: null }, "07:10:00");
    expect(r).toMatchObject({ aksi: "koreksi", statusBaru: "hadir", jamBaru: "07:10:00" });
  });

  it("scan offline LEBIH LAMBAT dari yang tercatat -> tidak mengubah apa pun", () => {
    expect(koreksi({ status: "hadir", jam_masuk: "07:05:00", keterangan: null }, "07:10:00")).toMatchObject({ aksi: "tidak" });
    expect(koreksi({ status: "hadir", jam_masuk: "07:10:00", keterangan: null }, "07:10:00")).toMatchObject({ aksi: "tidak" }); // sama = idempoten
  });

  it("alpha otomatis (cron) + scan offline valid -> dikoreksi jadi hadir", () => {
    const r = koreksi({ status: "alpha", jam_masuk: null, keterangan: KETERANGAN_ALPHA_SISTEM }, "07:10:00");
    expect(r).toEqual({ aksi: "koreksi", statusBaru: "hadir", jamBaru: "07:10:00", alasan: "alpha_sistem" });
  });

  it("alpha otomatis + scan offline 07.30 -> dikoreksi jadi terlambat sesuai jam scan", () => {
    const r = koreksi({ status: "alpha", jam_masuk: null, keterangan: KETERANGAN_ALPHA_SISTEM }, "07:30:00");
    expect(r).toMatchObject({ aksi: "koreksi", statusBaru: "terlambat", jamBaru: "07:30:00" });
  });

  it("alpha otomatis tetapi scan SETELAH batas jam pulang -> tidak dikoreksi", () => {
    expect(koreksi({ status: "alpha", jam_masuk: null, keterangan: KETERANGAN_ALPHA_SISTEM }, "11:30:00")).toMatchObject({ aksi: "tidak" });
    expect(koreksi({ status: "alpha", jam_masuk: null, keterangan: KETERANGAN_ALPHA_SISTEM }, "12:10:00")).toMatchObject({ aksi: "tidak" });
  });

  it("scan sebelum sistem dibuka (terlalu pagi) -> tidak dikoreksi", () => {
    expect(koreksi({ status: "terlambat", jam_masuk: "07:20:00", keterangan: null }, "05:30:00")).toMatchObject({ aksi: "tidak", alasan: "terlalu_pagi" });
  });

  it("izin & sakit TIDAK ditimpa (keputusan manual)", () => {
    expect(koreksi({ status: "izin", jam_masuk: null, keterangan: "Acara keluarga" }, "07:10:00")).toMatchObject({ aksi: "tidak", alasan: "status_manual" });
    expect(koreksi({ status: "sakit", jam_masuk: null, keterangan: "Demam" }, "07:10:00")).toMatchObject({ aksi: "tidak", alasan: "status_manual" });
  });

  it("alpha manual (bukan dari sistem) TIDAK ditimpa", () => {
    expect(koreksi({ status: "alpha", jam_masuk: null, keterangan: "Tidak ada kabar dari orang tua" }, "07:10:00")).toMatchObject({ aksi: "tidak", alasan: "alpha_manual" });
  });

  it("belum ada absensi -> bukan urusan koreksi", () => {
    expect(koreksi(null, "07:10:00")).toMatchObject({ aksi: "tidak" });
  });
});

describe("validasiWaktuScanOffline — scan_at tidak dipercaya mentah", () => {
  const SERVER = Date.parse("2026-10-08T01:30:00.000Z"); // 08.30 WIB
  const ok = (scanAtRaw: string, deviceNowRaw = "") => validasiWaktuScanOffline({ scanAtRaw, deviceNowRaw, serverNowMs: SERVER });

  it("menerima waktu wajar beberapa jam lalu", () => {
    const r = ok("2026-10-07T23:55:00.000Z");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.waktu.toISOString()).toBe("2026-10-07T23:55:00.000Z");
  });

  it("menolak format tidak ketat / bukan ISO UTC", () => {
    for (const bad of ["", "kemarin", "2026-10-08", "2026-10-08 06:55:00", "2026-10-08T06:55:00+07:00", "1791432327322"]) {
      expect(ok(bad).ok).toBe(false);
    }
  });

  it("menolak waktu di masa depan (di luar toleransi 2 menit) dan menerima dalam toleransi", () => {
    expect(ok("2026-10-08T01:40:00.000Z").ok).toBe(false);
    expect(ok("2026-10-08T01:31:00.000Z").ok).toBe(true);
  });

  it("menolak scan lebih dari 3 hari yang lalu", () => {
    expect(ok("2026-10-04T23:00:00.000Z").ok).toBe(false);
    expect(ok("2026-10-05T23:00:00.000Z").ok).toBe(true);
  });

  it("jam HP salah +2 jam: dikoreksi memakai selisih server-perangkat saat dikirim", () => {
    // HP menunjukkan 10.30 saat server 08.30 -> HP maju 2 jam. Scan dicatat HP 09.10 -> aslinya 07.10.
    const deviceNow = String(SERVER + 2 * 3600 * 1000);
    const r = ok(new Date(SERVER + 40 * 60 * 1000).toISOString(), deviceNow); // HP: 09.10 WIB-equivalent
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.skewMs).toBe(-2 * 3600 * 1000);
      expect(r.waktu.toISOString()).toBe("2026-10-08T00:10:00.000Z"); // 07.10 WIB
    }
  });

  it("selisih kecil (latensi) diabaikan, tidak menggeser waktu scan", () => {
    const r = ok("2026-10-07T23:55:00.000Z", String(SERVER - 800));
    expect(r.ok && r.skewMs).toBe(0);
  });

  it("menolak jam perangkat yang menyimpang lebih dari 36 jam / device_now rusak", () => {
    expect(ok("2026-10-07T23:55:00.000Z", String(SERVER - 40 * 3600 * 1000)).ok).toBe(false);
    expect(ok("2026-10-07T23:55:00.000Z", "abc").ok).toBe(false);
  });
});

describe("validasiScanId", () => {
  it("kosong = tidak ada (klien lama), UUID valid diterima & dinormalkan", () => {
    expect(validasiScanId("")).toEqual({ ok: true, scanId: null });
    expect(validasiScanId("3F2504E0-4F89-41D3-9A0C-0305E82C3301")).toEqual({ ok: true, scanId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301" });
  });
  it("menolak ID yang bukan UUID (mis. disisipi teks)", () => {
    expect(validasiScanId("abc").ok).toBe(false);
    expect(validasiScanId("3f2504e0-4f89-41d3-9a0c-0305e82c3301; drop table").ok).toBe(false);
  });
});
