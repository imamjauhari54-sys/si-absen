"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/server";
import { createSession, destroySession } from "@/lib/auth/session";
import type { Role } from "@/types";

export interface LoginState {
  error: string | null;
}

/**
 * Port dari login.php.
 * - Cek users (username, password hash bcrypt, role)
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
    .select("id, name, username, password, role, foto")
    .eq("username", username)
    .maybeSingle();

  if (userErr) {
    return { error: "Terjadi kesalahan server. Coba lagi." };
  }
  if (!user) {
    return { error: "Akun tidak ditemukan dalam sistem." };
  }

  const passwordOk = await bcrypt.compare(password, user.password);
  if (!passwordOk) {
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
