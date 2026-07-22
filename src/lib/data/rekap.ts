import { supabaseAdmin } from "@/lib/supabase/server";
import { todayJakarta } from "@/lib/utils/tanggal";
import type { StatusAbsen } from "@/types";

export async function getSemuaKelasRekap(): Promise<string[]> {
  const { data } = await supabaseAdmin.from("students").select("class");
  return Array.from(new Set((data ?? []).map((r) => r.class))).sort();
}

// ── HARIAN ──────────────────────────────────────────────────────────────

export type StatusHarian = StatusAbsen | "kosong";

export interface RekapHarianRow {
  id: number;
  name: string;
  class: string;
  status: StatusHarian;
  jam_masuk: string | null;
  jam_pulang: string | null;
  keterangan: string | null;
}

export interface StatHarian {
  hadir: number;
  terlambat: number;
  izin: number;
  sakit: number;
  alpha: number;
}

/**
 * Port dari query VIEW HARIAN rekap.php: semua siswa (LEFT JOIN absensi),
 * status default 'alpha' kalau tanggal < hari ini, atau 'kosong' kalau
 * hari ini/masa depan dan belum ada record.
 */
export async function getRekapHarian(
  tanggal: string,
  kelasFilter: string
): Promise<{ rows: RekapHarianRow[]; stat: StatHarian }> {
  let studentsQuery = supabaseAdmin.from("students").select("id, name, class");
  if (kelasFilter) studentsQuery = studentsQuery.eq("class", kelasFilter);
  const { data: students } = await studentsQuery.order("class").order("name");
  const list = students ?? [];
  if (list.length === 0) return { rows: [], stat: { hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpha: 0 } };

  const ids = list.map((s) => s.id);
  const { data: absenRows } = await supabaseAdmin
    .from("absensi")
    .select("siswa_id, status, jam_masuk, jam_pulang, keterangan")
    .eq("tanggal", tanggal)
    .in("siswa_id", ids);
  const absenMap = new Map((absenRows ?? []).map((r) => [r.siswa_id, r]));

  const today = todayJakarta();
  const defaultStatus: StatusHarian = tanggal < today ? "alpha" : "kosong";

  const stat: StatHarian = { hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpha: 0 };
  const rows: RekapHarianRow[] = list.map((s) => {
    const a = absenMap.get(s.id);
    const status: StatusHarian = (a?.status as StatusHarian) ?? defaultStatus;
    if (status in stat) stat[status as keyof StatHarian]++;
    return {
      id: s.id,
      name: s.name,
      class: s.class,
      status,
      jam_masuk: a?.jam_masuk ?? null,
      jam_pulang: a?.jam_pulang ?? null,
      keterangan: a?.keterangan ?? null,
    };
  });

  return { rows, stat };
}

// ── BULANAN ─────────────────────────────────────────────────────────────

export type StatusBulanan = StatusAbsen | "libur" | "kosong";

export interface RekapBulananRow {
  id: number;
  nama: string;
  kelas: string;
  hadir: number;
  terlambat: number;
  izin: number;
  sakit: number;
  alpha: number;
  d: Record<string, StatusBulanan>; // tanggal -> status
}

