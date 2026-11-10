import { supabaseAdmin } from "@/lib/supabase/server";
import { getLiburSet } from "@/lib/data/hari-libur";
import { ambilBatasPindahSiswa } from "@/lib/data/nonaktif";
import { ambilJedaSiswa } from "@/lib/data/jeda";
import { todayJakarta } from "@/lib/utils/tanggal";
import { tapelDariTanggal } from "@/lib/utils/tapel";
import {
  daftarTanggalRentang,
  hitungRekapSiswa,
  rentangFilter,
  type KonteksSiswa,
  type RekapSiswa,
} from "@/lib/utils/rekap-siswa";
import type { StatHistory } from "@/lib/data/history";

/**
 * Pemuat data untuk fungsi hitung bersama (utils/rekap-siswa.ts) pada SATU siswa. Dipakai kartu Rekap Bulanan,
 * kartu ringkasan atas, dan grafik tren, di Portal Siswa maupun halaman riwayat admin, agar angkanya selalu sama.
 */

/**
 * Tanggal catatan PERTAMA tiap siswa pada tapel itu (fungsi SQL awal_catatan_siswa, migrasi 026): siswa -> tanggal.
 * SATU sumber batas awal untuk semua tampilan (portal, kartu atas, harian, bulanan admin, grafik). Siswa yang TIDAK ada
 * di hasil belum punya catatan di tapel itu: pemanggil memberi `mulai: null` (semua hari kosong), BUKAN dianggap masuk
 * sejak awal tapel. Sengaja tanpa cadangan diam-diam: bila migrasi 026 belum dijalankan, galatnya jelas.
 */
export async function ambilMulaiBanyak(tapel: string, ids: number[]): Promise<Map<number, string>> {
  const peta = new Map<number, string>();
  if (ids.length === 0) return peta;
  const { data, error } = await supabaseAdmin.rpc("awal_catatan_siswa", { p_tapel: tapel, p_ids: ids });
  if (error) throw new Error(`Gagal membaca catatan pertama siswa: ${error.message}. Pastikan migrasi 026 sudah dijalankan.`);
  for (const r of (data ?? []) as { siswa_id: number; mulai: string }[]) peta.set(r.siswa_id, r.mulai);
  return peta;
}

/**
 * Tanggal berstatus MENUNGGU per siswa (fungsi SQL tanggal_menunggu, migrasi 027): siswa -> himpunan tanggal. Pengajuan izin/sakit
 * yang belum diputuskan membuat harinya "Menunggu" (tidak dihitung, bukan Alpha). Bila migrasi 027 belum dijalankan fitur
 * pengajuan memang belum ada, jadi hasil kosong (PGRST202); galat lain dilempar agar angka tidak diam-diam keliru.
 */
export async function ambilMenungguBanyak(ids: number[], dari: string, sampai: string): Promise<Map<number, Set<string>>> {
  const peta = new Map<number, Set<string>>();
  if (ids.length === 0) return peta;
  const { data, error } = await supabaseAdmin.rpc("tanggal_menunggu", { p_siswa_ids: ids, p_dari: dari, p_sampai: sampai });
  if (error) {
    if (error.code === "PGRST202") return peta;
    throw new Error(`Gagal membaca pengajuan yang menunggu: ${error.message}`);
  }
  for (const r of (data ?? []) as { siswa_id: number; tanggal: string }[]) {
    if (!peta.has(r.siswa_id)) peta.set(r.siswa_id, new Set());
    peta.get(r.siswa_id)!.add(r.tanggal);
  }
  return peta;
}

export interface DataSiswaRentang {
  konteks: KonteksSiswa;
  jeda: Awaited<ReturnType<typeof ambilJedaSiswa>>;
}

/** Memuat semua yang dibutuhkan fungsi hitung untuk satu siswa pada [dari, sampai] (satu tapel). */
export async function muatKonteksSiswa(
  siswaId: number,
  dari: string,
  sampai: string,
  liburOpsional?: { has(t: string): boolean }
): Promise<DataSiswaRentang> {
  const tapel = tapelDariTanggal(dari);
  const [{ data }, libur, batasPindah, jeda, mulai, menungguMap] = await Promise.all([
    supabaseAdmin.from("absensi").select("tanggal, status").eq("siswa_id", siswaId).gte("tanggal", dari).lte("tanggal", sampai),
    liburOpsional ? Promise.resolve(liburOpsional) : getLiburSet(),
    ambilBatasPindahSiswa(siswaId),
    ambilJedaSiswa(siswaId),
    ambilMulaiBanyak(tapel, [siswaId]).then((m) => m.get(siswaId) ?? null),
    ambilMenungguBanyak([siswaId], dari, sampai),
  ]);
  const konteks: KonteksSiswa = {
    today: todayJakarta(),
    libur,
    absensi: new Map((data ?? []).map((r) => [r.tanggal as string, r.status as string])),
    batasPindah,
    jeda,
    mulai,
    menunggu: menungguMap.get(siswaId) ?? new Set<string>(),
  };
  return { konteks, jeda };
}

/** Rekap satu siswa untuk daftar tanggal (satu bulan / satu rentang), memakai fungsi hitung bersama. */
export async function getRekapSiswaRentang(
  siswaId: number,
  tglList: string[],
  liburOpsional?: { has(t: string): boolean }
): Promise<{ rekap: RekapSiswa; jeda: DataSiswaRentang["jeda"]; konteks: KonteksSiswa }> {
  if (tglList.length === 0) {
    const kosong = hitungRekapSiswa([], { today: todayJakarta(), libur: new Set(), absensi: new Map() });
    return { rekap: kosong, jeda: [], konteks: { today: todayJakarta(), libur: new Set(), absensi: new Map() } };
  }
  const { konteks, jeda } = await muatKonteksSiswa(siswaId, tglList[0], tglList[tglList.length - 1], liburOpsional);
  return { rekap: hitungRekapSiswa(tglList, konteks), jeda, konteks };
}

export interface RingkasanKehadiran {
  stat: StatHistory;
  /** Jumlah hari yang dihitung (penyebut persentase). */
  totalHari: number;
}

/**
 * Kartu ringkasan di atas (hadir/terlambat/izin/sakit/alpha + persentase) untuk filter tapel/semester/bulan,
 * dengan fungsi hitung YANG SAMA dengan Rekap Bulanan. Tanpa rentang yang jelas (tapel dan bulan kosong) hasilnya nol.
 */
export async function getRingkasanKehadiran(
  siswaId: number,
  filter: { tapel?: string; semester?: string; bulan?: string },
  liburOpsional?: { has(t: string): boolean }
): Promise<RingkasanKehadiran> {
  const r = rentangFilter(filter);
  const nol: RingkasanKehadiran = { stat: { hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpha: 0 }, totalHari: 0 };
  if (!r) return nol;
  const { rekap } = await getRekapSiswaRentang(siswaId, daftarTanggalRentang(r.dari, r.sampai), liburOpsional);
  return {
    stat: { hadir: rekap.hadir, terlambat: rekap.terlambat, izin: rekap.izin, sakit: rekap.sakit, alpha: rekap.alpha },
    totalHari: rekap.hariDihitung,
  };
}
