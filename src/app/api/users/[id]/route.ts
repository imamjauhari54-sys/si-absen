import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSession, createSession } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import { normalizeKelas } from "@/lib/utils/kelas";
import { upsertKelasMaster } from "@/lib/data/kelas";
import { catatLog } from "@/lib/data/log-aktivitas";
import { isDeveloperUsername } from "@/lib/auth/developer";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ status: "error", message: "Akses ditolak" }, { status: 403 });
  }

  const { id } = await params;
  const userId = parseInt(id, 10);
  if (!userId) return NextResponse.json({ status: "error", message: "ID tidak valid" }, { status: 400 });

  const { data: targetUser } = await supabaseAdmin.from("users").select("username").eq("id", userId).maybeSingle();
  if (isDeveloperUsername(targetUser?.username)) {
    return NextResponse.json({ status: "error", message: "Pengguna tidak ditemukan." }, { status: 404 });
  }

  const form = await req.formData();
  const name = String(form.get("name") || "").trim();
  const username = String(form.get("username") || "").trim();
  const password = String(form.get("password") || "");
  const role = String(form.get("role") || "").trim();
  const kelas = normalizeKelas(String(form.get("kelas") || ""));
  const foto = String(form.get("foto") || "").trim();
  const wajibGantiPassword = String(form.get("wajib_ganti_password") || "") === "1";

  if (!name || !username) {
    return NextResponse.json({ status: "error", message: "Nama dan username wajib diisi." });
  }
  if (role !== "admin" && role !== "guru") {
    return NextResponse.json({ status: "error", message: "Role tidak valid." });
  }
  if (password && password.length < 8) {
    return NextResponse.json({ status: "error", message: "Password minimal 8 karakter." });
  }
  if (role === "guru" && !kelas) {
    return NextResponse.json({ status: "error", message: "Guru wajib memilih kelas yang diampu (wali kelas)." });
  }
  if (userId === session.userId && role !== "admin") {
    return NextResponse.json({ status: "error", message: "Anda tidak bisa mengubah role akun Anda sendiri." });
  }

  const { data: dup } = await supabaseAdmin.from("users").select("id").eq("username", username).neq("id", userId).maybeSingle();
  if (dup) {
    return NextResponse.json({ status: "error", message: "Username sudah dipakai pengguna lain." });
  }

  // Kalau role diturunkan dari admin -> guru, pastikan bukan admin terakhir.
  if (role === "guru") {
    const { data: current } = await supabaseAdmin.from("users").select("role").eq("id", userId).maybeSingle();
    if (current?.role === "admin") {
      const { count } = await supabaseAdmin.from("users").select("id", { count: "exact", head: true }).eq("role", "admin");
      if ((count ?? 0) <= 1) {
        return NextResponse.json({ status: "error", message: "Tidak bisa mengubah role. Minimal harus ada 1 akun admin." });
      }
    }
  }

  const payload: Record<string, unknown> = { name, username, role, foto: foto || null };
  if (password) {
    payload.password = await bcrypt.hash(password, 10);
    payload.must_change_password = wajibGantiPassword;
  }

  const { error } = await supabaseAdmin.from("users").update(payload).eq("id", userId);
  if (error) {
    const message = error.message.includes("username") ? "Username sudah dipakai pengguna lain." : error.message;
    return NextResponse.json({ status: "error", message });
  }

  // Sinkronkan penugasan wali kelas (mapel = 'Guru Kelas').
  await supabaseAdmin.from("guru_mengajar_kelas").delete().eq("guru_id", userId).eq("mapel", "Guru Kelas");
  if (role === "guru" && kelas) {
    const { error: kelasErr } = await supabaseAdmin
      .from("guru_mengajar_kelas")
      .insert({ guru_id: userId, class: kelas, mapel: "Guru Kelas" });
    if (kelasErr) {
      return NextResponse.json({ status: "error", message: "Data tersimpan, tapi gagal menyimpan kelas: " + kelasErr.message });
    }
    await upsertKelasMaster(kelas);
  }

  await catatLog(session.userId, "edit_user", name, `Mengubah data pengguna "${name}" (@${username}).`);

  // Kalau admin sedang mengedit akunnya sendiri, sinkronkan cookie sesi juga.
  // Tanpa ini, sidebar/topbar/salam dashboard masih nampilin nama/username/foto
  // lama sampai logout-login ulang, karena data itu disimpan di JWT cookie,
  // bukan dibaca ulang dari DB tiap request.
  if (userId === session.userId) {
    await createSession({ ...session, nama: name, username, foto: foto || null });
  }

  return NextResponse.json({ status: "ok" });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ status: "error", message: "Akses ditolak" }, { status: 403 });
  }

  const { id } = await params;
  const userId = parseInt(id, 10);
  if (!userId) return NextResponse.json({ status: "error", message: "ID tidak valid" }, { status: 400 });

  if (userId === session.userId) {
    return NextResponse.json({ status: "error", message: "Anda tidak bisa menghapus akun Anda sendiri." });
  }

  const { data: target } = await supabaseAdmin.from("users").select("name, role, username").eq("id", userId).maybeSingle();
  if (!target || isDeveloperUsername(target.username)) {
    return NextResponse.json({ status: "error", message: "Pengguna tidak ditemukan." });
  }

  if (target.role === "admin") {
    const { count } = await supabaseAdmin.from("users").select("id", { count: "exact", head: true }).eq("role", "admin");
    if ((count ?? 0) <= 1) {
      return NextResponse.json({ status: "error", message: "Tidak bisa menghapus. Minimal harus ada 1 akun admin." });
    }
  }

  await supabaseAdmin.from("guru_mengajar_kelas").delete().eq("guru_id", userId);
  const { error } = await supabaseAdmin.from("users").delete().eq("id", userId);
  if (error) {
    return NextResponse.json({ status: "error", message: error.message });
  }

  await catatLog(session.userId, "hapus_user", target.name, `Menghapus pengguna "${target.name}" (role: ${target.role}).`);

  return NextResponse.json({ status: "ok" });
}
