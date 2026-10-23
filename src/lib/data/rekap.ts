import { supabaseAdmin } from "@/lib/supabase/server";
import { formatWaktuWib, todayJakarta } from "@/lib/utils/tanggal";
import { ambilSemua } from "@/lib/utils/ambil-semua";
import { getKelasTapel, getSiswaTapel, tapelUntukBulan, tapelUntukTanggal } from "@/lib/data/riwayat-kelas";
import { getAbsensiSetting } from "@/lib/data/dashboard";
import { ambilNonaktifIds } from "@/lib/data/nonaktif";
import { labelKeluar, perluCekData, saringSiswaRekap, sudahKeluarPada } from "@/lib/utils/siswa-harian";
import { keteranganSumber, tentukanSumberAbsen, type SumberAbsen } from "@/lib/utils/sumber-absen";
import type { StatusAbsen } from "@/types";

/** Daftar kelas pada tapel itu (menurut riwayat kelas), untuk dropdown filter Rekap. */
export async function getSemuaKelasRekap(tapel: string): Promise<string[]> {
  return getKelasTapel(tapel);
}

/**
 * Daftar bulan (YYYY-MM) yang ada data absensinya, dipakai di dropdown
 * "reset data per bulan" di halaman Pengaturan. Pakai RPC distinct_bulan_absensi
 * (lihat supabase/migrations/004_optimasi_query.sql) supaya hitungnya di
 * level database (jauh lebih ringan daripada narik seluruh kolom tanggal
 * dari tabel absensi yang bisa puluhan ribu baris). Kalau migrasinya belum
 * dijalankan, otomatis jatuh ke cara lama (tetap dibatasi LIMIT biar nggak
 * sepenuhnya tanpa batas).
 */
export async function getDistinctBulanAbsensi(): Promise<string[]> {
  const { data, error } = await supabaseAdmin.rpc("distinct_bulan_absensi");
  if (!error && data) {
    return (data as { bulan: string }[]).map((r) => r.bulan);
  }

  const { data: rows } = await supabaseAdmin
    .from("absensi")
    .select("tanggal")
    .order("tanggal", { ascending: false })
    .limit(5000);
  const bulanSet = new Set((rows ?? []).map((r) => r.tanggal.slice(0, 7)));
  return Array.from(bulanSet).sort((a, b) => (a < b ? 1 : -1));
}

// ── HARIAN ──────────────────────────────────────────────────────────────

export type StatusHarian = StatusAbsen | "kosong";

/** Kondisi baris SEBELUM edit manual terakhir (yang akan dikembalikan oleh Pulihkan). null = barisnya belum ada. */
export interface SebelumEdit {
  status: StatusAbsen;
  jam_masuk: string | null;
  jam_pulang: string | null;
  keterangan: string | null;
  lampiran: boolean;
}

/** Ada pada baris yang edit manual terakhirnya MASIH bisa dipulihkan sekarang. */
export interface InfoPulihkan {
  /** ID edit yang akan dipulihkan (o_edit_id). Dikirim kembali saat Pulihkan agar yang dipulihkan persis edit yang dilihat pengguna. */
  editId: number;
  dieditOleh: string | null;
  dieditPada: string; // sudah diformat WIB
  batasPulihkan: string; // sudah diformat WIB
  sebelum: SebelumEdit | null;
}

