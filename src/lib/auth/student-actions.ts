"use server";

import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/server";
import { createStudentSession, destroyStudentSession } from "@/lib/auth/student-session";

export interface CekAbsenState {
  error: string | null;
}

/**
 * Login Portal Siswa: cuma modal NISN, tanpa password (sesuai permintaan).
 *
 * CATATAN KEAMANAN (penting, tolong dibaca kalau nanti mau ubah):
 * NISN bukan rahasia yang kuat — banyak dipakai di rapor, kartu pelajar,
 * form sekolah, jadi siapa pun yang tahu/menebak NISN siswa lain bisa lihat
 * data absensinya (read-only, tidak bisa ubah apa pun). Ini trade-off yang
 * SENGAJA diambil demi kemudahan akses buat siswa tanpa perlu bikin akun.
 * Mitigasi yang sudah dipasang:
 * - Delay buatan tiap percobaan (mempersulit brute-force otomatis).
 * - Sesi cuma 30 menit & read-only total (tidak ada endpoint tulis apa pun
 *   yang menerima sesi siswa).
 * - Hanya siswa berstatus "aktif" yang bisa login.
 * Kalau butuh lebih ketat, opsi lanjutan: tambah captcha, atau minta 1 data
 * tambahan (mis. tanggal lahir / 4 digit terakhir NISN kelas) sebagai
 * "kunci kedua" tanpa perlu bikin akun/password penuh.
 */
export async function cekAbsenAction(
  _prevState: CekAbsenState,
  formData: FormData
): Promise<CekAbsenState> {
  const nisnRaw = String(formData.get("nisn") || "").trim();

  // Delay tetap ~350ms baik sukses maupun gagal, biar nggak bisa dipakai buat
  // nebak "NISN valid vs tidak" dari kecepatan respons (timing side-channel),
  // dan sekalian bikin scan-brute-force otomatis jadi jauh lebih lambat.
  const mulai = Date.now();
  const jagaWaktu = async () => {
    const sisa = 350 - (Date.now() - mulai);
    if (sisa > 0) await new Promise((r) => setTimeout(r, sisa));
  };

  if (!/^[0-9]{4,20}$/.test(nisnRaw)) {
    await jagaWaktu();
    return { error: "NISN wajib diisi, hanya berupa angka." };
  }

  const { data: siswa, error } = await supabaseAdmin
    .from("students")
    .select("id, name, class, nisn, status")
    .eq("nisn", nisnRaw)
    .eq("status", "aktif")
    .maybeSingle();

  await jagaWaktu();

  if (error || !siswa) {
    return { error: "NISN tidak ditemukan. Periksa kembali nomornya, atau hubungi wali kelas." };
  }

  await createStudentSession({
    siswaId: siswa.id,
    nama: siswa.name,
    kelas: siswa.class,
    nisn: siswa.nisn ?? nisnRaw,
  });

  redirect("/portal-siswa/dashboard");
}

export async function logoutSiswaAction() {
  await destroyStudentSession();
  redirect("/portal-siswa");
}
