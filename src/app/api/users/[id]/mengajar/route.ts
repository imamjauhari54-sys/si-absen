import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import { normalizeKelas } from "@/lib/utils/kelas";
import { upsertKelasMaster } from "@/lib/data/kelas";
import { catatLog } from "@/lib/data/log-aktivitas";

/** Daftar penugasan mengajar guru DI LUAR wali kelas (mapel != 'Guru Kelas'). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ status: "error", message: "Akses ditolak" }, { status: 403 });
  }

  const { id } = await params;
  const guruId = parseInt(id, 10);
  if (!guruId) return NextResponse.json({ status: "error", message: "ID tidak valid" }, { status: 400 });

  const { data } = await supabaseAdmin
    .from("guru_mengajar_kelas")
    .select("id, class, mapel")
    .eq("guru_id", guruId)
    .neq("mapel", "Guru Kelas")
    .order("class", { ascending: true });

  return NextResponse.json({ status: "ok", list: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ status: "error", message: "Akses ditolak" }, { status: 403 });
  }

  const { id } = await params;
  const guruId = parseInt(id, 10);
  if (!guruId) return NextResponse.json({ status: "error", message: "ID tidak valid" }, { status: 400 });

  const form = await req.formData();
  const kelas = normalizeKelas(String(form.get("kelas") || ""));
  const mapel = String(form.get("mapel") || "").trim();

  if (!kelas || !mapel) {
    return NextResponse.json({ status: "error", message: "Kelas dan mata pelajaran wajib diisi." });
  }
  if (mapel.toLowerCase() === "guru kelas") {
    return NextResponse.json({ status: "error", message: 'Nama mapel tidak boleh "Guru Kelas" (khusus wali kelas).' });
  }

  const { data: dup } = await supabaseAdmin
    .from("guru_mengajar_kelas")
    .select("id")
    .eq("guru_id", guruId)
    .eq("class", kelas)
    .eq("mapel", mapel)
    .maybeSingle();
  if (dup) {
    return NextResponse.json({ status: "error", message: "Penugasan ini sudah ada." });
  }

  const { data: guru } = await supabaseAdmin.from("users").select("name").eq("id", guruId).maybeSingle();

  const { error } = await supabaseAdmin.from("guru_mengajar_kelas").insert({ guru_id: guruId, class: kelas, mapel });
  if (error) return NextResponse.json({ status: "error", message: error.message });

  await upsertKelasMaster(kelas);
  await catatLog(
    session.userId,
    "tambah_mengajar",
    guru?.name ?? `Guru #${guruId}`,
    `Menambahkan penugasan mengajar "${mapel}" di Kelas ${kelas} untuk ${guru?.name ?? "guru"}.`
  );

  return NextResponse.json({ status: "ok" });
}