export interface RekapHarianRow {
  id: number;
  name: string;
  class: string;
  /** Mis. "Pindah · 12 Okt 2026" untuk siswa yang sudah keluar; null untuk siswa aktif. */
  labelKeluar: string | null;
  status: StatusHarian;
  /** Tanggal pindah siswa: baris tampil tetapi absensinya tidak dihitung. */
  tidakDihitung?: boolean;
  jam_masuk: string | null;
  jam_pulang: string | null;
  keterangan: string | null;
  lampiran: string | null;
  pulihkan: InfoPulihkan | null;
  /** Asal catatan untuk subtext di bawah status ("scan" / "edit guru" / "otomatis"); null = tidak diketahui. */
  sumber: SumberAbsen | null;
  /** Teks tooltip untuk `sumber`. */
  sumberKet: string | null;
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
  kelasFilter: string,
  opsi: { denganPulihkan?: boolean; denganSumber?: boolean } = {}
): Promise<{ rows: RekapHarianRow[]; stat: StatHarian }> {
  // Siswa & kelasnya diambil dari riwayat kelas pada tapel tanggal ini, bukan students.class,
  // supaya rekap tanggal lama tetap menampilkan kelas yang benar setelah siswa naik kelas.
  const tapel = await tapelUntukTanggal(tanggal);
  const semua = (await getSiswaTapel(tapel, kelasFilter)).map((s) => ({
    id: s.siswa_id,
    name: s.nama,
    class: s.kelas,
    nonaktif_pada: s.nonaktif_pada,
    labelKeluar: labelKeluar(s.alasan_nonaktif, s.nonaktif_pada),
  }));
  const kosongStat: StatHarian = { hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpha: 0 };
  if (semua.length === 0) return { rows: [], stat: kosongStat };

  const idsSemua = semua.map((s) => s.id);
  const [{ data: absenRows }, nonaktifIds, setting] = await Promise.all([
    supabaseAdmin
      .from("absensi")
      .select("siswa_id, status, jam_masuk, jam_pulang, keterangan, lampiran, scan_oleh")
      .eq("tanggal", tanggal)
      .in("siswa_id", idsSemua),
    ambilNonaktifIds(),
    getAbsensiSetting(),
  ]);
  const absenMap = new Map((absenRows ?? []).map((r) => [r.siswa_id, r]));

  // Siswa yang pindah tampil sampai tanggal pindahnya (pada tanggal itu tampil tetapi tidak dihitung), lalu
  // hilang (lihat siswa-harian.ts), supaya jumlahnya cocok dengan Data Siswa dan tanpa alpha palsu.
  const list = saringSiswaRekap(semua, {
    tapelRekap: tapel,
    tapelAktif: setting.tapel,
    nonaktifIds,
    adaAbsenIds: new Set(absenMap.keys()),
    awalPeriode: tanggal,
  });
  if (list.length === 0) return { rows: [], stat: kosongStat };
  const ids = list.map((s) => s.id);
  // Info tombol Pulihkan hanya diminta halaman Rekap (ekspor CSV tidak memerlukannya).
  const pulihkanMap = opsi.denganPulihkan ? await getInfoPulihkan(tanggal, ids) : new Map<number, InfoPulihkan>();
  // Subtext asal catatan hanya dipakai halaman Rekap (bukan ekspor CSV), jadi kueri tambahannya opsional.
  const editMap = opsi.denganSumber ? await getEditManualAktif(tanggal) : new Map<number, EditManualAktif>();

  const today = todayJakarta();
  const defaultStatus: StatusHarian = tanggal < today ? "alpha" : "kosong";

  const stat: StatHarian = { hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpha: 0 };
  const rows: RekapHarianRow[] = list.map((s) => {
    const a = absenMap.get(s.id);
    // Tanggal ini = tanggal pindah siswa: baris tetap tampil (dengan lencana), tetapi tidak dihitung.
    const tidakDihitung = sudahKeluarPada(s.nonaktif_pada, tanggal);
    const status: StatusHarian = tidakDihitung ? "kosong" : ((a?.status as StatusHarian) ?? defaultStatus);
    if (!tidakDihitung && status in stat) stat[status as keyof StatHarian]++;
    // Subtext hanya untuk baris yang benar-benar tercatat (bukan status bawaan alpha/kosong).
    const edit = a ? editMap.get(s.id) : undefined;
    const sumber = opsi.denganSumber && a ? tentukanSumberAbsen({ scanOleh: a.scan_oleh, adaEditManual: !!edit }) : null;
    return {
      id: s.id,
      name: s.name,
      class: s.class,
      labelKeluar: s.labelKeluar,
      status,
      tidakDihitung,
      jam_masuk: tidakDihitung ? null : (a?.jam_masuk ?? null),
      jam_pulang: tidakDihitung ? null : (a?.jam_pulang ?? null),
      keterangan: a?.keterangan ?? null,
      lampiran: a?.lampiran ?? null,
      pulihkan: pulihkanMap.get(s.id) ?? null,
      sumber,
      sumberKet: keteranganSumber(sumber, { scanOleh: a?.scan_oleh, editorNama: edit?.editorNama, dieditAt: edit?.dieditAt }),
    };
  });

  return { rows, stat };
}

