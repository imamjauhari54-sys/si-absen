"use server";

import { revalidateTag } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import { setSettingValue } from "@/lib/data/settings";
import type { SettingActionState } from "./setting-types";

export async function simpanInfoSekolahAction(_prev: SettingActionState, formData: FormData): Promise<SettingActionState> {
  const session = await getSession();
  if (!session) return { status: "error", message: "Sesi berakhir, silakan login ulang." };
  if (session.role !== "admin") return { status: "error", message: "Akses ditolak! Hanya admin yang dapat mengubah info sekolah." };

  const namaSekolah = String(formData.get("nama_sekolah") || "").trim();
  const alamat = String(formData.get("alamat_sekolah") || "").trim();

  if (!namaSekolah) return { status: "error", message: "Nama sekolah wajib diisi." };

  const [r1, r2] = await Promise.all([
    setSettingValue("nama_sekolah", namaSekolah),
    setSettingValue("alamat_sekolah", alamat),
  ]);

  if (r1.error || r2.error) {
    return { status: "error", message: r1.error || r2.error || "Gagal menyimpan info sekolah." };
  }

  // Buang cache "settings" (dipakai getNamaSekolah di (app)/layout.tsx untuk
  // header di semua halaman) supaya perubahan nama sekolah langsung kelihatan
  // di navigasi berikutnya, bukan nunggu cache lama.
  revalidateTag("settings", "max");

  return { status: "ok", message: "Info sekolah berhasil diperbarui." };
}

export async function simpanWaSettingAction(_prev: SettingActionState, formData: FormData): Promise<SettingActionState> {
  const session = await getSession();
  if (!session) return { status: "error", message: "Sesi berakhir, silakan login ulang." };
  if (session.role !== "admin") return { status: "error", message: "Akses ditolak! Hanya admin yang dapat mengubah pengaturan ini." };

  const enabled = formData.get("wa_enabled") === "1";
  const gatewayUrl = String(formData.get("wa_gateway_url") || "").trim();
  const apiKey = String(formData.get("wa_api_key") || "").trim();

  if (enabled && (!gatewayUrl || !apiKey)) {
    return { status: "error", message: "URL Gateway dan API Key wajib diisi kalau notifikasi WA diaktifkan." };
  }

  const results = await Promise.all([
    setSettingValue("wa_enabled", enabled ? "true" : "false"),
    setSettingValue("wa_gateway_url", gatewayUrl),
    setSettingValue("wa_api_key", apiKey),
  ]);
  const err = results.find((r) => r.error);
  if (err?.error) return { status: "error", message: err.error };

  return { status: "ok", message: "Pengaturan notifikasi WhatsApp berhasil disimpan." };
}

export async function simpanJadwalAction(_prev: SettingActionState, formData: FormData): Promise<SettingActionState> {
  const session = await getSession();
  if (!session) return { status: "error", message: "Sesi berakhir, silakan login ulang." };
  if (session.role !== "admin") {
    return { status: "error", message: "Akses ditolak! Hanya admin yang dapat mengubah jadwal & batas operasional sistem." };
  }

  const jm = String(formData.get("jam_masuk") || "07:00");
  const bt = String(formData.get("batas_terlambat") || "07:15");
  const jp = String(formData.get("jam_pulang") || "11:30");
  const tp = String(formData.get("tapel") || "2025/2026").trim();
  const smRaw = String(formData.get("semester") || "genap");
  const sm = smRaw === "ganjil" ? "ganjil" : "genap";

  const dkRaw = parseInt(String(formData.get("durasi_kunci_menit") || "120"), 10);
  const durasiKunciMenit = Number.isFinite(dkRaw) && dkRaw > 0 ? dkRaw : 120;
  const tpRaw = parseInt(String(formData.get("toleransi_pagi_menit") || "60"), 10);
  const toleransiPagiMenit = Number.isFinite(tpRaw) && tpRaw >= 0 ? tpRaw : 60;

  const { data: existing } = await supabaseAdmin.from("absensi_setting").select("id").limit(1).maybeSingle();

  const payload = {
    jam_masuk: `${jm}:00`,
    batas_terlambat: `${bt}:00`,
    jam_pulang_mulai: `${jp}:00`,
    tapel: tp,
    semester: sm,
    durasi_kunci_menit: durasiKunciMenit,
    toleransi_pagi_menit: toleransiPagiMenit,
  };

  const { error } = existing
    ? await supabaseAdmin.from("absensi_setting").update(payload).eq("id", existing.id)
    : await supabaseAdmin.from("absensi_setting").insert(payload);

  if (error) return { status: "error", message: error.message };

  // getAbsensiSetting() di-cache (dipakai dashboard & setiap scan QR) —
  // buang cache-nya di sini supaya jam masuk/batas terlambat baru langsung
  // berlaku, tidak nunggu cache lama expired.
  revalidateTag("absensi-setting", "max");

  return { status: "ok", message: "Pengaturan sistem berhasil disimpan dan diperbarui." };
}

