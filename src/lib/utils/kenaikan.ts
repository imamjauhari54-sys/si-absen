/**
 * Logika murni untuk wizard Kenaikan Kelas (tanpa akses database, mudah dites).
 * Dipakai di sisi klien untuk pratinjau; database tetap memvalidasi ulang di naik_kelas().
 */

/** Nilai khusus "tujuan" yang berarti lulus (harus sama dengan konstanta di migrasi 017). */
export const LULUS = "__lulus__";

/** Teks yang harus diketik admin untuk menjalankan kenaikan kelas. */
export const KONFIRMASI_KENAIKAN = "NAIK KELAS";

export interface SiswaKenaikan {
  id: number;
  name: string;
  class: string;
}

/** "5A" → { angka: 5, akhiran: "A" }; "Kelas X"/"VI" (tanpa angka di depan) → null. */
export function parseKelas(nama: string): { angka: number; akhiran: string } | null {
  const m = /^(\d+)(.*)$/.exec(nama.trim());
  if (!m) return null;
  return { angka: Number(m[1]), akhiran: m[2] };
}

/** Urut alami: 2 < 10, 5A < 5B; yang tidak berangka ditaruh di belakang. */
export function urutKelas(a: string, b: string): number {
  const pa = parseKelas(a);
  const pb = parseKelas(b);
  if (pa && pb) return pa.angka - pb.angka || pa.akhiran.localeCompare(pb.akhiran, "id");
  if (pa) return -1;
  if (pb) return 1;
  return a.localeCompare(b, "id");
}

/** Tingkat tertinggi yang ada (mis. 6 untuk SD). Minimal 6 supaya sekolah yang baru berisi kelas 4–5 tidak salah dianggap lulus di kelas 5. */
export function tingkatAkhirDefault(daftarKelas: string[]): number {
  const angka = daftarKelas.map((k) => parseKelas(k)?.angka).filter((n): n is number => n !== undefined);
  return Math.max(6, ...angka);
}

/**
 * Usulan tujuan untuk satu kelas: angka +1 dengan akhiran tetap (5A → 6A), lulus kalau sudah di
 * tingkat akhir. Mengembalikan "" kalau nama kelas tidak berangka (admin harus memilih sendiri).
 */
export function usulanTujuan(dari: string, tingkatAkhir: number): string {
  const p = parseKelas(dari);
  if (!p) return "";
  if (p.angka >= tingkatAkhir) return LULUS;
  return `${p.angka + 1}${p.akhiran}`;
}

export interface OpsiTujuan {
  value: string;
  label: string;
}

/**
 * Pilihan tujuan yang masuk akal untuk satu kelas: NAIK (atau LULUS kalau sudah tingkat akhir) dan
 * TIDAK NAIK. Kelas 5 → "Naik ke Kelas 6" / "Tidak naik"; kelas 6 → "Lulus" / "Tidak naik".
 * Mengembalikan null kalau nama kelas tidak berangka (tujuannya tidak bisa ditebak → pemanggil
 * menampilkan pilihan lengkap).
 */
export function opsiTujuanKelas(dari: string, tingkatAkhir: number, kelasMaster: string[]): OpsiTujuan[] | null {
  const usulan = usulanTujuan(dari, tingkatAkhir);
  if (!usulan) return null;
  const naik: OpsiTujuan =
    usulan === LULUS
      ? { value: LULUS, label: "Lulus" }
      : { value: usulan, label: `Naik ke Kelas ${usulan}${kelasMaster.includes(usulan) ? "" : " (baru)"}` };
  return [naik, { value: dari, label: `Tidak naik (tetap Kelas ${dari})` }];
}

/**
 * Pemetaan efektif per kelas = pilihan admin (override) kalau masih termasuk pilihan yang sah
 * (naik/lulus atau tidak naik), kalau tidak usulan otomatis. Override yang jadi basi (mis. admin
 * mengubah "kelas terakhir" sesudah memilih Lulus) otomatis diabaikan.
 */
export function petaEfektif(
  daftarKelas: string[],
  override: Record<string, string>,
  tingkatAkhir: number
): Record<string, string> {
  const hasil: Record<string, string> = {};
  for (const k of daftarKelas) {
    const usulan = usulanTujuan(k, tingkatAkhir);
    const o = override[k];
    const sah = o !== undefined && o !== "" && (usulan === "" || o === usulan || o === k);
    hasil[k] = sah ? o : usulan;
  }
  return hasil;
}