interface EditManualAktif {
  editorNama: string | null;
  dieditAt: string;
}

/**
 * Siswa yang punya edit manual pada `tanggal` yang BELUM dipulihkan (edit terbaru per siswa).
 * Tidak dibatasi masa pulihkan: ini jejak audit, bukan tombol. Kalau tabelnya belum ada (migrasi 019
 * belum dijalankan) hasilnya kosong dan halaman tetap berfungsi.
 */
async function getEditManualAktif(tanggal: string): Promise<Map<number, EditManualAktif>> {
  const hasil = new Map<number, EditManualAktif>();
  try {
    const rows = await ambilSemua<{ siswa_id: number; editor_nama: string | null; diedit_at: string }>((dari, sampai) =>
      supabaseAdmin
        .from("absensi_edit_manual")
        .select("siswa_id, editor_nama, diedit_at")
        .eq("tanggal", tanggal)
        .is("dipulihkan_at", null)
        .order("id", { ascending: true })
        .range(dari, sampai)
    );
    // urut naik: yang terakhir (id terbesar) menimpa, jadi edit terbaru yang tersimpan
    for (const r of rows) hasil.set(r.siswa_id, { editorNama: r.editor_nama, dieditAt: r.diedit_at });
  } catch (e) {
    console.error("[getEditManualAktif]", e);
  }
  return hasil;
}

/**
 * Siswa yang edit manual terakhirnya pada `tanggal` masih bisa dipulihkan. Syaratnya diputuskan di
 * database (fungsi daftar_bisa_pulihkan, migrasi 019) supaya identik dengan yang dicek saat Pulihkan.
 * Kalau migrasinya belum dijalankan, tombol Pulihkan tidak muncul dan halaman tetap berfungsi.
 */
async function getInfoPulihkan(tanggal: string, siswaIds: number[]): Promise<Map<number, InfoPulihkan>> {
  const hasil = new Map<number, InfoPulihkan>();
  const { data, error } = await supabaseAdmin.rpc("daftar_bisa_pulihkan", { p_tanggal: tanggal, p_siswa_ids: siswaIds });
  if (error) {
    console.error("[getInfoPulihkan]", error.message);
    return hasil;
  }
  type Baris = {
    o_siswa_id: number;
    o_edit_id: number;
    o_diedit_at: string;
    o_editor_nama: string | null;
    o_batas: string;
    o_sebelum: Record<string, string | null> | null;
  };
  for (const r of (data ?? []) as Baris[]) {
    // Tanpa ID edit yang valid tombol Pulihkan tidak boleh muncul (gagal tertutup).
    const editId = Number(r.o_edit_id);
    if (!Number.isSafeInteger(editId) || editId <= 0) {
      console.error("[getInfoPulihkan] o_edit_id tidak valid:", r.o_edit_id);
      continue;
    }
    const j = r.o_sebelum;
    hasil.set(r.o_siswa_id, {
      editId,
      dieditOleh: r.o_editor_nama,
      dieditPada: formatWaktuWib(r.o_diedit_at),
      batasPulihkan: formatWaktuWib(r.o_batas),
      sebelum: j
        ? {
            status: j.status as StatusAbsen,
            jam_masuk: j.jam_masuk ?? null,
            jam_pulang: j.jam_pulang ?? null,
            keterangan: j.keterangan ?? null,
            lampiran: !!j.lampiran,
          }
        : null,
    });
  }
  return hasil;
}

