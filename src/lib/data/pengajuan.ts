import { supabaseAdmin } from "@/lib/supabase/server";
import {
  fiturBelumAktif,
  susunPratinjauHari,
  type HariPratinjau,
  type HasilHari,
  type JenisPengajuan,
  type StatusAbsensiAda,
  type StatusPengajuan,
} from "@/lib/utils/pengajuan";
import { todayJakarta } from "@/lib/utils/tanggal";

/**
 * Pembacaan data pengajuan izin/sakit (migrasi 027). Semua PENULISAN berjalan lewat fungsi SQL (RPC) di route;
 * file ini hanya membaca. Tabel pengajuan tidak terbuka untuk anon/authenticated (RLS), hanya service role.
 *
 * Embed pengajuan_izin_hari ikut dalam satu query (bukan query terpisah ber-.in()): batas "Max rows" PostgREST (1000)
 * berlaku untuk baris tingkat atas, jadi daftar yang dipotong diam-diam tidak mungkin terjadi pada hari-harinya.
 */

export interface HariPengajuan {
  tanggal: string;
  disetujui: boolean | null;
  aktif: boolean;
  hasil: HasilHari | null;
}

export interface PengajuanDasar {
  id: number;
  siswaId: number;
  jenis: JenisPengajuan;
  tanggalDari: string;
  tanggalSampai: string;
  status: StatusPengajuan;
  diajukanPada: string;
  diputuskanNama: string | null;
  diputuskanPada: string | null;
  catatanKeputusan: string | null;
  hari: HariPengajuan[];
}

/** Untuk wali kelas/admin: memuat alasan dan lampiran lengkap serta identitas siswa. */
export interface PengajuanAdmin extends PengajuanDasar {
  alasan: string;
  lampiran: string | null;
  siswa: { id: number; name: string; class: string; nisn: string | null };
}

/** Untuk portal (login hanya NISN): TANPA alasan dan URL lampiran, yang bisa memuat info kesehatan. */
export interface PengajuanPortal extends PengajuanDasar {
  adaLampiran: boolean;
}

type Mentah = Record<string, unknown>;

const KOLOM_PENGAJUAN =
  "id, siswa_id, jenis, tanggal_dari, tanggal_sampai, alasan, lampiran, status, diajukan_pada, diputuskan_nama, diputuskan_pada, catatan_keputusan, pengajuan_izin_hari(tanggal, disetujui, aktif, hasil)";

function petakanHari(mentah: unknown): HariPengajuan[] {
  if (!Array.isArray(mentah)) return [];
  return (mentah as Mentah[])
    .map((h) => ({
      tanggal: String(h.tanggal),
      disetujui: typeof h.disetujui === "boolean" ? h.disetujui : null,
      aktif: h.aktif === true,
      hasil: (h.hasil ?? null) as HasilHari | null,
    }))
    .sort((a, b) => (a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : 0));
}

export function petakanPengajuanDasar(r: Mentah): PengajuanDasar {
  return {
    id: Number(r.id),
    siswaId: Number(r.siswa_id),
    jenis: r.jenis as JenisPengajuan,
    tanggalDari: String(r.tanggal_dari),
    tanggalSampai: String(r.tanggal_sampai),
    status: r.status as StatusPengajuan,
    diajukanPada: String(r.diajukan_pada),
    diputuskanNama: (r.diputuskan_nama ?? null) as string | null,
    diputuskanPada: (r.diputuskan_pada ?? null) as string | null,
    catatanKeputusan: (r.catatan_keputusan ?? null) as string | null,
    hari: petakanHari(r.pengajuan_izin_hari),
  };
}

export function petakanPengajuanPortal(r: Mentah): PengajuanPortal {
  return { ...petakanPengajuanDasar(r), adaLampiran: typeof r.lampiran === "string" && r.lampiran !== "" };
}

export function petakanPengajuanAdmin(r: Mentah): PengajuanAdmin {
  const s = (r.students ?? {}) as Mentah;
  return {
    ...petakanPengajuanDasar(r),
    alasan: String(r.alasan ?? ""),
    lampiran: typeof r.lampiran === "string" && r.lampiran !== "" ? r.lampiran : null,
    siswa: {
      id: Number(s.id ?? r.siswa_id),
      name: String(s.name ?? ""),
      class: String(s.class ?? ""),
      nisn: (s.nisn ?? null) as string | null,
    },
  };
}

export class GalatBaca extends Error {
  constructor(public kodeDb: string | null, pesan: string) {
    super(pesan);
  }
}

// ── PORTAL ──────────────────────────────────────────────────────────────────────────────────────────