/** Buang pengecualian per siswa yang sudah tidak sah (sama aturannya dengan petaEfektif). */
export function pengecualianSah(
  siswa: SiswaKenaikan[],
  pengecualian: Record<number, string>,
  tingkatAkhir: number
): Record<number, string> {
  const hasil: Record<number, string> = {};
  for (const s of siswa) {
    const o = pengecualian[s.id];
    if (!o) continue;
    const usulan = usulanTujuan(s.class, tingkatAkhir);
    if (usulan === "" || o === usulan || o === s.class) hasil[s.id] = o;
  }
  return hasil;
}

/** Tujuan satu siswa: pengecualian per siswa menang atas pemetaan kelas. "" = belum ditentukan. */
export function tujuanSiswa(
  s: SiswaKenaikan,
  pemetaan: Record<string, string>,
  pengecualian: Record<number, string>
): string {
  return pengecualian[s.id] || pemetaan[s.class] || "";
}

export interface RingkasanKelas {
  dari: string;
  jumlah: number;
  /** tujuan kelas ini menurut pemetaan ("" = belum dipilih) */
  ke: string;
  naik: number;
  tetap: number;
  lulus: number;
  belum: number;
}

export interface RingkasanKenaikan {
  perKelas: RingkasanKelas[];
  total: { naik: number; tetap: number; lulus: number; belum: number; siswa: number };
  /** kelas yang masih ada siswanya tapi tujuannya belum dipilih */
  belumDipetakan: string[];
  jumlahPengecualian: number;
}

export function ringkasKenaikan(
  siswa: SiswaKenaikan[],
  pemetaan: Record<string, string>,
  pengecualian: Record<number, string>
): RingkasanKenaikan {
  const peta = new Map<string, RingkasanKelas>();
  const total = { naik: 0, tetap: 0, lulus: 0, belum: 0, siswa: siswa.length };

  for (const s of siswa) {
    let r = peta.get(s.class);
    if (!r) {
      r = { dari: s.class, jumlah: 0, ke: pemetaan[s.class] ?? "", naik: 0, tetap: 0, lulus: 0, belum: 0 };
      peta.set(s.class, r);
    }
    r.jumlah++;
    const ke = tujuanSiswa(s, pemetaan, pengecualian);
    if (!ke) {
      r.belum++;
      total.belum++;
    } else if (ke === LULUS) {
      r.lulus++;
      total.lulus++;
    } else if (ke === s.class) {
      r.tetap++;
      total.tetap++;
    } else {
      r.naik++;
      total.naik++;
    }
  }

  const perKelas = [...peta.values()].sort((a, b) => urutKelas(a.dari, b.dari));
  return {
    perKelas,
    total,
    belumDipetakan: perKelas.filter((r) => r.belum > 0).map((r) => r.dari),
    jumlahPengecualian: Object.keys(pengecualian).length,
  };
}

/** Nama kelas tujuan yang belum ada di master (akan didaftarkan otomatis oleh database). */
export function kelasTujuanBaru(
  siswa: SiswaKenaikan[],
  pemetaan: Record<string, string>,
  pengecualian: Record<number, string>,
  kelasAda: string[]
): string[] {
  const ada = new Set(kelasAda);
  const baru = new Set<string>();
  for (const s of siswa) {
    const ke = tujuanSiswa(s, pemetaan, pengecualian);
    if (ke && ke !== LULUS && !ada.has(ke)) baru.add(ke);
  }
  return [...baru].sort(urutKelas);
}

/** Bentuk masukan untuk fungsi database naik_kelas(): pemetaan hanya untuk kelas yang berisi siswa. */
export function buatPayload(
  siswa: SiswaKenaikan[],
  pemetaan: Record<string, string>,
  pengecualian: Record<number, string>
): { pemetaan: { dari: string; ke: string }[]; pengecualian: { siswa_id: number; ke: string }[] } {
  const kelasAda = [...new Set(siswa.map((s) => s.class))].sort(urutKelas);
  const idAktif = new Set(siswa.map((s) => s.id));
  return {
    pemetaan: kelasAda.map((dari) => ({ dari, ke: pemetaan[dari] ?? "" })),
    // Pengecualian yang hasilnya sama dengan pemetaan kelasnya tidak perlu dikirim.
    pengecualian: Object.entries(pengecualian)
      .map(([id, ke]) => ({ siswa_id: Number(id), ke }))
      .filter((e) => idAktif.has(e.siswa_id) && e.ke !== "")
      .filter((e) => {
        const s = siswa.find((x) => x.id === e.siswa_id)!;
        return e.ke !== pemetaan[s.class];
      }),
  };
}
