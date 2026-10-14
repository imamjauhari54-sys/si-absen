"use server";

import { revalidateTag } from "next/cache";
import { getSession, createSession } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/server";

export interface SimpanProfilInput {
  nama: string;
  nip: string;
  foto: string;
}

export interface SimpanProfilResult {
  status: "ok" | "error";
  message: string;
}

/**
 * Edit profil milik sendiri (admin maupun guru). Hanya nama, NIP, dan foto yang bisa diubah;
 * username & role sengaja tidak bisa diubah dari sini (admin mengubahnya lewat Manajemen Pengguna).
 */
export async function simpanProfilAction(input: SimpanProfilInput): Promise<SimpanProfilResult> {
  const session = await getSession();
  if (!session) return { status: "error", message: "Sesi berakhir, silakan login ulang." };

  const nama = String(input.nama ?? "").trim();
  const nip = String(input.nip ?? "").trim();
  const foto = String(input.foto ?? "").trim();

  if (!nama) return { status: "error", message: "Nama lengkap wajib diisi." };
  if (nama.length > 100) return { status: "error", message: "Nama terlalu panjang (maksimal 100 karakter)." };
  if (nip.length > 30) return { status: "error", message: "NIP terlalu panjang (maksimal 30 karakter)." };
  if (foto && !/^https:\/\//i.test(foto)) return { status: "error", message: "URL foto tidak valid." };

  const { error } = await supabaseAdmin
    .from("users")
    .update({ name: nama, nip: nip || null, foto: foto || null })
    .eq("id", session.userId);

  if (error) {
    const kolomNipBelumAda = error.message.toLowerCase().includes("nip");
    return {
      status: "error",
      message: kolomNipBelumAda
        ? "Kolom NIP belum ada di database. Jalankan migrasi 018_users_nip.sql di Supabase."
        : error.message,
    };
  }

  // Nama & foto dibaca dari JWT cookie, jadi sinkronkan supaya langsung berubah tanpa login ulang.
  await createSession({ ...session, nama, foto: foto || null });
  revalidateTag(`user-${session.username}`, "max");

  return { status: "ok", message: "Profil berhasil diperbarui." };
}
