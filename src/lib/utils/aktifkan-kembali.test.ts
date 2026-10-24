import { describe, it, expect } from "vitest";
import {
  parseAktifkanInput,
  susunDampak,
  pesanGalatAktifkan,
  modeValid,
  parseIdSiswa,
  kembaliPalingAwal,
  MODE_JEDA_DIBUKA,
  type PratinjauAktifkan,
} from "./aktifkan-kembali";

const HARI_INI = "2026-10-24";
const dasar: PratinjauAktifkan = {
  nama: "Budi",
  status: "pindah",
  alasan: "pindah",
  kelas_sekarang: "5",
  kelas_saat_pindah: "5",
  tapel_pindah: "2026/2027",
  tapel_aktif: "2026/2027",
  pindah_pada: "2026-08-15",
  lintas_tapel: false,
  hari_ini: HARI_INI,
  hari_belum_tercatat: 47,
  hari_jeda: null,
  nisn_bentrok: false,
};

describe("MODE_JEDA_DIBUKA", () => {
  it("terbuka: rekap harian/bulanan/history/portal sudah memakai aturan jeda (Langkah 3)", () => {
    expect(MODE_JEDA_DIBUKA).toBe(true);
  });
});

describe("modeValid", () => {
  it("hanya menerima dua mode", () => {
    expect(modeValid("batal_pindah")).toBe(true);
    expect(modeValid("kembali_setelah_jeda")).toBe(true);
    expect(modeValid("lintas_tapel")).toBe(false); // dipilih database, bukan admin
    expect(modeValid("langsung")).toBe(false);
    expect(modeValid(undefined)).toBe(false);
    expect(modeValid(1)).toBe(false);
  });
});

