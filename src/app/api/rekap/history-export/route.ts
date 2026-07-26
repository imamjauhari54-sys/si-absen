import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getRekapHistory } from "@/lib/data/rekap";

function csvEscape(val: string): string {
  if (/[",\n]/.test(val)) return `"${val.replace(/"/g, '""')}"`;
  return val;
}
function toCsvLine(fields: (string | number)[]): string {
  return fields.map((f) => csvEscape(String(f))).join(",") + "\r\n";
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const tapel = searchParams.get("tapel") ?? "";
  const semester = searchParams.get("semester") ?? "";
  const kelasFilter = session.role === "admin" ? searchParams.get("kelas") ?? "" : session.kelas || "";

  const { rows } = await getRekapHistory(tapel, semester, kelasFilter);

  let csv = "\uFEFF";
  csv += "sep=,\r\n";
  csv += toCsvLine(["No", "Nama Siswa", "NISN", "Kelas", "Hadir", "Telat", "Izin", "Sakit", "Alpha", "Persentase (%)"]);

  rows.forEach((r, i) => {
    csv += toCsvLine([i + 1, r.nama, "'" + (r.nisn ?? ""), r.kelas, r.hadir, r.telat, r.izin, r.sakit, r.alpha, `${r.persen}%`]);
  });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="History_Rekap_${tapel}_${semester}.csv"`,
    },
  });
}
