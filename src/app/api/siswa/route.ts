import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
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
  const kelas = normalizeKelas(String(form.get("class") || ""));
  const nisn = String(form.get("nisn") || "").trim();
  const jenisKelamin = String(form.get("jenis_kelamin") || "").trim();
  const foto = String(form.get("foto") || "").trim();
  const noHpOrtu = String(form.get("no_hp_ortu") || "").trim();

  if (!name || !kelas) {
    return NextResponse.json({ status: "error", message: "Nama dan kelas wajib diisi." });
  }
  if (jenisKelamin && jenisKelamin !== "L" && jenisKelamin !== "P") {
    return NextResponse.json({ status: "error", message: "Jenis kelamin tidak valid." });
  }

  const { data, error } = await supabaseAdmin
    .from("students")
    .insert({
      name,
      class: kelas,
      nisn: nisn || null,
      jenis_kelamin: jenisKelamin || null,
      foto: foto || null,
      no_hp_ortu: noHpOrtu || null,
    })
    .select("id")
    .single();

  if (error) {
    const message = error.message.includes("nisn") ? "NISN sudah dipakai siswa lain." : error.message;
    return NextResponse.json({ status: "error", message });
  }

  await upsertKelasMaster(kelas);
  await catatLog(session.userId, "tambah_siswa", name, `Menambahkan siswa baru "${name}" (Kelas ${kelas}).`);
  revalidateTag("siswa", "max");

  return NextResponse.json({ status: "ok", id: data.id });
}
