import { supabaseAdmin } from "@/lib/supabase/server";
import { ambilSemua } from "@/lib/utils/ambil-semua";
import { getAbsensiSetting } from "@/lib/data/dashboard";
import { tapelDariTanggal } from "@/lib/utils/tapel";

/**
 * Riwayat kelas per tapel (tabel riwayat_kelas, migrasi 016).
 *
 * students.class = kelas SEKARANG (dipakai scan, dashboard, daftar siswa).
 * riwayat_kelas  = kelas siswa PADA tapel tertentu (dipakai Rekap & History tapel lama).
 */

export type AlasanNonaktif = "lulus" | "pindah";

export interface SiswaTapel {
  siswa_id: number;
  nama: string;
  kelas: string;
  nisn: string | null;
  /** Tanggal pindah = hari terakhir siswa TAMPIL, absensi pada tanggal itu tidak dihitung (eksklusif), YYYY-MM-DD; null = penuh sepanjang tapel. Migrasi 020/024. */
  nonaktif_pada: string | null;
  alasan_nonaktif: AlasanNonaktif | null;
}

const PETUNJUK_MIGRASI = "Pastikan migrasi 016_riwayat_kelas.sql sudah dijalankan.";

/**
 * Tapel yang berlaku pada suatu tanggal = tapel yang tertera di record absensi tanggal itu
 * (itu yang dipakai rekap-history). Kalau belum ada record (mis. hari ini sebelum scan pertama),
 * pakai tapel aktif. Sengaja BUKAN dihitung dari kalender: tapel di record mengikuti setting
 * aktif saat scan, dan bisa saja belum diganti persis di bulan Juli.
 */
export async function tapelUntukTanggal(tanggal: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("absensi")
    .select("tapel")
    .eq("tanggal", tanggal)
    .not("tapel", "is", null)
    .limit(1)
    .maybeSingle();
  if (data?.tapel) return data.tapel;

  const setting = await getAbsensiSetting();
  return setting.tapel ?? tapelDariTanggal(tanggal);
}

/** Sama seperti tapelUntukTanggal, untuk satu bulan ("YYYY-MM"): ambil dari record terbaru bulan itu. */
export async function tapelUntukBulan(bulanYYYYMM: string): Promise<string> {
  const [y, m] = bulanYYYYMM.split("-").map(Number);
  const awal = `${bulanYYYYMM}-01`;
  const akhir = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10); // hari pertama bulan berikutnya

  const { data } = await supabaseAdmin
    .from("absensi")
    .select("tapel")
    .gte("tanggal", awal)
    .lt("tanggal", akhir)
    .not("tapel", "is", null)
    .order("tanggal", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data?.tapel) return data.tapel;

  const setting = await getAbsensiSetting();
  return setting.tapel ?? tapelDariTanggal(awal);
}

/** Daftar kelas yang ada pada tapel itu (untuk dropdown filter kelas di Rekap). */
export async function getKelasTapel(tapel: string): Promise<string[]> {
  if (!tapel) return [];
  const { data, error } = await supabaseAdmin.rpc("kelas_tapel", { p_tapel: tapel });
  if (error) throw new Error(`Gagal mengambil daftar kelas: ${error.message}. ${PETUNJUK_MIGRASI}`);
  return ((data ?? []) as { kelas: string }[]).map((r) => r.kelas);
}

/**
 * SEMUA siswa pada tapel itu (opsional difilter kelas pada tapel itu), urut kelas lalu nama.
 * Diambil per 1000 baris (batas PostgREST) sampai habis; paginasi tampilan dilakukan pemanggil.
 */
export async function getSiswaTapel(tapel: string, kelas = ""): Promise<SiswaTapel[]> {
  if (!tapel) return [];
  try {
    const rows = await ambilSemua<Omit<SiswaTapel, "nonaktif_pada" | "alasan_nonaktif"> & Partial<SiswaTapel>>((dari, sampai) =>
      supabaseAdmin.rpc("siswa_tapel", { p_tapel: tapel, p_kelas: kelas || null }).range(dari, sampai)
    );
    // Sebelum migrasi 020 kedua kolom belum ada: anggap kosong supaya Rekap tetap jalan.
    return rows.map((r) => ({ ...r, nonaktif_pada: r.nonaktif_pada ?? null, alasan_nonaktif: r.alasan_nonaktif ?? null }));
  } catch (e) {
    const pesan = e instanceof Error ? e.message : String(e);
    throw new Error(`${pesan}. ${PETUNJUK_MIGRASI}`);
  }
}

/** Kelas satu siswa pada tapel tertentu; null kalau tidak ada riwayatnya. */
export async function getKelasSiswaPadaTapel(siswaId: number, tapel: string): Promise<string | null> {
  if (!tapel) return null;
  const { data } = await supabaseAdmin
    .from("riwayat_kelas")
    .select("kelas")
    .eq("siswa_id", siswaId)
    .eq("tapel", tapel)
    .maybeSingle();
  return data?.kelas ?? null;
}

export interface RiwayatKelasSiswa {
  tapel: string;
  kelas: string;
}

/** Perjalanan kelas satu siswa dari tapel ke tapel, terbaru dulu. */
export async function getRiwayatKelasSiswa(siswaId: number): Promise<RiwayatKelasSiswa[]> {
  const { data } = await supabaseAdmin
    .from("riwayat_kelas")
    .select("tapel, kelas")
    .eq("siswa_id", siswaId)
    .order("tapel", { ascending: false });
  return (data ?? []) as RiwayatKelasSiswa[];
}