const BULAN_ID: Record<number, string> = {
  1: "Januari", 2: "Februari", 3: "Maret", 4: "April", 5: "Mei", 6: "Juni",
  7: "Juli", 8: "Agustus", 9: "September", 10: "Oktober", 11: "November", 12: "Desember",
};
function formatBulan(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  return `${BULAN_ID[m]} ${y}`;
}

export async function resetDataAction(_prev: SettingActionState, formData: FormData): Promise<SettingActionState> {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return { status: "error", message: "Akses ditolak!" };
  }

  const konfirmasi = String(formData.get("konfirmasi_teks") || "");
  const periode = String(formData.get("periode_reset") || "");
  const kelasFilter = String(formData.get("kelas_filter") || "");

  if (!periode) return { status: "error", message: "Pilih periode terlebih dahulu!" };
  if (konfirmasi !== "HAPUS") return { status: "error", message: "Gagal: Kata konfirmasi 'HAPUS' tidak cocok." };

  // Cari siswa_id yang match filter kelas (opsional)
  let studentsQuery = supabaseAdmin.from("students").select("id");
  if (kelasFilter) studentsQuery = studentsQuery.eq("class", kelasFilter);
  const { data: students } = await studentsQuery;
  const studentIds = (students ?? []).map((s) => s.id);
  if (studentIds.length === 0) {
    return { status: "error", message: "Tidak ada data untuk dihapus di periode/kelas yang dipilih." };
  }

  let absensiQuery = supabaseAdmin.from("absensi").select("siswa_id").in("siswa_id", studentIds);
  if (periode !== "all") {
    absensiQuery = absensiQuery.gte("tanggal", `${periode}-01`).lte("tanggal", `${periode}-31`);
  }
  const { data: absenRows } = await absensiQuery;
  const siswaIds = Array.from(new Set((absenRows ?? []).map((r) => r.siswa_id)));

  if (siswaIds.length === 0) {
    return { status: "error", message: "Tidak ada data untuk dihapus di periode/kelas yang dipilih." };
  }

  // Hapus log dulu, baru absensi (pola sama seperti PHP aslinya)
  let logQuery = supabaseAdmin.from("absensi_log").delete().in("siswa_id", siswaIds);
  if (periode !== "all") logQuery = logQuery.gte("tanggal_absen", `${periode}-01`).lte("tanggal_absen", `${periode}-31`);
  const { error: err1 } = await logQuery;

  let absDelQuery = supabaseAdmin.from("absensi").delete().in("siswa_id", siswaIds);
  if (periode !== "all") absDelQuery = absDelQuery.gte("tanggal", `${periode}-01`).lte("tanggal", `${periode}-31`);
  const { error: err2 } = await absDelQuery;

  if (err1 || err2) {
    return { status: "error", message: "Gagal menghapus data: " + (err1?.message || err2?.message) };
  }

  let message: string;
  if (kelasFilter && periode !== "all") {
    message = `Data absensi kelas ${kelasFilter} bulan ${formatBulan(periode)} berhasil dihapus.`;
  } else if (kelasFilter) {
    message = `Semua data absensi kelas ${kelasFilter} berhasil dihapus.`;
  } else if (periode === "all") {
    message = "Semua data absensi di database berhasil dihapus.";
  } else {
    message = `Data absensi bulan ${formatBulan(periode)} berhasil dihapus.`;
  }

  return { status: "ok", message };
}