/** Daftar tanggal Senin-Sabtu (exclude Minggu) dalam satu bulan kalender. */
export function daftarTanggalBulan(bulanYYYYMM: string): string[] {
  const [y, m] = bulanYYYYMM.split("-").map(Number);
  const dates: string[] = [];
  const cur = new Date(Date.UTC(y, m - 1, 1));
  while (cur.getUTCMonth() === m - 1) {
    if (cur.getUTCDay() !== 0) dates.push(cur.toISOString().slice(0, 10)); // exclude Minggu
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

// ── HISTORY (AKUMULASI SEMESTER) ──────────────────────────────────────

export interface RekapHistoryRow {
  nama: string;
  kelas: string;
  nisn: string | null;
  hadir: number;
  telat: number;
  izin: number;
  sakit: number;
  alpha: number;
  persen: number;
}

/**
 * Port dari rekap_history.php: akumulasi total H/T/I/S/A per siswa selama
 * satu tapel+semester penuh, dibanding jumlah hari efektif (hari unik yang
 * punya record absensi pada periode tsb).
 */
export async function getRekapHistory(
  tapel: string,
  semester: string,
  kelasFilter: string
): Promise<{ rows: RekapHistoryRow[]; totalHariEfektif: number }> {
  if (!tapel || !semester) return { rows: [], totalHariEfektif: 0 };

  const { data: hariRows } = await supabaseAdmin
    .from("absensi")
    .select("tanggal")
    .eq("tapel", tapel)
    .eq("semester", semester);
  const totalHariEfektif = new Set((hariRows ?? []).map((r) => r.tanggal)).size;

  let studentsQuery = supabaseAdmin.from("students").select("id, name, class, nisn");
  if (kelasFilter) studentsQuery = studentsQuery.eq("class", kelasFilter);
  const { data: students } = await studentsQuery.order("class").order("name");
  const list = students ?? [];
  if (list.length === 0) return { rows: [], totalHariEfektif };

  const ids = list.map((s) => s.id);
  const { data: absenRows } = await supabaseAdmin
    .from("absensi")
    .select("siswa_id, status")
    .eq("tapel", tapel)
    .eq("semester", semester)
    .in("siswa_id", ids);

  const mapAbsen = new Map<number, Record<string, number>>();
  for (const r of absenRows ?? []) {
    if (!mapAbsen.has(r.siswa_id)) mapAbsen.set(r.siswa_id, {});
    const m = mapAbsen.get(r.siswa_id)!;
    m[r.status] = (m[r.status] ?? 0) + 1;
  }

  const rows: RekapHistoryRow[] = list.map((s) => {
    const m = mapAbsen.get(s.id) ?? {};
    const hadir = m.hadir ?? 0;
    const telat = m.terlambat ?? 0;
    const izin = m.izin ?? 0;
    const sakit = m.sakit ?? 0;
    const alpha = m.alpha ?? 0;
    const persen = totalHariEfektif > 0 ? Math.round(((hadir + telat) / totalHariEfektif) * 1000) / 10 : 0;
    return { nama: s.name, kelas: s.class, nisn: s.nisn, hadir, telat, izin, sakit, alpha, persen };
  });

  return { rows, totalHariEfektif };
}

export async function getRekapBulanan(
  bulanYYYYMM: string,
  kelasFilter: string,
  liburMap: Map<string, string>
): Promise<{ rows: RekapBulananRow[]; tglList: string[] }> {
  const tglList = daftarTanggalBulan(bulanYYYYMM);
  const ta = `${bulanYYYYMM}-01`;
  const [y, m] = bulanYYYYMM.split("-").map(Number);
  const tk = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // hari terakhir bulan itu

  let studentsQuery = supabaseAdmin.from("students").select("id, name, class");
  if (kelasFilter) studentsQuery = studentsQuery.eq("class", kelasFilter);
  const { data: students } = await studentsQuery.order("class").order("name");
  const list = students ?? [];
  if (list.length === 0) return { rows: [], tglList };

  const ids = list.map((s) => s.id);
  const { data: absenRows } = await supabaseAdmin
    .from("absensi")
    .select("siswa_id, tanggal, status")
    .gte("tanggal", ta)
    .lte("tanggal", tk)
    .in("siswa_id", ids);

  const am = new Map<number, Map<string, StatusAbsen>>();
  for (const r of absenRows ?? []) {
    if (!am.has(r.siswa_id)) am.set(r.siswa_id, new Map());
    am.get(r.siswa_id)!.set(r.tanggal, r.status as StatusAbsen);
  }

  const today = todayJakarta();

  const rows: RekapBulananRow[] = list.map((s) => {
    const row: RekapBulananRow = {
      id: s.id,
      nama: s.name,
      kelas: s.class,
      hadir: 0,
      terlambat: 0,
      izin: 0,
      sakit: 0,
      alpha: 0,
      d: {},
    };
    for (const tgl of tglList) {
      let st: StatusBulanan;
      if (liburMap.has(tgl)) {
        st = "libur";
      } else {
        const defaultStatus: StatusBulanan = tgl < today ? "alpha" : "kosong";
        st = am.get(s.id)?.get(tgl) ?? defaultStatus;
        if (st === "hadir" || st === "terlambat" || st === "izin" || st === "sakit" || st === "alpha") {
          row[st] = row[st] + 1;
        }
      }
      row.d[tgl] = st;
    }
    return row;
  });

  return { rows, tglList };
}
