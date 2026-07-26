import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import { normalizeKelas } from "@/lib/utils/kelas";
import { upsertKelasMaster } from "@/lib/data/kelas";
import { catatLog } from "@/lib/data/log-aktivitas";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ status: "error", message: "Akses ditolak" }, { status: 403 });
  }

  const { id } = await params;
  const siswaId = parseInt(id, 10);
  if (!siswaId) return NextResponse.json({ status: "error", message: "ID tidak valid" }, { status: 400 });

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

  const { error } = await supabaseAdmin
    .from("students")
    .update({
      name,
      class: kelas,
      nisn: nisn || null,
      jenis_kelamin: jenisKelamin || null,
      foto: foto || null,
      no_hp_ortu: noHpOrtu || null,
    })
    .eq("id", siswaId);

  if (error) {
    const message = error.message.includes("nisn") ? "NISN sudah dipakai siswa lain." : error.message;
    return NextResponse.json({ status: "error", message });
  }

  await upsertKelasMaster(kelas);
  await catatLog(session.userId, "edit_siswa", name, `Mengubah data siswa "${name}" (Kelas ${kelas}).`);

  return NextResponse.json({ status: "ok" });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ status: "error", message: "Akses ditolak" }, { status: 403 });
  }

  const { id } = await params;
  const siswaId = parseInt(id, 10);
  if (!siswaId) return NextResponse.json({ status: "error", message: "ID tidak valid" }, { status: 400 });

  const { data: siswa } = await supabaseAdmin.from("students").select("name, class, status").eq("id", siswaId).maybeSingle();
  if (!siswa) return NextResponse.json({ status: "error", message: "Siswa tidak ditemukan." });
  if (siswa.status === "aktif") {
    return NextResponse.json({
      status: "error",
      message: "Siswa masih aktif. Nonaktifkan (Lulus/Pindah) dulu sebelum menghapus permanen.",
    });
  }

  const { count: jumlahAbsensi } = await supabaseAdmin
    .from("absensi")
    .select("id", { count: "exact", head: true })
    .eq("siswa_id", siswaId);

  // Hapus data pendukung dulu (token QR, riwayat absensi, log perubahan) baru
  // datanya sendiri, supaya tidak ada baris "yatim" yang nyangkut di tabel lain.
  await supabaseAdmin.from("absensi_qr_token").delete().eq("siswa_id", siswaId);
  await supabaseAdmin.from("absensi_log").delete().eq("siswa_id", siswaId);
  await supabaseAdmin.from("absensi").delete().eq("siswa_id", siswaId);

  const { error } = await supabaseAdmin.from("students").delete().eq("id", siswaId);
  if (error) {
    return NextResponse.json({ status: "error", message: error.message });
  }

  await catatLog(
    session.userId,
    "hapus_siswa_permanen",
    siswa.name,
    `Menghapus PERMANEN siswa "${siswa.name}" (Kelas ${siswa.class})${
      jumlahAbsensi ? ` beserta ${jumlahAbsensi} riwayat absensinya` : ""
    }.`
  );

  return NextResponse.json({ status: "ok" });
}
