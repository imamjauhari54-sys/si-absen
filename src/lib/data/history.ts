import { ambilBatasPindahSiswa } from "@/lib/data/nonaktif";
import { ambilJedaSiswa } from "@/lib/data/jeda";
import { daftarTanggalRentang, hitungRekapSiswa } from "@/lib/utils/rekap-siswa";
import { ambilMulaiBanyak } from "@/lib/data/rekap-siswa";
import { ambilSemua } from "@/lib/utils/ambil-semua";
import { tapelDariTanggal } from "@/lib/utils/tapel";
import { todayJakarta } from "@/lib/utils/tanggal";
import { dalamBatasPindah } from "@/lib/utils/siswa-harian";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getLiburSet } from "@/lib/data/hari-libur";
import { getDaftarTapel } from "@/lib/data/tapel";
import type { StatusAbsen } from "@/types";

export interface SiswaHistoryProfile {
  id: number;
  name: string;
  class: string;
  nisn: string | null;
  foto: string | null;
  jenis_kelamin: string | null;
  /** "aktif" | "lulus" | "pindah". Portal siswa memakainya untuk menolak siswa non-aktif yang sesinya masih hidup. */
  status: string;
}

export interface RiwayatRow {
  tanggal: string;
  status: StatusAbsen;
  jam_masuk: string | null;
  jam_pulang: string | null;
  keterangan: string | null;
}

export interface StatHistory {
  hadir: number;
  terlambat: number;
  izin: number;
  sakit: number;
  alpha: number;
}

export interface ChartBulanan {
  label: string;
  hadir: number;
  alpha: number;
}

export async function getSiswaProfile(id: number): Promise<SiswaHistoryProfile | null> {
  const { data } = await supabaseAdmin
    .from("students")
    .select("id, name, class, nisn, foto, jenis_kelamin, status")
    .eq("id", id)
    .maybeSingle();
  return data ?? null;
}

export interface HistoryFilter {
  tapel: string;
  semester: string;
  bulan: string; // format YYYY-MM
}

export async function getRiwayatAbsensi(siswaId: number, filter: HistoryFilter): Promise<RiwayatRow[]> {
  let query = supabaseAdmin
    .from("absensi")
    .select("tanggal, status, jam_masuk, jam_pulang, keterangan, tapel")
    .eq("siswa_id", siswaId);

  if (filter.tapel) query = query.eq("tapel", filter.tapel);
  if (filter.semester) query = query.eq("semester", filter.semester);
  if (filter.bulan) {
    const [y, m] = filter.bulan.split("-").map(Number);
    const start = `${filter.bulan}-01`;
    const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10); // hari pertama bulan berikutnya
    query = query.gte("tanggal", start).lt("tanggal", end);
  }

  const [{ data }, liburSet, batasPindah, jeda] = await Promise.all([
    query.order("tanggal", { ascending: false }),
    getLiburSet(),
    ambilBatasPindahSiswa(siswaId),
    ambilJedaSiswa(siswaId),
  ]);
  // Record pada tanggal libur (mis. libur dicatat setelah auto-alpha jalan) tidak ikut
  // riwayat/statistik, konsisten dengan rekap bulanan dan rekap semester. Record SESUDAH tanggal
  // pindah dan record di dalam jeda (migrasi 025) juga tidak ikut (tidak dihapus; mengubah tanggal pindah mengembalikannya).
  return (data ?? [])
    .filter((r) => !liburSet.has(r.tanggal) && dalamBatasPindah(r.tapel, r.tanggal, batasPindah, jeda))
    .map((r) => ({
      tanggal: r.tanggal,
      status: r.status,
      jam_masuk: r.jam_masuk,
      jam_pulang: r.jam_pulang,
      keterangan: r.keterangan,
    }));
}

export function hitungStatHistory(rows: RiwayatRow[]): StatHistory {
  const stat: StatHistory = { hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpha: 0 };
  for (const r of rows) {
    if (r.status in stat) stat[r.status as keyof StatHistory]++;
  }
  return stat;
}