// ── BULANAN ─────────────────────────────────────────────────────────────

/** "nonaktif" = pada tanggal pindah dan sesudahnya (tanggal >= nonaktif_pada); tidak dihitung, apa pun record-nya. */
export type StatusBulanan = StatusAbsen | "libur" | "kosong" | "nonaktif";

export interface RekapBulananRow {
  id: number;
  nama: string;
  kelas: string;
  labelKeluar: string | null;
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

// Hari libur (tabel hari_libur) dan hari Minggu TIDAK dihitung sebagai hari
// efektif, dan record absensi pada tanggal itu diabaikan — walaupun libur baru
// dicatat setelah absensi hari itu terlanjur ada. Agregasi dilakukan di
// database (lihat migrasi 013) supaya tidak terkena batas 1000 baris PostgREST.
async function hitungHariEfektif(tapel: string, semester: string): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc("hari_efektif", { p_tapel: tapel, p_semester: semester });
  if (error) throw new Error(`Gagal menghitung hari efektif: ${error.message}`);
  return Number(data ?? 0);
}

/**
 * Penyebut persentase untuk siswa yang pindah di tengah semester: hari efektif SEBELUM tanggal pindah
 * (eksklusif, migrasi 024). Kunci = tanggal pindah. Kalau fungsinya belum ada, dipakai penyebut satu semester penuh.
 */
async function petaPenyebutKeluar(
  tapel: string,
  semester: string,
  tanggalPindah: (string | null | undefined)[],
  cadangan: number
): Promise<Map<string, number>> {
  const peta = new Map<string, number>();
  const unik = [...new Set(tanggalPindah.filter((t): t is string => !!t))];
  await Promise.all(
    unik.map(async (t) => {
      const { data, error } = await supabaseAdmin.rpc("hari_efektif_sebelum", { p_tapel: tapel, p_semester: semester, p_sebelum: t });
      if (error) console.error("[petaPenyebutKeluar]", error.message);
      peta.set(t, error ? cadangan : Number(data ?? 0));
    })
  );
  return peta;
}

async function ambilAgregatSemester(
  tapel: string,
  semester: string,
  ids: number[]
): Promise<Map<number, Record<string, number>>> {
  const { data, error } = await supabaseAdmin.rpc("rekap_history_siswa", {
    p_tapel: tapel,
    p_semester: semester,
    p_ids: ids,
  });
  if (error) throw new Error(`Gagal mengambil rekap semester: ${error.message}`);
  const peta = new Map<number, Record<string, number>>();
  for (const r of (data ?? []) as { siswa_id: number; status: string; jumlah: number }[]) {
    if (!peta.has(r.siswa_id)) peta.set(r.siswa_id, {});
    peta.get(r.siswa_id)![r.status] = Number(r.jumlah);
  }
  return peta;
}