/** Riwayat pengajuan satu siswa (terbaru dulu). id siswa SELALU dari sesi, tidak pernah dari input. */
export async function ambilPengajuanSiswa(siswaId: number, batas = 30): Promise<PengajuanPortal[]> {
  const { data, error } = await supabaseAdmin
    .from("pengajuan_izin")
    .select(KOLOM_PENGAJUAN)
    .eq("siswa_id", siswaId)
    .order("diajukan_pada", { ascending: false })
    .order("id", { ascending: false })
    .limit(batas);
  if (error) throw new GalatBaca(error.code ?? null, error.message);
  return ((data ?? []) as unknown as Mentah[]).map(petakanPengajuanPortal);
}

export interface StatusPinSiswa {
  /** PIN sudah dibuat wali kelas/admin. */
  diatur: boolean;
  /** Terisi hanya bila masih terkunci saat ini. */
  terkunciSampai: string | null;
}

export async function ambilStatusPinSiswa(siswaId: number, sekarang: Date = new Date()): Promise<StatusPinSiswa> {
  const { data, error } = await supabaseAdmin
    .from("kunci_ortu")
    .select("terkunci_sampai")
    .eq("siswa_id", siswaId)
    .not("pin_hash", "is", null) // baris ada = PIN sudah dibuat; nilai hash tidak pernah dibaca
    .maybeSingle();
  if (error) throw new GalatBaca(error.code ?? null, error.message);
  if (!data) return { diatur: false, terkunciSampai: null };
  const baris = data as Mentah;
  const sampai = typeof baris.terkunci_sampai === "string" ? baris.terkunci_sampai : null;
  return {
    diatur: true,
    terkunciSampai: sampai && new Date(sampai).getTime() > sekarang.getTime() ? sampai : null,
  };
}

// ── ADMIN / WALI KELAS ──────────────────────────────────────────────────────────────────────────────

export interface FilterDaftar {
  /** null = semua kelas (hanya admin). Untuk guru SELALU kelas wali dari DB. */
  kelas: string | null;
  status: "menunggu" | "semua";
  halaman: number;
  perHalaman: number;
}

export interface HasilDaftar {
  baris: PengajuanAdmin[];
  total: number;
}

export async function ambilDaftarPengajuan(f: FilterDaftar): Promise<HasilDaftar> {
  let q = supabaseAdmin
    .from("pengajuan_izin")
    .select(`${KOLOM_PENGAJUAN}, students!inner(id, name, class, nisn)`, { count: "exact" });
  if (f.status === "menunggu") q = q.eq("status", "menunggu");
  if (f.kelas !== null) q = q.eq("students.class", f.kelas);
  const dari = (f.halaman - 1) * f.perHalaman;
  // Menunggu: yang paling lama menunggu di atas (adil dan mudah ditindak). Semua: terbaru dulu.
  q = f.status === "menunggu"
    ? q.order("diajukan_pada", { ascending: true }).order("id", { ascending: true })
    : q.order("diajukan_pada", { ascending: false }).order("id", { ascending: false });
  const { data, error, count } = await q.range(dari, dari + f.perHalaman - 1);
  if (error) throw new GalatBaca(error.code ?? null, error.message);
  return { baris: ((data ?? []) as unknown as Mentah[]).map(petakanPengajuanAdmin), total: count ?? 0 };
}

/** Jumlah pengajuan Menunggu (untuk penanda). kelas null = semua kelas. */
export async function hitungPengajuanMenunggu(kelas: string | null): Promise<number> {
  let q = supabaseAdmin
    .from("pengajuan_izin")
    .select("id, students!inner(class)", { count: "exact", head: true })
    .eq("status", "menunggu");
  if (kelas !== null) q = q.eq("students.class", kelas);
  const { count, error } = await q;
  if (error) throw new GalatBaca(error.code ?? null, error.message);
  return count ?? 0;
}

/** Hanya pemilik (siswa) sebuah pengajuan: dipakai untuk memeriksa akses SEBELUM memuat detail. */
export async function ambilSiswaIdPengajuan(id: number): Promise<number | null> {
  const { data, error } = await supabaseAdmin.from("pengajuan_izin").select("siswa_id").eq("id", id).maybeSingle();
  if (error) throw new GalatBaca(error.code ?? null, error.message);
  return data ? Number((data as Mentah).siswa_id) : null;
}

export interface DetailPengajuan {
  pengajuan: PengajuanAdmin;
  /** Pratinjau per hari: apa yang terjadi pada tiap hari bila disetujui / tidak disetujui sekarang. */
  pratinjau: HariPratinjau[];
  hariIni: string;
}

