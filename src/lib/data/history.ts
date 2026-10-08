import { supabaseAdmin } from "@/lib/supabase/server";
import { getLiburSet } from "@/lib/data/hari-libur";
import type { StatusAbsen } from "@/types";

export interface SiswaHistoryProfile {
  id: number;
  name: string;
  class: string;
  nisn: string | null;
  foto: string | null;
  jenis_kelamin: string | null;
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
    .select("id, name, class, nisn, foto, jenis_kelamin")
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
    .select("tanggal, status, jam_masuk, jam_pulang, keterangan")
    .eq("siswa_id", siswaId);

  if (filter.tapel) query = query.eq("tapel", filter.tapel);
  if (filter.semester) query = query.eq("semester", filter.semester);
  if (filter.bulan) {
    const [y, m] = filter.bulan.split("-").map(Number);
    const start = `${filter.bulan}-01`;
    const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10); // hari pertama bulan berikutnya
    query = query.gte("tanggal", start).lt("tanggal", end);
  }

  const [{ data }, liburSet] = await Promise.all([query.order("tanggal", { ascending: false }), getLiburSet()]);
  // Record pada tanggal libur (mis. libur dicatat setelah auto-alpha jalan) tidak ikut
  // riwayat/statistik, konsisten dengan rekap bulanan dan rekap semester.
  return (data ?? []).filter((r) => !liburSet.has(r.tanggal));
}

export function hitungStatHistory(rows: RiwayatRow[]): StatHistory {
  const stat: StatHistory = { hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpha: 0 };
  for (const r of rows) {
    if (r.status in stat) stat[r.status as keyof StatHistory]++;
  }
  return stat;
}

export async function getListTapel(): Promise<string[]> {
  const { data } = await supabaseAdmin.from("absensi").select("tapel").order("tapel", { ascending: false });
  return Array.from(new Set((data ?? []).map((r) => r.tapel).filter(Boolean))) as string[];
}

const BULAN_SINGKAT: Record<string, string> = {
  "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr", "05": "Mei", "06": "Jun",
  "07": "Jul", "08": "Agu", "09": "Sep", "10": "Okt", "11": "Nov", "12": "Des",
};

/** Tren 6 bulan terakhir (hadir+terlambat vs alpha), diagregasi per bulan kalender. */
export async function getChartTren6Bulan(siswaId: number): Promise<ChartBulanan[]> {
  const [{ data }, liburSet] = await Promise.all([
    supabaseAdmin
      .from("absensi")
      .select("tanggal, status")
      .eq("siswa_id", siswaId)
      .order("tanggal", { ascending: false }),
    getLiburSet(),
  ]);

  const perBulan = new Map<string, { hadir: number; alpha: number }>();
  for (const r of data ?? []) {
    if (liburSet.has(r.tanggal)) continue; // abaikan record di tanggal libur
    const bln = r.tanggal.slice(0, 7); // YYYY-MM
    if (!perBulan.has(bln)) perBulan.set(bln, { hadir: 0, alpha: 0 });
    const entry = perBulan.get(bln)!;
    if (r.status === "hadir" || r.status === "terlambat") entry.hadir++;
    if (r.status === "alpha") entry.alpha++;
  }

  const bulanTerbaru = Array.from(perBulan.keys()).sort((a, b) => (a < b ? 1 : -1)).slice(0, 6);
  const urut = bulanTerbaru.sort(); // ascending buat chart

  return urut.map((bln) => {
    const [, m] = bln.split("-");
    const entry = perBulan.get(bln)!;
    return { label: `${BULAN_SINGKAT[m] ?? m} ${bln.slice(0, 4)}`, hadir: entry.hadir, alpha: entry.alpha };
  });
}
