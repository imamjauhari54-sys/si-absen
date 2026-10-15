import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getKelasWaliSesi } from "@/lib/auth/akses-kelas";
import { putuskanAksesSiswa } from "@/lib/utils/absen-scan";
import { getRiwayatAbsensi, getSiswaProfile } from "@/lib/data/history";
import { getKelasSiswaPadaTapel } from "@/lib/data/riwayat-kelas";
import { formatTglPanjang } from "@/lib/utils/tanggal";

function csvEscape(val: string): string {
  if (/[",\n]/.test(val)) return `"${val.replace(/"/g, '""')}"`;
  return val;
}

function toCsvLine(fields: (string | number)[]): string {
  return fields.map((f) => csvEscape(String(f))).join(",") + "\r\n";
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const siswaId = parseInt(id, 10);
  if (!siswaId) return NextResponse.json({ message: "ID siswa tidak valid" }, { status: 400 });

  const [siswa, kelasWali] = await Promise.all([getSiswaProfile(siswaId), getKelasWaliSesi(session)]);
  const putusan = putuskanAksesSiswa(session.role, kelasWali, siswa);
  if (!putusan.ok) {
    return NextResponse.json({ message: putusan.message }, { status: putusan.status });
  }
  if (!siswa) return NextResponse.json({ message: "Siswa tidak ditemukan" }, { status: 404 }); // penyempit tipe

  const { searchParams } = req.nextUrl;
  const filter = {
    tapel: searchParams.get("tapel") ?? "",
    semester: searchParams.get("semester") ?? "",
    bulan: searchParams.get("bulan") ?? "",
  };

  const [rows, kelasPadaTapel] = await Promise.all([
    getRiwayatAbsensi(siswaId, filter),
    getKelasSiswaPadaTapel(siswaId, filter.tapel),
  ]);

  let csv = "\uFEFF"; // BOM biar Excel baca UTF-8 dengan benar
  csv += "sep=,\r\n";
  csv += toCsvLine(["Nama Siswa", "Kelas", "NISN"]);
  csv += toCsvLine([siswa.name, kelasPadaTapel ?? siswa.class, siswa.nisn ?? ""]);
  csv += "\r\n";
  csv += toCsvLine(["No", "Tanggal", "Status", "Jam Masuk", "Jam Pulang", "Keterangan"]);

  rows.forEach((r, i) => {
    csv += toCsvLine([
      i + 1,
      formatTglPanjang(r.tanggal),
      r.status.charAt(0).toUpperCase() + r.status.slice(1),
      r.jam_masuk ? r.jam_masuk.slice(0, 5) : "-",
      r.jam_pulang ? r.jam_pulang.slice(0, 5) : "-",
      r.keterangan ?? "",
    ]);
  });

  const filename = `History_${siswa.name.replace(/\s+/g, "_")}_${filter.tapel}_${filter.semester}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