describe("parseAktifkanInput", () => {
  it("mode A: tanggal kembali diabaikan", () => {
    expect(parseAktifkanInput({ mode: "batal_pindah", kembali: "2026-10-01" }, HARI_INI)).toEqual({
      ok: true,
      mode: "batal_pindah",
      kembali: null,
    });
  });

  it("mode kosong / tidak dikenal ditolak", () => {
    expect(parseAktifkanInput({ mode: "", kembali: "" }, HARI_INI).ok).toBe(false);
    expect(parseAktifkanInput({ mode: "asal", kembali: "" }, HARI_INI).ok).toBe(false);
    expect(parseAktifkanInput({ mode: null, kembali: "" }, HARI_INI).ok).toBe(false);
  });

  it("mode B ditolak SERVER bila saklar ditutup (walau dikirim langsung)", () => {
    const r = parseAktifkanInput({ mode: "kembali_setelah_jeda", kembali: "2026-10-01" }, HARI_INI, { modeJedaDibuka: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/belum tersedia/);
  });

  it("mode B diterima dengan pengaturan bawaan (saklar terbuka)", () => {
    expect(parseAktifkanInput({ mode: "kembali_setelah_jeda", kembali: "2026-10-01" }, HARI_INI)).toMatchObject({ ok: true });
  });

  describe("mode B setelah dibuka", () => {
    const buka = { modeJedaDibuka: true };
    it("menerima tanggal kembali yang benar (termasuk hari ini)", () => {
      expect(parseAktifkanInput({ mode: "kembali_setelah_jeda", kembali: "2026-10-01" }, HARI_INI, buka)).toEqual({
        ok: true,
        mode: "kembali_setelah_jeda",
        kembali: "2026-10-01",
      });
      expect(parseAktifkanInput({ mode: "kembali_setelah_jeda", kembali: HARI_INI }, HARI_INI, buka).ok).toBe(true);
    });
    it("menolak kosong, tidak valid, dan masa depan (tanggal WIB)", () => {
      expect(parseAktifkanInput({ mode: "kembali_setelah_jeda", kembali: "" }, HARI_INI, buka)).toMatchObject({ ok: false });
      expect(parseAktifkanInput({ mode: "kembali_setelah_jeda", kembali: "2026-02-31" }, HARI_INI, buka)).toMatchObject({ ok: false });
      expect(parseAktifkanInput({ mode: "kembali_setelah_jeda", kembali: "besok" }, HARI_INI, buka)).toMatchObject({ ok: false });
      const masaDepan = parseAktifkanInput({ mode: "kembali_setelah_jeda", kembali: "2026-10-25" }, HARI_INI, buka);
      expect(masaDepan.ok).toBe(false);
      if (!masaDepan.ok) expect(masaDepan.message).toMatch(/masa depan/);
    });
  });
});

describe("susunDampak", () => {
  it("mode A: menyebut jumlah hari yang akan jadi Alpha", () => {
    const d = susunDampak(dasar, "batal_pindah", null);
    expect(d.ringkasan).toBe("Pindah sejak 15 Agu 2026");
    expect(d.peringatan.join(" ")).toMatch(/47 hari sekolah belum punya catatan/);
    expect(d.peringatan.join(" ")).toMatch(/Alpha sampai Anda koreksi/);
    expect(d.bisaLanjut).toBe(true);
  });

  it("mode A tanpa hari kosong: tidak menakut-nakuti", () => {
    const d = susunDampak({ ...dasar, hari_belum_tercatat: 0 }, "batal_pindah", null);
    expect(d.peringatan.join(" ")).toMatch(/tidak ada Alpha yang ditambahkan/);
  });

  it("lintas tapel: tapel lama utuh + minta admin memastikan kelas sekarang", () => {
    const d = susunDampak(
      { ...dasar, lintas_tapel: true, tapel_pindah: "2025/2026", kelas_saat_pindah: "5", kelas_sekarang: "6", hari_belum_tercatat: 0 },
      "batal_pindah",
      null
    );
    expect(d.ringkasan).toMatch(/tapel 2025\/2026.*tetap utuh.*tapel 2026\/2027/);
    expect(d.peringatan.join(" ")).toMatch(/Kelas siswa sekarang: 6.*saat pindah: 5/);
    expect(d.peringatan.join(" ")).not.toMatch(/Alpha/); // tidak ada pengisian Alpha lintas tapel
  });

  it("mode B: menjelaskan hari jeda yang tidak dihitung", () => {
    const d = susunDampak({ ...dasar, hari_jeda: 12 }, "kembali_setelah_jeda", "2026-09-10");
    expect(d.peringatan.join(" ")).toMatch(/12 hari sekolah \(15 Agu 2026 sampai sebelum 10 Sep 2026\) tidak dihitung/);
  });

  it("NISN bentrok mematikan konfirmasi", () => {
    const d = susunDampak({ ...dasar, nisn_bentrok: true }, "batal_pindah", null);
    expect(d.bisaLanjut).toBe(false);
    expect(d.peringatan.join(" ")).toMatch(/NISN/);
  });

  it("tanpa tanggal tercatat: tidak mengarang tanggal atau jumlah Alpha", () => {
    const d = susunDampak({ ...dasar, pindah_pada: null, hari_belum_tercatat: 0 }, "batal_pindah", null);
    expect(d.ringkasan).toMatch(/tanpa tanggal tercatat/);
    expect(d.peringatan.join(" ")).not.toMatch(/Alpha/);
  });

  it("lulus memakai label Lulus", () => {
    expect(susunDampak({ ...dasar, alasan: "lulus" }, "batal_pindah", null).ringkasan).toMatch(/^Lulus sejak/);
  });
});

describe("pesanGalatAktifkan", () => {
  it("permintaan ganda / admin lain lebih dulu = bukan kegagalan", () => {
    expect(pesanGalatAktifkan({ message: "Siswa ini sudah aktif.", code: "P0001" }).status).toBe("sudah_aktif");
  });
  it("NISN bentrok", () => {
    const g = pesanGalatAktifkan({ message: 'duplicate key value violates unique constraint "idx_students_nisn_aktif"', code: "23505" });
    expect(g.status).toBe("error");
    expect(g.message).toMatch(/NISN/);
  });
  it("migrasi belum dijalankan", () => {
    expect(pesanGalatAktifkan({ message: "x", code: "PGRST202" }).message).toMatch(/migrasi 025/);
  });
  it("admin tidak ada di tabel users (FK)", () => {
    expect(pesanGalatAktifkan({ message: "violates foreign key", code: "23503" }).message).toMatch(/login ulang/);
  });
  it("deadlock / lock timeout: pesan ramah", () => {
    expect(pesanGalatAktifkan({ message: "deadlock detected", code: "40P01" }).message).toMatch(/sibuk/);
  });
  it("galat lain diteruskan apa adanya", () => {
    expect(pesanGalatAktifkan({ message: "Tapel aktif belum diatur.", code: "P0001" })).toEqual({
      status: "error",
      message: "Tapel aktif belum diatur.",
    });
  });
});

describe("parseIdSiswa", () => {
  it("menerima hanya angka positif utuh", () => {
    expect(parseIdSiswa("9")).toBe(9);
    expect(parseIdSiswa("1234")).toBe(1234);
  });
  it("menolak sampah di belakang/di depan angka (parseInt dulu meloloskannya)", () => {
    for (const x of ["9abc", "abc9", "9 ", " 9", "9.5", "1e3", "0x1F", "+9", "-9", "09", "0", "", "9;drop", "٣"]) {
      expect(parseIdSiswa(x), JSON.stringify(x)).toBeNull();
    }
  });
  it("menolak angka di atas batas aman JavaScript", () => {
    expect(parseIdSiswa("9007199254740993")).toBeNull();
    expect(parseIdSiswa("99999999999999999999")).toBeNull();
  });
});

describe("kembaliPalingAwal", () => {
  it("sehari SESUDAH tanggal pindah (tanggal pindah sendiri tidak boleh)", () => {
    expect(kembaliPalingAwal("2026-08-15")).toBe("2026-08-16");
    expect(kembaliPalingAwal("2026-08-31")).toBe("2026-09-01");
    expect(kembaliPalingAwal("2026-12-31")).toBe("2027-01-01");
  });
  it("tanpa tanggal pindah: tidak ada batas bawah", () => {
    expect(kembaliPalingAwal(null)).toBeUndefined();
  });
});

describe("susunDampak mode B: kapan konfirmasi boleh", () => {
  const B = "kembali_setelah_jeda" as const;
  const sah = { ...dasar, hari_jeda: 12 };

  it("sah: kembali sesudah pindah dan database sukses menghitung", () => {
    expect(susunDampak(sah, B, "2026-09-10").bisaLanjut).toBe(true);
  });
  it("sah: kembali tepat sehari sesudah pindah, 0 hari jeda (hari_jeda=0 bukan 'tidak diketahui')", () => {
    const d = susunDampak({ ...dasar, hari_jeda: 0 }, B, "2026-08-16");
    expect(d.bisaLanjut).toBe(true);
    expect(d.peringatan.join(" ")).toMatch(/0 hari sekolah/);
  });
  it("sah: kembali hari ini", () => {
    expect(susunDampak({ ...dasar, hari_jeda: 50 }, B, HARI_INI).bisaLanjut).toBe(true);
  });
  it("DITOLAK: kembali sama dengan tanggal pindah", () => {
    const d = susunDampak({ ...sah, hari_jeda: null }, B, "2026-08-15");
    expect(d.bisaLanjut).toBe(false);
    expect(d.peringatan.join(" ")).toMatch(/harus sesudah tanggal pindah.*16 Agu 2026/);
  });
  it("DITOLAK: kembali sebelum tanggal pindah", () => {
    expect(susunDampak({ ...sah, hari_jeda: null }, B, "2026-08-01").bisaLanjut).toBe(false);
  });
  it("DITOLAK: kembali di masa depan", () => {
    const d = susunDampak(sah, B, "2026-10-25");
    expect(d.bisaLanjut).toBe(false);
    expect(d.peringatan.join(" ")).toMatch(/masa depan/);
  });
  it("DITOLAK: tanggal kembali kosong", () => {
    expect(susunDampak({ ...sah, hari_jeda: null }, B, null).bisaLanjut).toBe(false);
  });
  it("DITOLAK: database tidak bisa menghitung dampak (hari_jeda null) walau tanggal tampak benar", () => {
    const d = susunDampak({ ...sah, hari_jeda: null }, B, "2026-09-10");
    expect(d.bisaLanjut).toBe(false);
    expect(d.peringatan.join(" ")).toMatch(/belum dapat dihitung/);
  });
  it("DITOLAK: tidak ada tanggal pindah tercatat -> mode jeda tidak bermakna", () => {
    const d = susunDampak({ ...sah, pindah_pada: null }, B, "2026-09-10");
    expect(d.bisaLanjut).toBe(false);
    expect(d.peringatan.join(" ")).toMatch(/Tidak jadi pindah/);
  });
  it("lintas tapel: mode diabaikan database, jadi tidak boleh memblokir", () => {
    expect(susunDampak({ ...dasar, lintas_tapel: true, hari_jeda: null }, B, null).bisaLanjut).toBe(true);
  });
  it("mode A tidak terpengaruh aturan tanggal kembali", () => {
    expect(susunDampak({ ...dasar, hari_jeda: null }, "batal_pindah", null).bisaLanjut).toBe(true);
  });
});
