import { supabaseAdmin } from "@/lib/supabase/server";
import { normalizeKelas } from "@/lib/utils/kelas";

export interface KelasMasterRow {
  id: number;
  nama: string;
  jumlahSiswa: number;
  jumlahLaki: number;
  jumlahPerempuan: number;
  waliKelas: string | null;
}

/** Daftar nama kelas saja (buat dropdown/picker). */
export async function getKelasMasterList(): Promise<string[]> {
  const { data } = await supabaseAdmin.from("kelas_master").select("nama").order("nama", { ascending: true });
  return (data ?? []).map((r) => r.nama);
}

/** Daftar kelas beserta jumlah siswa (+ rincian L/P) dan wali kelasnya (buat halaman Kelola Kelas). */
export async function getKelasMasterDetail(): Promise<KelasMasterRow[]> {
  const [{ data: kelas }, { data: siswa }, { data: waliRows }] = await Promise.all([
    supabaseAdmin.from("kelas_master").select("id, nama").order("nama", { ascending: true }),
    supabaseAdmin.from("students").select("class, jenis_kelamin"),
    supabaseAdmin.from("guru_mengajar_kelas").select("class, guru_id").eq("mapel", "Guru Kelas"),
  ]);

  const counts = new Map<string, number>();
  const countsLaki = new Map<string, number>();
  const countsPerempuan = new Map<string, number>();
  for (const s of siswa ?? []) {
    counts.set(s.class, (counts.get(s.class) ?? 0) + 1);
    if (s.jenis_kelamin === "L") countsLaki.set(s.class, (countsLaki.get(s.class) ?? 0) + 1);
    else if (s.jenis_kelamin === "P") countsPerempuan.set(s.class, (countsPerempuan.get(s.class) ?? 0) + 1);
  }

  // class -> guru_id (wali kelas), lalu resolve nama guru-nya lewat query kedua
  const kelasKeGuruId = new Map<string, number>();
  for (const row of waliRows ?? []) kelasKeGuruId.set(row.class, row.guru_id);

  const guruIds = Array.from(new Set(Array.from(kelasKeGuruId.values())));
  const namaGuruMap = new Map<number, string>();
  if (guruIds.length > 0) {
    const { data: guruRows } = await supabaseAdmin.from("users").select("id, name").in("id", guruIds);
    for (const g of guruRows ?? []) namaGuruMap.set(g.id, g.name);
  }

  return (kelas ?? []).map((k) => {
    const guruId = kelasKeGuruId.get(k.nama);
    return {
      id: k.id,
      nama: k.nama,
      jumlahSiswa: counts.get(k.nama) ?? 0,
      jumlahLaki: countsLaki.get(k.nama) ?? 0,
      jumlahPerempuan: countsPerempuan.get(k.nama) ?? 0,
      waliKelas: guruId ? namaGuruMap.get(guruId) ?? null : null,
    };
  });
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