/**
 * Daftar tapel untuk dropdown filter. Sumber utama: master tahun_pelajaran (migrasi 015).
 * Kalau master gagal dibaca / kosong (mis. migrasi belum dijalankan), jatuh ke cara lama:
 * tapel yang pernah punya absensi.
 */
export async function getListTapel(): Promise<string[]> {
  const master = await getDaftarTapel();
  if (master.length > 0) return master;

  const { data } = await supabaseAdmin.from("absensi").select("tapel").order("tapel", { ascending: false });
  return Array.from(new Set((data ?? []).map((r) => r.tapel).filter(Boolean))) as string[];
}

const BULAN_SINGKAT: Record<string, string> = {
  "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr", "05": "Mei", "06": "Jun",
  "07": "Jul", "08": "Agu", "09": "Sep", "10": "Okt", "11": "Nov", "12": "Des",
};

/** Tren 6 bulan terakhir (hadir+terlambat vs alpha), diagregasi per bulan kalender. */
/** Jendela maksimum (bulan) yang ditelusuri mundur untuk mencari 6 bulan yang punya hari dihitung. */
const JENDELA_BULAN_GRAFIK = 24;

function geserBulan(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function getChartTren6Bulan(siswaId: number): Promise<ChartBulanan[]> {
  const today = todayJakarta();
  const bulanIni = today.slice(0, 7);
  const awalJendela = `${geserBulan(bulanIni, -(JENDELA_BULAN_GRAFIK - 1))}-01`;

  // Dipaginasi + urut stabil (PostgREST memotong diam-diam di 1000 baris; siswa lama bisa punya >1000 catatan).
  const [baris, liburSet, batasPindah, jeda] = await Promise.all([
    ambilSemua<{ tanggal: string; status: string }>((dari, sampai) =>
      supabaseAdmin
        .from("absensi")
        .select("tanggal, status")
        .eq("siswa_id", siswaId)
        .gte("tanggal", awalJendela)
        .order("tanggal", { ascending: true })
        .range(dari, sampai)
    ),
    getLiburSet(),
    ambilBatasPindahSiswa(siswaId),
    ambilJedaSiswa(siswaId),
  ]);

  // Telusuri mundur dari bulan ini sampai terkumpul 6 bulan yang punya hari dihitung (atau jendela habis).
  const bulanKandidat: string[] = [];
  for (let i = 0; i < JENDELA_BULAN_GRAFIK; i++) bulanKandidat.push(geserBulan(bulanIni, -i));

  // SATU sumber batas awal (RPC awal_catatan_siswa, migrasi 026) per tapel yang tercakup, sama dengan semua tampilan lain.
  const tapelSet = [...new Set(bulanKandidat.map((b) => tapelDariTanggal(`${b}-01`)))];
  const mulaiPerTapel = new Map<string, string | null>();
  await Promise.all(
    tapelSet.map(async (t) => mulaiPerTapel.set(t, (await ambilMulaiBanyak(t, [siswaId])).get(siswaId) ?? null))
  );

  const absensi = new Map<string, string>(baris.map((r) => [r.tanggal, r.status]));
  const hasil: ChartBulanan[] = [];
  for (const bln of bulanKandidat) {
    const [y, m] = bln.split("-").map(Number);
    const tglList = daftarTanggalRentang(`${bln}-01`, new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10));
    const r = hitungRekapSiswa(tglList, {
      today,
      libur: liburSet,
      absensi,
      batasPindah,
      jeda,
      mulai: mulaiPerTapel.get(tapelDariTanggal(`${bln}-01`)) ?? null,
    });
    if (r.hariDihitung > 0) {
      hasil.push({ label: `${BULAN_SINGKAT[String(m).padStart(2, "0")] ?? m} ${y}`, hadir: r.hadir + r.terlambat, alpha: r.alpha });
      if (hasil.length === 6) break;
    }
  }
  return hasil.reverse(); // urut menaik untuk grafik
}
