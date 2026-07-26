import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSession } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import { normalizeKelas } from "@/lib/utils/kelas";
import { upsertKelasMaster } from "@/lib/data/kelas";
import { catatLog } from "@/lib/data/log-aktivitas";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ status: "error", message: "Akses ditolak" }, { status: 403 });
  }

  const form = await req.formData();
  const name = String(form.get("name") || "").trim();
  const username = String(form.get("username") || "").trim();
  const password = String(form.get("password") || "");
  const role = String(form.get("role") || "").trim();
  const kelas = normalizeKelas(String(form.get("kelas") || ""));
  const foto = String(form.get("foto") || "").trim();
  const wajibGantiPassword = String(form.get("wajib_ganti_password") || "") === "1";

  if (!name || !username || !password) {
    return NextResponse.json({ status: "error", message: "Nama, username, dan password wajib diisi." });
  }
  if (role !== "admin" && role !== "guru") {
    return NextResponse.json({ status: "error", message: "Role tidak valid." });
  }
  if (password.length < 8) {
    return NextResponse.json({ status: "error", message: "Password minimal 8 karakter." });
  }
  if (role === "guru" && !kelas) {
    return NextResponse.json({ status: "error", message: "Guru wajib memilih kelas yang diampu (wali kelas)." });
  }

  const { data: existing } = await supabaseAdmin.from("users").select("id").eq("username", username).maybeSingle();
  if (existing) {
    return NextResponse.json({ status: "error", message: "Username sudah dipakai, gunakan username lain." });
  }

  const hash = await bcrypt.hash(password, 10);

  const { data: inserted, error } = await supabaseAdmin
    .from("users")
    .insert({ name, username, password: hash, role, foto: foto || null, must_change_password: wajibGantiPassword })
    .select("id")
    .single();

  if (error || !inserted) {
    const message = error?.message.includes("username") ? "Username sudah dipakai, gunakan username lain." : error?.message;
    return NextResponse.json({ status: "error", message: message || "Gagal menambahkan pengguna." });
  }

  if (role === "guru" && kelas) {
    const { error: kelasErr } = await supabaseAdmin
      .from("guru_mengajar_kelas")
      .insert({ guru_id: inserted.id, class: kelas, mapel: "Guru Kelas" });
    if (kelasErr) {
      return NextResponse.json({ status: "error", message: "Pengguna dibuat, tapi gagal menyimpan kelas: " + kelasErr.message });
    }
    await upsertKelasMaster(kelas);
  }

  await catatLog(session.userId, "tambah_user", name, `Menambahkan pengguna baru "${name}" (@${username}) dengan role ${role}.`);

  return NextResponse.json({ status: "ok" });
}
