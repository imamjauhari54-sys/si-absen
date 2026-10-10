/**
 * Aturan murni (tanpa I/O) untuk proses scan: akses wali kelas, validasi data
 * antrean offline, dan rencana koreksi "scan paling awal menang".
 * Dipisah dari route supaya bisa dites tanpa database.
 */

/** Keterangan yang ditulis auto-alpha. Hanya alpha dengan keterangan ini yang boleh dikoreksi scan offline. */
export const KETERANGAN_ALPHA_SISTEM = "Tanpa Keterangan (Sistem)";

export type StatusMasuk = "hadir" | "terlambat";

/** Jam format HH:MM:SS (string, urut leksikografis = urut waktu). */
export function tentukanStatusMasuk(jam: string, batasTerlambat: string): StatusMasuk {
  return jam > batasTerlambat ? "terlambat" : "hadir";
}

// ── AKSES WALI KELAS ────────────────────────────────────────────────

/** Admin boleh semua kelas. Guru hanya boleh siswa di kelas yang diampunya (wali kelas). */
export function bolehScanSiswa(role: string, kelasWali: string | null, kelasSiswa: string): boolean {
  if (role === "admin") return true;
  if (role !== "guru") return false;
  if (!kelasWali) return false;
  return kelasWali.trim().toLowerCase() === String(kelasSiswa ?? "").trim().toLowerCase();
}

// ── VALIDASI DATA ANTREAN OFFLINE ───────────────────────────────────

export const SCAN_MAKS_MUNDUR_MS = 3 * 24 * 60 * 60 * 1000; // 3 hari
export const SCAN_TOLERANSI_MASA_DEPAN_MS = 2 * 60 * 1000; // 2 menit
export const SKEW_MAKS_MS = 36 * 60 * 60 * 1000; // jam perangkat boleh menyimpang maks 36 jam
export const SKEW_ABAIKAN_MS = 2 * 60 * 1000; // selisih kecil = latensi jaringan, bukan jam yang salah

// Hasil Date.toISOString() dari klien: 2026-10-08T00:10:00.000Z
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const EPOCH_MS_RE = /^\d{12,14}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type HasilScanId = { ok: true; scanId: string | null } | { ok: false; message: string };

/** scan_id = identitas unik satu item antrean (UUID dari perangkat). Opsional, tapi kalau ada harus valid. */
export function validasiScanId(raw: string): HasilScanId {
  const v = raw.trim();
  if (!v) return { ok: true, scanId: null };
  if (!UUID_RE.test(v)) return { ok: false, message: "ID antrean scan tidak valid." };
  return { ok: true, scanId: v.toLowerCase() };
}

export type HasilWaktuScan = { ok: true; waktu: Date; skewMs: number } | { ok: false; message: string };

/**
 * Validasi waktu scan dari antrean offline. `scan_at` berasal dari jam perangkat, jadi TIDAK
 * dipercaya mentah-mentah:
 *  - format harus ISO UTC yang ketat,
 *  - jam perangkat dikoreksi memakai selisih (server - perangkat) yang diukur saat pengiriman
 *    (device_now), sehingga HP dengan jam salah tetap menghasilkan waktu scan yang benar,
 *  - hasilnya tidak boleh di masa depan dan maksimal 3 hari ke belakang.
 */
export function validasiWaktuScanOffline(input: {
  scanAtRaw: string;
  deviceNowRaw: string;
  serverNowMs: number;
}): HasilWaktuScan {
  const { scanAtRaw, deviceNowRaw, serverNowMs } = input;
  if (!ISO_UTC_RE.test(scanAtRaw)) return { ok: false, message: "Format waktu scan offline tidak valid." };
  const scanAtMs = new Date(scanAtRaw).getTime();
  if (Number.isNaN(scanAtMs)) return { ok: false, message: "Format waktu scan offline tidak valid." };

  let skewMs = 0;
  if (deviceNowRaw) {
    if (!EPOCH_MS_RE.test(deviceNowRaw)) return { ok: false, message: "Waktu perangkat tidak valid." };
    skewMs = serverNowMs - Number(deviceNowRaw);
    if (Math.abs(skewMs) > SKEW_MAKS_MS) {
      return { ok: false, message: "Jam perangkat menyimpang terlalu jauh. Perbaiki jam HP lalu catat manual lewat Rekap." };
    }
    if (Math.abs(skewMs) < SKEW_ABAIKAN_MS) skewMs = 0;
  }

  const waktuMs = scanAtMs + skewMs;
  const umur = serverNowMs - waktuMs;
  if (umur < -SCAN_TOLERANSI_MASA_DEPAN_MS) return { ok: false, message: "Waktu scan offline berada di masa depan." };
  if (umur > SCAN_MAKS_MUNDUR_MS) {
    return { ok: false, message: "Scan offline lebih dari 3 hari — catat manual lewat Rekap." };
  }
  return { ok: true, waktu: new Date(waktuMs), skewMs };
}

// ── KOREKSI "SCAN PALING AWAL MENANG" ───────────────────────────────

export interface AbsenTercatat {
  status: string;
  jam_masuk: string | null;
  keterangan: string | null;
}

export type RencanaKoreksi =
  | { aksi: "tidak"; alasan: string }
  | { aksi: "koreksi"; statusBaru: StatusMasuk; jamBaru: string; alasan: "lebih_awal" | "alpha_sistem" };

/**
 * Menentukan apakah scan offline (yang baru tiba di server) harus mengoreksi absensi yang sudah
 * tercatat karena perangkat lain/scan online tiba lebih dulu.
 *  - hadir/terlambat tercatat lebih LAMBAT dari jam scan -> jam masuk diajukan, status dihitung ulang
 *  - alpha dari sistem (auto-alpha) -> menjadi hadir/terlambat sesuai jam scan
 *  - izin, sakit, dan alpha manual -> TIDAK ditimpa (keputusan manual)
 *  - scan di luar jendela masuk (terlalu pagi / sudah jam pulang) -> tidak mengoreksi
 * Keputusan akhir tetap diambil atomik di database (fungsi koreksi_absen_masuk); ini hanya
 * filter awal + penentuan status baru, yang hanya bergantung pada jam scan.
 */
export function rencanaKoreksiMasuk(p: {
  absen: AbsenTercatat | null;
  jamScan: string;
  jamBuka: string;
  jamPulangMulai: string;
  batasTerlambat: string;
}): RencanaKoreksi {
  const { absen, jamScan } = p;
  if (!absen) return { aksi: "tidak", alasan: "belum_ada_absensi" };
  if (jamScan < p.jamBuka) return { aksi: "tidak", alasan: "terlalu_pagi" };
  if (jamScan >= p.jamPulangMulai) return { aksi: "tidak", alasan: "di_luar_jendela_masuk" };

  const statusBaru = tentukanStatusMasuk(jamScan, p.batasTerlambat);

  if (absen.status === "hadir" || absen.status === "terlambat") {
    if (absen.jam_masuk && jamScan < absen.jam_masuk) {
      return { aksi: "koreksi", statusBaru, jamBaru: jamScan, alasan: "lebih_awal" };
    }
    return { aksi: "tidak", alasan: "sudah_lebih_awal" };
  }

  if (absen.status === "alpha") {
    if (absen.keterangan === KETERANGAN_ALPHA_SISTEM) {
      return { aksi: "koreksi", statusBaru, jamBaru: jamScan, alasan: "alpha_sistem" };
    }
    return { aksi: "tidak", alasan: "alpha_manual" };
  }

  return { aksi: "tidak", alasan: "status_manual" }; // izin / sakit
}
