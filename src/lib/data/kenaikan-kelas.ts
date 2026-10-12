import { supabaseAdmin } from "@/lib/supabase/server";
import { ambilSemua } from "@/lib/utils/ambil-semua";
import type { SiswaKenaikan } from "@/lib/utils/kenaikan";

/** Semua siswa AKTIF (id, nama, kelas sekarang), urut kelas lalu nama. */
export async function getSiswaAktifKenaikan(): Promise<SiswaKenaikan[]> {
  return ambilSemua<SiswaKenaikan>((dari, sampai) =>
    supabaseAdmin
      .from("students")
      .select("id, name, class")
      .eq("status", "aktif")
      .order("class")
      .order("name")
      .order("id")
      .range(dari, sampai)
  );
}

export interface KenaikanTerakhir {
  id: number;
  tapelAsal: string;
  tapelTujuan: string;
  semesterAsal: string;
  semesterTujuan: string;
  dibuatPada: string;
  naik: number;
  tetap: number;
  lulus: number;
  /** Hanya true kalau tapel tujuan masih aktif dan belum punya absensi. */
  bisaDibatalkan: boolean;
}

/**
 * Kenaikan kelas terakhir yang belum dibatalkan. `siap` = false kalau tabel kenaikan_kelas belum ada
 * (migrasi 017 belum dijalankan) sehingga halaman bisa menampilkan petunjuk, bukan error.
 */
export async function getKenaikanTerakhir(
  tapelAktif: string
): Promise<{ siap: boolean; terakhir: KenaikanTerakhir | null }> {
  const { data, error } = await supabaseAdmin
    .from("kenaikan_kelas")
    .select("id, tapel_asal, semester_asal, tapel_tujuan, semester_tujuan, dibuat_pada, jumlah_naik, jumlah_tetap, jumlah_lulus")
    .is("dibatalkan_pada", null)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { siap: false, terakhir: null };
  if (!data) return { siap: true, terakhir: null };

  let bisaDibatalkan = false;
  if (data.tapel_tujuan === tapelAktif) {
    const { count } = await supabaseAdmin
      .from("absensi")
      .select("id", { count: "exact", head: true })
      .eq("tapel", data.tapel_tujuan);
    bisaDibatalkan = (count ?? 0) === 0;
  }

  return {
    siap: true,
    terakhir: {
      id: data.id,
      tapelAsal: data.tapel_asal,
      tapelTujuan: data.tapel_tujuan,
      semesterAsal: data.semester_asal,
      semesterTujuan: data.semester_tujuan,
      dibuatPada: data.dibuat_pada,
      naik: data.jumlah_naik,
      tetap: data.jumlah_tetap,
      lulus: data.jumlah_lulus,
      bisaDibatalkan,
    },
  };
}