export async function ambilDetailPengajuan(id: number): Promise<DetailPengajuan | null> {
  const { data, error } = await supabaseAdmin
    .from("pengajuan_izin")
    .select(`${KOLOM_PENGAJUAN}, students!inner(id, name, class, nisn)`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new GalatBaca(error.code ?? null, error.message);
  if (!data) return null;
  const pengajuan = petakanPengajuanAdmin(data as unknown as Mentah);

  const tanggalList = pengajuan.hari.map((h) => h.tanggal);
  const absensi = new Map<string, StatusAbsensiAda>();
  if (tanggalList.length > 0) {
    const { data: abs, error: errAbs } = await supabaseAdmin
      .from("absensi")
      .select("tanggal, status")
      .eq("siswa_id", pengajuan.siswaId)
      .in("tanggal", tanggalList);
    if (errAbs) throw new GalatBaca(errAbs.code ?? null, errAbs.message);
    for (const a of (abs ?? []) as Mentah[]) absensi.set(String(a.tanggal), a.status as StatusAbsensiAda);
  }
  const hariIni = todayJakarta();
  return { pengajuan, pratinjau: susunPratinjauHari(tanggalList, absensi, hariIni), hariIni };
}

// ── PIN ORANG TUA (status; hash TIDAK PERNAH dibaca ke aplikasi) ────────────────────────────────────

export interface StatusPinKelas {
  id: number;
  name: string;
  nisn: string | null;
  pinDiatur: boolean;
  /** Wali kelas/admin sudah menandai PIN diberikan ke orang tua. */
  dibagikanPada: string | null;
  terkunciSampai: string | null;
}

export async function ambilStatusPinKelas(kelas: string, sekarang: Date = new Date()): Promise<StatusPinKelas[]> {
  const { data: siswa, error } = await supabaseAdmin
    .from("students")
    .select("id, name, nisn")
    .eq("class", kelas)
    .eq("status", "aktif")
    .order("name", { ascending: true });
  if (error) throw new GalatBaca(error.code ?? null, error.message);
  const daftar = (siswa ?? []) as Mentah[];
  if (daftar.length === 0) return [];

  const ids = daftar.map((s) => Number(s.id));
  const { data: kunci, error: errKunci } = await supabaseAdmin
    .from("kunci_ortu")
    .select("siswa_id, dibagikan_pada, terkunci_sampai")
    .in("siswa_id", ids)
    .not("pin_hash", "is", null); // baris ada = PIN sudah dibuat; hash tidak pernah dibaca
  if (errKunci) throw new GalatBaca(errKunci.code ?? null, errKunci.message);
  const perSiswa = new Map<number, Mentah>();
  for (const k of (kunci ?? []) as Mentah[]) perSiswa.set(Number(k.siswa_id), k);

  return daftar.map((s) => {
    const k = perSiswa.get(Number(s.id));
    const sampai = k && typeof k.terkunci_sampai === "string" ? k.terkunci_sampai : null;
    return {
      id: Number(s.id),
      name: String(s.name),
      nisn: (s.nisn ?? null) as string | null,
      pinDiatur: !!k,
      dibagikanPada: k && typeof k.dibagikan_pada === "string" ? k.dibagikan_pada : null,
      terkunciSampai: sampai && new Date(sampai).getTime() > sekarang.getTime() ? sampai : null,
    };
  });
}

// ── DASHBOARD PORTAL ────────────────────────────────────────────────────────────────────────────────

export type MuatPengajuanPortal =
  | { status: "ok"; pengajuan: PengajuanPortal[]; pin: StatusPinSiswa }
  /** Migrasi 027 belum dijalankan: bagian pengajuan disembunyikan, dashboard lain tetap jalan. */
  | { status: "nonaktif" }
  /** Galat lain: dashboard tetap tampil, bagian pengajuan menampilkan catatan singkat. */
  | { status: "galat" };

/** Dipakai halaman dashboard portal: TIDAK PERNAH melempar, supaya fitur baru tidak bisa merusak halaman absensi. */
export async function muatPengajuanPortal(siswaId: number): Promise<MuatPengajuanPortal> {
  try {
    const [pengajuan, pin] = await Promise.all([ambilPengajuanSiswa(siswaId), ambilStatusPinSiswa(siswaId)]);
    return { status: "ok", pengajuan, pin };
  } catch (e) {
    if (e instanceof GalatBaca && fiturBelumAktif(e.kodeDb)) return { status: "nonaktif" };
    console.error("[portal] muat pengajuan gagal:", e instanceof Error ? e.message : e);
    return { status: "galat" };
  }
}
