import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import bcrypt from "bcryptjs";
import { getSession } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ status: "error", message: "Sesi berakhir, silakan login ulang." }, { status: 401 });
  }

  const form = await req.formData();
  const passwordLama = String(form.get("password_lama") || "");
  const passwordBaru = String(form.get("password_baru") || "");

  if (!passwordLama || !passwordBaru) {
    return NextResponse.json({ status: "error", message: "Password lama dan baru wajib diisi." });
  }
  if (passwordBaru.length < 8) {
    return NextResponse.json({ status: "error", message: "Password baru minimal 8 karakter." });
  }

  const { data: user } = await supabaseAdmin.from("users").select("password").eq("id", session.userId).maybeSingle();
  if (!user) {
    return NextResponse.json({ status: "error", message: "Pengguna tidak ditemukan." });
  }

  const cocok = await bcrypt.compare(passwordLama, user.password);
  if (!cocok) {
    return NextResponse.json({ status: "error", message: "Password lama yang Anda masukkan salah." });
  }

  const hashBaru = await bcrypt.hash(passwordBaru, 10);
  const { error } = await supabaseAdmin
    .from("users")
    .update({ password: hashBaru, must_change_password: false })
    .eq("id", session.userId);

  if (error) {
    return NextResponse.json({ status: "error", message: error.message });
  }

  // cekWajibGantiPassword() di-cache — buang cache-nya SEKARANG, jangan
  // nunggu 60 detik, supaya user tidak diarahkan balik ke /ganti-password
  // setelah baru saja berhasil menggantinya.
  revalidateTag(`user-id-${session.userId}`, "max");

  return NextResponse.json({ status: "ok" });
}