export interface RekapHistoryRow {
  nama: string;
  kelas: string;
  nisn: string | null;
  /** Mis. "Pindah · 12 Okt 2026" untuk siswa yang sudah keluar; null untuk siswa aktif. */
  labelKeluar: string | null;
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
export interface RekapHistoryPageResult {
  rows: RekapHistoryRow[];
  totalHariEfektif: number;
  totalSiswa: number;
  totalPages: number;
  page: number;
}

/**
 * Versi paginasi sungguhan dari getRekapHistory() di atas — dipakai khusus
 * untuk halaman /rekap-history. Bedanya: siswa diambil per halaman lewat
 * .range(), lalu absensi cuma di-agregasi untuk siswa di halaman itu saja
 * (bukan seluruh siswa hasil filter kelas). Untuk kebutuhan export
 * CSV/Excel (yang memang butuh semua baris sekaligus), tetap pakai
 * getRekapHistory() yang asli.
 */
export async function getRekapHistoryPage(
  tapel: string,
  semester: string,
  kelasFilter: string,
  page: number,
  pageSize: number
): Promise<RekapHistoryPageResult> {
  if (!tapel || !semester) return { rows: [], totalHariEfektif: 0, totalSiswa: 0, totalPages: 1, page: 1 };

  const totalHariEfektif = await hitungHariEfektif(tapel, semester);

  // Daftar siswa = siswa yang punya riwayat kelas di tapel ini (kelasnya pada tapel itu). Daftar
  // ringan (id, nama, kelas, nisn) diambil seluruhnya lalu dipotong per halaman di sini; yang
  // berat (agregat absensi) tetap hanya dihitung untuk siswa di halaman yang tampil.
  const semuaDasar = await getSiswaTapel(tapel, kelasFilter);
  // Di tapel aktif, siswa lulus/pindah hanya ikut kalau punya absensi pada semester ini. Agregat
  // dihitung dulu hanya untuk mereka (jumlahnya kecil) supaya total & paginasi tetap benar.
  const [nonaktifIds, setting] = await Promise.all([ambilNonaktifIds(), getAbsensiSetting()]);
  const dasar = semuaDasar.map((s) => ({ ...s, id: s.siswa_id }));
  const opsiSaring = { tapelRekap: tapel, tapelAktif: setting.tapel, nonaktifIds };
  const kandidat = dasar.filter((s) => perluCekData(s, opsiSaring)).map((s) => s.id);
  const agregatKandidat =
    kandidat.length > 0 ? await ambilAgregatSemester(tapel, semester, kandidat) : new Map<number, Record<string, number>>();
  const semuaSiswa = saringSiswaRekap(dasar, { ...opsiSaring, adaAbsenIds: new Set(agregatKandidat.keys()), semesterRekap: semester });
  const totalSiswa = semuaSiswa.length;
  const totalPages = Math.max(1, Math.ceil(totalSiswa / pageSize));
  const pageAman = Math.min(Math.max(1, page), totalPages);
  const from = (pageAman - 1) * pageSize;
  const list = semuaSiswa.slice(from, from + pageSize).map((s) => ({
    id: s.siswa_id,
    name: s.nama,
    class: s.kelas,
    nisn: s.nisn,
    nonaktif_pada: s.nonaktif_pada,
    labelKeluar: labelKeluar(s.alasan_nonaktif, s.nonaktif_pada),
  }));
  if (list.length === 0) return { rows: [], totalHariEfektif, totalSiswa, totalPages, page: pageAman };

  const ids = list.map((s) => s.id);
  const [mapAbsen, penyebutKeluar] = await Promise.all([
    ambilAgregatSemester(tapel, semester, ids),
    petaPenyebutKeluar(tapel, semester, list.map((s) => s.nonaktif_pada), totalHariEfektif),
  ]);

  const rows: RekapHistoryRow[] = list.map((s) => {
    const m = mapAbsen.get(s.id) ?? {};
    const hadir = m.hadir ?? 0;
    const telat = m.terlambat ?? 0;
    const izin = m.izin ?? 0;
    const sakit = m.sakit ?? 0;
    const alpha = m.alpha ?? 0;
    const penyebut = s.nonaktif_pada ? (penyebutKeluar.get(s.nonaktif_pada) ?? totalHariEfektif) : totalHariEfektif;
    const persen = penyebut > 0 ? Math.round(((hadir + telat) / penyebut) * 1000) / 10 : 0;
    return { nama: s.name, kelas: s.class, nisn: s.nisn, labelKeluar: s.labelKeluar, hadir, telat, izin, sakit, alpha, persen };
  });

  return { rows, totalHariEfektif, totalSiswa, totalPages, page: pageAman };
}

/**
 * CATATAN: fungsi di bawah ini menarik SEMUA siswa hasil filter sekaligus
 * (tanpa batas), jadi khusus dipakai untuk kebutuhan yang memang butuh semua
 * baris sekaligus (export CSV/Excel). Untuk tabel di halaman /rekap-history,
 * pakai getRekapHistoryPage() di atas yang sudah true pagination.
 */
export async function getRekapHistory(
  tapel: string,
  semester: string,
  kelasFilter: string
): Promise<{ rows: RekapHistoryRow[]; totalHariEfektif: number }> {
  if (!tapel || !semester) return { rows: [], totalHariEfektif: 0 };

  const totalHariEfektif = await hitungHariEfektif(tapel, semester);

  const semua = (await getSiswaTapel(tapel, kelasFilter)).map((s) => ({
    id: s.siswa_id,
    name: s.nama,
    class: s.kelas,
    nisn: s.nisn,
    nonaktif_pada: s.nonaktif_pada,
    labelKeluar: labelKeluar(s.alasan_nonaktif, s.nonaktif_pada),
  }));
  if (semua.length === 0) return { rows: [], totalHariEfektif };

  const [mapAbsen, penyebutKeluar] = await Promise.all([
    ambilAgregatSemester(tapel, semester, semua.map((s) => s.id)),
    petaPenyebutKeluar(tapel, semester, semua.map((s) => s.nonaktif_pada), totalHariEfektif),
  ]);
  const [nonaktifIds, setting] = await Promise.all([ambilNonaktifIds(), getAbsensiSetting()]);
  const list = saringSiswaRekap(semua, {
    tapelRekap: tapel,
    tapelAktif: setting.tapel,
    nonaktifIds,
    adaAbsenIds: new Set(mapAbsen.keys()),
    semesterRekap: semester,
  });
  if (list.length === 0) return { rows: [], totalHariEfektif };

  const rows: RekapHistoryRow[] = list.map((s) => {
    const m = mapAbsen.get(s.id) ?? {};
    const hadir = m.hadir ?? 0;
    const telat = m.terlambat ?? 0;
    const izin = m.izin ?? 0;
    const sakit = m.sakit ?? 0;
    const alpha = m.alpha ?? 0;
    const penyebut = s.nonaktif_pada ? (penyebutKeluar.get(s.nonaktif_pada) ?? totalHariEfektif) : totalHariEfektif;
    const persen = penyebut > 0 ? Math.round(((hadir + telat) / penyebut) * 1000) / 10 : 0;
    return { nama: s.name, kelas: s.class, nisn: s.nisn, labelKeluar: s.labelKeluar, hadir, telat, izin, sakit, alpha, persen };
  });

  return { rows, totalHariEfektif };
}

export interface RekapBulananSiswaResult {
  d: Record<string, StatusBulanan>;
  tglList: string[];
  hadir: number;
  terlambat: number;
  izin: number;
  sakit: number;
  alpha: number;
}

/**
 * Versi khusus 1 siswa dari getRekapBulanan() di atas — dipakai di Portal
 * Siswa. SENGAJA fungsi baru (bukan panggil getRekapBulanan lalu filter satu
 * baris), supaya query absensi cuma narik data siswa itu sendiri, bukan
 * seluruh siswa 1 kelas yang notabene tidak dipakai di sini.
 */
export async function getRekapBulananSiswa(
  siswaId: number,
  bulanYYYYMM: string,
  liburMap: Map<string, string>
): Promise<RekapBulananSiswaResult> {
  const tglList = daftarTanggalBulan(bulanYYYYMM);
  const ta = `${bulanYYYYMM}-01`;
  const [y, m] = bulanYYYYMM.split("-").map(Number);
  const tk = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

  const { data: absenRows } = await supabaseAdmin
    .from("absensi")
    .select("tanggal, status")
    .eq("siswa_id", siswaId)
    .gte("tanggal", ta)
    .lte("tanggal", tk);

  const am = new Map((absenRows ?? []).map((r) => [r.tanggal, r.status as StatusAbsen]));
  const today = todayJakarta();

  const result: RekapBulananSiswaResult = {
    d: {},
    tglList,
    hadir: 0,
    terlambat: 0,
    izin: 0,
    sakit: 0,
    alpha: 0,
  };

  for (const tgl of tglList) {
    let st: StatusBulanan;
    if (liburMap.has(tgl)) {
      st = "libur";
    } else {
      const defaultStatus: StatusBulanan = tgl < today ? "alpha" : "kosong";
      st = am.get(tgl) ?? defaultStatus;
      if (st === "hadir" || st === "terlambat" || st === "izin" || st === "sakit" || st === "alpha") {
        result[st] = result[st] + 1;
      }
    }
    result.d[tgl] = st;
  }

  return result;
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

  const tapel = await tapelUntukBulan(bulanYYYYMM);
  const semua = (await getSiswaTapel(tapel, kelasFilter)).map((s) => ({
    id: s.siswa_id,
    name: s.nama,
    class: s.kelas,
    nonaktif_pada: s.nonaktif_pada,
    labelKeluar: labelKeluar(s.alasan_nonaktif, s.nonaktif_pada),
  }));
  if (semua.length === 0) return { rows: [], tglList };

  const ids = semua.map((s) => s.id);
  // Dipaginasi: satu bulan x >40 siswa sudah melewati batas 1000 baris PostgREST.
  // Tanpa ini baris yang terpotong tampil sebagai "alpha" palsu di rekap.
  const absenRows = await ambilSemua<{ siswa_id: number; tanggal: string; status: string }>((dari, sampai) =>
    supabaseAdmin
      .from("absensi")
      .select("siswa_id, tanggal, status")
      .gte("tanggal", ta)
      .lte("tanggal", tk)
      .in("siswa_id", ids)
      .order("id")
      .range(dari, sampai)
  );

  const am = new Map<number, Map<string, StatusAbsen>>();
  for (const r of absenRows) {
    if (!am.has(r.siswa_id)) am.set(r.siswa_id, new Map());
    am.get(r.siswa_id)!.set(r.tanggal, r.status as StatusAbsen);
  }

  // Siswa yang sudah pindah tampil kalau bulan ini masih ada hari efektif sampai tanggal pindahnya (termasuk),
  // atau punya absensi pada hari efektif bulan ini (bukan Minggu/libur, sama seperti perhitungan rekap).
  const hariEfektif = tglList.filter((t) => !liburMap.has(t));
  const tglEfektif = new Set(hariEfektif);
  const adaAbsenIds = new Set<number>();
  for (const r of absenRows) if (tglEfektif.has(r.tanggal)) adaAbsenIds.add(r.siswa_id);
  const [nonaktifIds, setting] = await Promise.all([ambilNonaktifIds(), getAbsensiSetting()]);
  const list = saringSiswaRekap(semua, {
    tapelRekap: tapel,
    tapelAktif: setting.tapel,
    nonaktifIds,
    adaAbsenIds,
    awalPeriode: hariEfektif[0] ?? null,
  });
  if (list.length === 0) return { rows: [], tglList };

  const today = todayJakarta();

  const rows: RekapBulananRow[] = list.map((s) => {
    const row: RekapBulananRow = {
      id: s.id,
      nama: s.name,
      kelas: s.class,
      labelKeluar: s.labelKeluar,
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
        // Pada tanggal pindah dan sesudahnya sel "nonaktif" dan tidak dihitung, apa pun record-nya
        // (record tidak dihapus; mengubah tanggal pindah mengembalikan hitungan).
        if (sudahKeluarPada(s.nonaktif_pada, tgl)) {
          st = "nonaktif";
        } else {
          st = am.get(s.id)?.get(tgl) ?? (tgl < today ? "alpha" : "kosong");
          if (st === "hadir" || st === "terlambat" || st === "izin" || st === "sakit" || st === "alpha") {
            row[st] = row[st] + 1;
          }
        }
      }
      row.d[tgl] = st;
    }
    return row;
  });

  return { rows, tglList };
}
