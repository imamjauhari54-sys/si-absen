"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/server";
import { createSession, destroySession } from "@/lib/auth/session";
import type { Role } from "@/types";

export interface LoginState {
  error: string | null;
}

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 5;

function sisaMenit(lockedUntil: string): number {
  const ms = new Date(lockedUntil).getTime() - Date.now();
  return Math.max(1, Math.ceil(ms / 60000));
}

/**
 * Port dari login.php.
 * - Cek users (username, password hash bcrypt, role)
 * - Rate limiting: 5x gagal berturut-turut -> akun dikunci 5 menit
 *   (anti brute-force; tanpa ini siapa pun bisa coba password tanpa batas)
 * - Kalau role guru, wajib punya baris di guru_mengajar_kelas dengan mapel = 'Guru Kelas'
 * - Kalau lolos, buat sesi JWT dan redirect ke /dashboard
 */
export async function loginAction(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");

  if (!username || !password) {
    return { error: "Username dan password wajib diisi." };
  }

  const { data: user, error: userErr } = await supabaseAdmin
    .from("users")
    .select("id, name, username, password, role, foto, failed_attempts, locked_until")
    .eq("username", username)
    .maybeSingle();

  if (userErr) {
    return { error: "Terjadi kesalahan server. Coba lagi." };
  }
  if (!user) {
    return { error: "Akun tidak ditemukan dalam sistem." };
  }

  // Cek apakah akun sedang terkunci karena kebanyakan gagal login
  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    return {
      error: `Akun dikunci sementara karena terlalu banyak percobaan gagal. Coba lagi dalam ${sisaMenit(user.locked_until)} menit.`,
    };
  }

  const passwordOk = await bcrypt.compare(password, user.password);
  if (!passwordOk) {
    const attempts = (user.failed_attempts ?? 0) + 1;
    if (attempts >= MAX_ATTEMPTS) {
      const lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60000).toISOString();
      await supabaseAdmin.from("users").update({ failed_attempts: 0, locked_until: lockedUntil }).eq("id", user.id);
      return { error: `Terlalu banyak percobaan gagal. Akun dikunci selama ${LOCKOUT_MINUTES} menit.` };
    }
    await supabaseAdmin.from("users").update({ failed_attempts: attempts }).eq("id", user.id);
    return { error: "Kata sandi yang Anda masukkan salah." };
  }

  const role = String(user.role || "").toLowerCase();
  if (role !== "admin" && role !== "guru") {
    return { error: "Role Anda tidak memiliki izin akses ke sistem ini." };
  }

  let kelas = "";
  if (role === "guru") {
    const { data: kelasRow } = await supabaseAdmin
      .from("guru_mengajar_kelas")
      .select("class")
      .eq("guru_id", user.id)
      .eq("mapel", "Guru Kelas")
      .maybeSingle();

    if (!kelasRow) {
      return { error: "Akses ditolak. Hanya Guru Kelas yang diizinkan masuk." };
    }
    kelas = kelasRow.class;
  }

  // Login berhasil: reset counter percobaan gagal
  if ((user.failed_attempts ?? 0) > 0 || user.locked_until) {
    await supabaseAdmin.from("users").update({ failed_attempts: 0, locked_until: null }).eq("id", user.id);
  }

  await createSession({
    userId: user.id,
    username: user.username,
    nama: user.name,
    role: role as Role,
    kelas,
    foto: user.foto ?? null,
  });

  redirect("/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
