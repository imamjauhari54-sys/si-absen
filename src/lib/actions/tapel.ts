"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import { catatLog } from "@/lib/data/log-aktivitas";
import { tambahTapel, tapelAdaDiMaster } from "@/lib/data/tapel";
import { formatTapel, TAHUN_MULAI_MAX, TAHUN_MULAI_MIN } from "@/lib/utils/tapel";
import type { SettingActionState } from "./setting-types";

/** Tambah tapel ke daftar master. TIDAK mengaktifkannya. */
export async function tambahTapelAction(_prev: SettingActionState, formData: FormData): Promise<SettingActionState> {
  const session = await getSession();
  if (!session) return { status: "error", message: "Sesi berakhir, silakan login ulang." };
  if (session.role !== "admin") return { status: "error", message: "Akses ditolak! Hanya admin yang dapat menambah tahun pelajaran." };

  // Admin hanya mengisi tahun mulai; nama tapel dibentuk server → tidak mungkin salah format.
  const tahunMulai = Number(String(formData.get("tahun_mulai") || "").trim());
  if (!Number.isInteger(tahunMulai) || tahunMulai < TAHUN_MULAI_MIN || tahunMulai > TAHUN_MULAI_MAX) {
    return { status: "error", message: `Tahun mulai harus berupa angka antara ${TAHUN_MULAI_MIN} dan ${TAHUN_MULAI_MAX}.` };
  }

  const nama = formatTapel(tahunMulai);
  const { error, duplikat } = await tambahTapel(nama);
  if (duplikat) return { status: "error", message: `Tahun pelajaran ${nama} sudah ada di daftar.` };
  if (error) return { status: "error", message: error };

  await catatLog(session.userId, "tambah_tapel", nama, `Menambahkan tahun pelajaran baru: ${nama}`);
  revalidatePath("/setting");
  revalidatePath("/kenaikan-kelas"); // dropdown tapel tujuan di wizard Kenaikan Kelas
  return { status: "ok", message: `Tahun pelajaran ${nama} ditambahkan. Tapel aktif tidak berubah.` };
}

/**
 * Ubah tapel dan/atau semester AKTIF (global: scan QR dan auto-alpha men-stamp nilai ini).
 * Dipakai oleh dua modal: "Ganti Tapel Aktif" dan "Ganti Semester" (yang mengirim tapel aktif apa adanya).
 */
export async function setPeriodeAktifAction(_prev: SettingActionState, formData: FormData): Promise<SettingActionState> {
  const session = await getSession();
  if (!session) return { status: "error", message: "Sesi berakhir, silakan login ulang." };
  if (session.role !== "admin") return { status: "error", message: "Akses ditolak! Hanya admin yang dapat mengubah tahun pelajaran aktif." };

  const tapel = String(formData.get("tapel") || "").trim();
  const semesterRaw = String(formData.get("semester") || "");
  if (semesterRaw !== "ganjil" && semesterRaw !== "genap") {
    return { status: "error", message: "Semester tidak valid." };
  }
  const semester = semesterRaw;

  // Jangan percaya nilai dari form: tapel harus ada di master.
  if (!(await tapelAdaDiMaster(tapel))) {
    return { status: "error", message: "Tahun pelajaran tidak ada di daftar. Tambahkan dulu lewat \"Tambah Tapel\"." };
  }

  const { data: existing } = await supabaseAdmin
    .from("absensi_setting")
    .select("id, tapel, semester")
    .limit(1)
    .maybeSingle();

  if (existing && existing.tapel === tapel && existing.semester === semester) {
    return { status: "ok", message: "Tahun pelajaran dan semester tersebut sudah aktif." };
  }

  const { error } = existing
    ? await supabaseAdmin.from("absensi_setting").update({ tapel, semester }).eq("id", existing.id)
    : await supabaseAdmin.from("absensi_setting").insert({ tapel, semester });
  if (error) return { status: "error", message: error.message };

  // getAbsensiSetting() di-cache dan dipakai tiap scan QR + dashboard: buang cache-nya
  // supaya tapel/semester baru langsung berlaku.
  revalidateTag("absensi-setting", "max");
  revalidatePath("/setting");

  const lama = existing ? `${existing.tapel} ${existing.semester}` : "(belum diatur)";
  await catatLog(session.userId, "ganti_periode", `${tapel} ${semester}`, `Mengubah periode aktif dari ${lama} menjadi ${tapel} ${semester}.`);

  return { status: "ok", message: `Periode aktif sekarang ${tapel} semester ${semester}.` };
}
