import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { addHariLiburRange, deleteHariLiburBulk, getHariLiburList } from "@/lib/data/hari-libur";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ status: "error", message: "Akses ditolak" }, { status: 403 });
  }
  const data = await getHariLiburList();
  return NextResponse.json({ status: "ok", data });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ status: "error", message: "Akses ditolak" }, { status: 403 });
  }

  const form = await req.formData();
  const tanggal = String(form.get("tanggal") || "");
  // Opsional — kalau kosong, dianggap cuma 1 hari (sama seperti sebelumnya).
  const sampaiTanggal = String(form.get("sampaiTanggal") || "");
  const keterangan = String(form.get("keterangan") || "");

  if (!tanggal || !keterangan) {
    return NextResponse.json({ status: "error", message: "Data tidak lengkap" });
  }

  const result = await addHariLiburRange(tanggal, sampaiTanggal, keterangan);
  if (!result.ok) return NextResponse.json({ status: "error", message: result.message });
  return NextResponse.json({ status: "ok", jumlah: result.jumlah });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ status: "error", message: "Akses ditolak" }, { status: 403 });
  }

  let ids: number[] = [];
  try {
    const body = await req.json();
    ids = Array.isArray(body?.ids) ? body.ids.map((v: unknown) => Number(v)).filter((v: number) => Number.isFinite(v)) : [];
  } catch {
    return NextResponse.json({ status: "error", message: "Body request tidak valid." }, { status: 400 });
  }

  if (!ids.length) {
    return NextResponse.json({ status: "error", message: "Tidak ada data yang dipilih." }, { status: 400 });
  }

  const result = await deleteHariLiburBulk(ids);
  if (!result.ok) return NextResponse.json({ status: "error", message: result.message });
  return NextResponse.json({ status: "ok", jumlah: result.jumlah });
}
