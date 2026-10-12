"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import { catatLog } from "@/lib/data/log-aktivitas";
import { normalizeKelas } from "@/lib/utils/kelas";
import { KONFIRMASI_KENAIKAN, LULUS } from "@/lib/utils/kenaikan";
import { validTapel } from "@/lib/utils/tapel";
import type { SettingActionState } from "./setting-types";

const MAKS_PEMETAAN = 200;
const MAKS_PENGECUALIAN = 5000;

function pesanDatabase(message: string): string {
  // Fungsi belum ada di database = migrasi belum dijalankan.
  if (/could not find the function|does not exist|schema cache/i.test(message)) {
    return "Fungsi kenaikan kelas belum ada di database. Jalankan migrasi 017_kenaikan_kelas.sql lebih dulu.";
  }
  return message;
}

function segarkan() {
  // Kelas siswa, daftar kelas, dan tapel/semester aktif berubah sekaligus.
  revalidateTag("absensi-setting", "max");
  revalidateTag("kelas-master", "max");
  revalidateTag("siswa", "max");
  for (const p of ["/kenaikan-kelas", "/siswa", "/kelas", "/setting", "/dashboard", "/rekap", "/rekap-history"]) {
    revalidatePath(p);
  }
}

interface Payload {
  tapel_tujuan: string;
  semester: string;
  jumlah_aktif: number;
  pemetaan: { dari: string; ke: string }[];
  pengecualian: { siswa_id: number; ke: string }[];
}

function bacaPayload(raw: string): Payload | string {
  let p: unknown;
  try {
    p = JSON.parse(raw);
  } catch {
    return "Data tidak valid. Muat ulang halaman lalu coba lagi.";
  }
  if (!p || typeof p !== "object") return "Data tidak valid.";
  const o = p as Record<string, unknown>;

  if (typeof o.tapel_tujuan !== "string" || !validTapel(o.tapel_tujuan)) return "Tahun pelajaran tujuan tidak valid.";
  if (o.semester !== "ganjil" && o.semester !== "genap") return "Semester tidak valid.";
  if (!Number.isInteger(o.jumlah_aktif) || (o.jumlah_aktif as number) < 0) return "Data tidak valid.";
  if (!Array.isArray(o.pemetaan) || o.pemetaan.length === 0 || o.pemetaan.length > MAKS_PEMETAAN) return "Pemetaan kelas tidak valid.";
  if (!Array.isArray(o.pengecualian) || o.pengecualian.length > MAKS_PENGECUALIAN) return "Data pengecualian tidak valid.";

  const pemetaan: Payload["pemetaan"] = [];
  for (const m of o.pemetaan as unknown[]) {
    const r = m as { dari?: unknown; ke?: unknown };
    if (typeof r?.dari !== "string" || typeof r?.ke !== "string") return "Pemetaan kelas tidak valid.";
    // `dari` harus persis sama dengan students.class → tidak dinormalisasi. `ke` dirapikan seperti input kelas lain.
    const ke = r.ke === LULUS ? LULUS : normalizeKelas(r.ke);
    if (!ke) return `Tujuan untuk kelas ${r.dari} belum dipilih.`;
    pemetaan.push({ dari: r.dari, ke });
  }

  const pengecualian: Payload["pengecualian"] = [];
  for (const e of o.pengecualian as unknown[]) {
    const r = e as { siswa_id?: unknown; ke?: unknown };
    if (!Number.isInteger(r?.siswa_id) || typeof r?.ke !== "string") return "Data pengecualian tidak valid.";
    const ke = r.ke === LULUS ? LULUS : normalizeKelas(r.ke);
    if (!ke) return "Ada pengecualian siswa tanpa kelas tujuan.";
    pengecualian.push({ siswa_id: r.siswa_id as number, ke });
  }

  return {
    tapel_tujuan: o.tapel_tujuan,
    semester: o.semester,
    jumlah_aktif: o.jumlah_aktif as number,
    pemetaan,
    pengecualian,
  };
}

/** Mulai tahun ajaran baru: naikkan kelas + luluskan + pindahkan tapel aktif (1 transaksi di database). */
export async function jalankanKenaikanAction(_prev: SettingActionState, formData: FormData): Promise<SettingActionState> {
  const session = await getSession();
  if (!session) return { status: "error", message: "Sesi berakhir, silakan login ulang." };
  if (session.role !== "admin") return { status: "error", message: "Akses ditolak! Hanya admin yang dapat menjalankan kenaikan kelas." };

  if (String(formData.get("konfirmasi") || "") !== KONFIRMASI_KENAIKAN) {
    return { status: "error", message: `Konfirmasi tidak cocok. Ketik "${KONFIRMASI_KENAIKAN}" persis seperti itu.` };
  }

  const payload = bacaPayload(String(formData.get("payload") || ""));
  if (typeof payload === "string") return { status: "error", message: payload };

  const { data, error } = await supabaseAdmin.rpc("naik_kelas", {
    p_tapel_tujuan: payload.tapel_tujuan,
    p_semester: payload.semester,
    p_pemetaan: payload.pemetaan,
    p_pengecualian: payload.pengecualian,
    p_jumlah_aktif: payload.jumlah_aktif,
    p_user_id: session.userId,
  });
  if (error) return { status: "error", message: pesanDatabase(error.message) };

  const hasil = (Array.isArray(data) ? data[0] : data) as
    | { jumlah_naik?: number; jumlah_tetap?: number; jumlah_lulus?: number }
    | null;
  const naik = Number(hasil?.jumlah_naik ?? 0);
  const tetap = Number(hasil?.jumlah_tetap ?? 0);
  const lulus = Number(hasil?.jumlah_lulus ?? 0);

  await catatLog(
    session.userId,
    "kenaikan_kelas",
    payload.tapel_tujuan,
    `Kenaikan kelas ke ${payload.tapel_tujuan} semester ${payload.semester}: ${naik} naik, ${tetap} tidak naik, ${lulus} lulus.`
  );
  segarkan();

  return {
    status: "ok",
    message: `Kenaikan kelas selesai: ${naik} naik, ${tetap} tidak naik, ${lulus} lulus. Tahun pelajaran aktif sekarang ${payload.tapel_tujuan} semester ${payload.semester}.`,
  };
}

/** Batalkan kenaikan kelas terakhir (hanya selama tapel barunya belum punya absensi). */
export async function batalkanKenaikanAction(): Promise<SettingActionState> {
  const session = await getSession();
  if (!session) return { status: "error", message: "Sesi berakhir, silakan login ulang." };
  if (session.role !== "admin") return { status: "error", message: "Akses ditolak! Hanya admin yang dapat membatalkan kenaikan kelas." };

  const { data, error } = await supabaseAdmin.rpc("batalkan_kenaikan_kelas", { p_id: null });
  if (error) return { status: "error", message: pesanDatabase(error.message) };

  const hasil = (Array.isArray(data) ? data[0] : data) as
    | { tapel_dikembalikan?: string; siswa_dikembalikan?: number }
    | null;
  const tapel = hasil?.tapel_dikembalikan ?? "";
  const jumlah = Number(hasil?.siswa_dikembalikan ?? 0);

  await catatLog(session.userId, "batal_kenaikan_kelas", tapel, `Membatalkan kenaikan kelas terakhir; ${jumlah} siswa dikembalikan, tahun pelajaran aktif kembali ke ${tapel}.`);
  segarkan();

  return { status: "ok", message: `Kenaikan kelas dibatalkan. ${jumlah} siswa dikembalikan; tahun pelajaran aktif kembali ke ${tapel}.` };
}
