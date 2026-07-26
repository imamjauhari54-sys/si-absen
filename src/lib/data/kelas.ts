import { supabaseAdmin } from "@/lib/supabase/server";
import { normalizeKelas } from "@/lib/utils/kelas";

export interface KelasMasterRow {
  id: number;
  nama: string;
  jumlahSiswa: number;
}

/** Daftar nama kelas saja (buat dropdown/picker). */
export async function getKelasMasterList(): Promise<string[]> {
  const { data } = await supabaseAdmin.from("kelas_master").select("nama").order("nama", { ascending: true });
  return (data ?? []).map((r) => r.nama);
}

/** Daftar kelas beserta jumlah siswanya (buat halaman Kelola Kelas). */
export async function getKelasMasterDetail(): Promise<KelasMasterRow[]> {
  const [{ data: kelas }, { data: siswa }] = await Promise.all([
    supabaseAdmin.from("kelas_master").select("id, nama").order("nama", { ascending: true }),
    supabaseAdmin.from("students").select("class"),
  ]);

  const counts = new Map<string, number>();
  for (const s of siswa ?? []) counts.set(s.class, (counts.get(s.class) ?? 0) + 1);

  return (kelas ?? []).map((k) => ({ id: k.id, nama: k.nama, jumlahSiswa: counts.get(k.nama) ?? 0 }));
}

/** Daftarkan nama kelas ke master kalau belum ada. Dipakai otomatis saat simpan siswa/guru. */
export async function upsertKelasMaster(namaMentah: string): Promise<void> {
  const nama = normalizeKelas(namaMentah);
  if (!nama) return;
  await supabaseAdmin.from("kelas_master").upsert({ nama }, { onConflict: "nama", ignoreDuplicates: true });
}

export async function tambahKelasMaster(namaMentah: string): Promise<{ error: string | null }> {
  const nama = normalizeKelas(namaMentah);
  if (!nama) return { error: "Nama kelas wajib diisi." };

  const { data: dup } = await supabaseAdmin.from("kelas_master").select("id").eq("nama", nama).maybeSingle();
  if (dup) return { error: "Kelas ini sudah ada di daftar." };

  const { error } = await supabaseAdmin.from("kelas_master").insert({ nama });
  return { error: error?.message ?? null };
}

/** Ganti nama kelas + otomatis sinkron ke data siswa & wali kelas yang memakai nama lama. */
export async function renameKelasMaster(id: number, namaBaruMentah: string): Promise<{ error: string | null }> {
  const namaBaru = normalizeKelas(namaBaruMentah);
  if (!namaBaru) return { error: "Nama kelas wajib diisi." };

  const { data: existing } = await supabaseAdmin.from("kelas_master").select("nama").eq("id", id).maybeSingle();
  if (!existing) return { error: "Kelas tidak ditemukan." };
  const namaLama = existing.nama;
  if (namaLama === namaBaru) return { error: null };

  const { data: dup } = await supabaseAdmin.from("kelas_master").select("id").eq("nama", namaBaru).neq("id", id).maybeSingle();
  if (dup) return { error: "Nama kelas tersebut sudah dipakai kelas lain." };

  const { error } = await supabaseAdmin.from("kelas_master").update({ nama: namaBaru }).eq("id", id);
  if (error) return { error: error.message };

  await Promise.all([
    supabaseAdmin.from("students").update({ class: namaBaru }).eq("class", namaLama),
    supabaseAdmin.from("guru_mengajar_kelas").update({ class: namaBaru }).eq("class", namaLama),
  ]);

  return { error: null };
}

/** Hapus kelas dari master. Ditolak kalau masih ada siswa/wali kelas yang memakainya. */
export async function hapusKelasMaster(id: number): Promise<{ error: string | null }> {
  const { data: k } = await supabaseAdmin.from("kelas_master").select("nama").eq("id", id).maybeSingle();
  if (!k) return { error: "Kelas tidak ditemukan." };

  const { count: jumlahSiswa } = await supabaseAdmin
    .from("students")
    .select("id", { count: "exact", head: true })
    .eq("class", k.nama);
  if ((jumlahSiswa ?? 0) > 0) {
    return { error: `Tidak bisa dihapus, masih ada ${jumlahSiswa} siswa di kelas ini. Pindahkan siswanya dulu.` };
  }

  const { count: jumlahGuru } = await supabaseAdmin
    .from("guru_mengajar_kelas")
    .select("id", { count: "exact", head: true })
    .eq("class", k.nama);
  if ((jumlahGuru ?? 0) > 0) {
    return { error: "Tidak bisa dihapus, masih ada guru yang jadi wali kelas ini. Ganti wali kelasnya dulu." };
  }

  const { error } = await supabaseAdmin.from("kelas_master").delete().eq("id", id);
  return { error: error?.message ?? null };
}
