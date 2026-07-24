import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import { normalizeKelas } from "@/lib/utils/kelas";
import { upsertKelasMaster } from "@/lib/data/kelas";
import { catatLog } from "@/lib/data/log-aktivitas";
import { parseCsv } from "@/lib/utils/csv";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ status: "error", message: "Akses ditolak" }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ status: "error", message: "File CSV tidak ditemukan." });
  }

  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length < 2) {
    return NextResponse.json({ status: "error", message: "File CSV kosong atau cuma ada baris header." });
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = {
    nama: header.indexOf("nama"),
    kelas: header.indexOf("kelas"),
    nisn: header.indexOf("nisn"),
    jk: header.findIndex((h) => h.includes("kelamin")),
    hp: header.findIndex((h) => h.includes("hp") || h.includes("telepon") || h.includes("wa")),
  };

  if (idx.nama === -1 || idx.kelas === -1) {
    return NextResponse.json({
      status: "error",
      message: 'Format CSV tidak sesuai. Kolom "nama" dan "kelas" wajib ada di baris header. Unduh template dulu supaya formatnya pas.',
    });
  }

  const dataRows = rows.slice(1).filter((r) => r.some((c) => c.trim() !== ""));
  if (dataRows.length === 0) {
    return NextResponse.json({ status: "error", message: "Tidak ada baris data di file ini." });
  }
  if (dataRows.length > 500) {
    return NextResponse.json({ status: "error", message: "Maksimal 500 baris per import. Bagi file jadi beberapa bagian." });
  }

  const errors: string[] = [];
  const kelasBaru = new Set<string>();
  let berhasil = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i];
    const baris = i + 2; // nomor baris asli di file (baris 1 = header)

    const nama = (r[idx.nama] || "").trim();
    const kelas = normalizeKelas(r[idx.kelas] || "");
    const nisn = idx.nisn > -1 ? (r[idx.nisn] || "").trim() : "";
    let jk = idx.jk > -1 ? (r[idx.jk] || "").trim().toUpperCase() : "";
    if (jk && jk !== "L" && jk !== "P") jk = "";
    const hp = idx.hp > -1 ? (r[idx.hp] || "").trim() : "";

    if (!nama || !kelas) {
      errors.push(`Baris ${baris}: nama/kelas kosong — dilewati.`);
      continue;
    }

    const { error } = await supabaseAdmin.from("students").insert({
      name: nama,
      class: kelas,
      nisn: nisn || null,
      jenis_kelamin: jk || null,
      no_hp_ortu: hp || null,
    });

    if (error) {
      const pesan = error.message.includes("nisn") ? "NISN sudah dipakai siswa lain" : error.message;
      errors.push(`Baris ${baris} (${nama}): ${pesan}.`);
      continue;
    }

    berhasil++;
    kelasBaru.add(kelas);
  }

  await Promise.all(Array.from(kelasBaru).map((k) => upsertKelasMaster(k)));

  if (berhasil > 0) {
    await catatLog(session.userId, "import_siswa", `${berhasil} siswa`, `Import massal ${berhasil} siswa dari file CSV.`);
  }

  return NextResponse.json({
    status: berhasil > 0 ? "ok" : "error",
    message:
      berhasil > 0
        ? `Berhasil impor ${berhasil} dari ${dataRows.length} baris.${errors.length ? ` ${errors.length} baris dilewati.` : ""}`
        : "Tidak ada data yang berhasil diimpor.",
    errors,
  });
}
