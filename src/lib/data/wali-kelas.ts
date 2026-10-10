import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Kelas yang diampu guru sebagai wali kelas (mapel 'Guru Kelas'), dibaca LANGSUNG dari database.
 * Sengaja tidak memakai session.kelas: JWT berlaku 8 jam, jadi kalau admin memindahkan guru ke
 * kelas lain, token lama masih membawa kelas lama. Mengembalikan null kalau bukan wali kelas
 * (atau datanya ambigu) -> akses ditolak.
 */
export async function getKelasWali(guruId: number): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("guru_mengajar_kelas")
    .select("class")
    .eq("guru_id", guruId)
    .eq("mapel", "Guru Kelas")
    .maybeSingle();
  return data?.class ?? null;
}
