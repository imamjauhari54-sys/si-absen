import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import { daftarTanggalBulan, getRekapBulanan, getRekapHarian } from "@/lib/data/rekap";
import { getHariLiburMap } from "@/lib/data/hari-libur";

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
  const view = searchParams.get("view") === "bulanan" ? "bulanan" : "harian";
  const isAdmin = session.role === "admin";
  const kelasFilter = isAdmin ? searchParams.get("kelas") ?? "" : session.kelas || "";

  let csv = "\uFEFF";
  csv += "sep=,\r\n";
  let filenameSuffix: string;

  if (view === "harian") {
    const tanggal = searchParams.get("tgl") ?? "";
    filenameSuffix = tanggal;
    csv += toCsvLine(["Nama Siswa", "Kelas", "NISN", "Status", "Jam Masuk", "Jam Pulang", "Keterangan"]);

    const { rows } = await getRekapHarian(tanggal, kelasFilter);
    // NISN tidak ikut dipilih di getRekapHarian, ambil terpisah biar ringan
    const { data: nisnRows } = await supabaseAdmin.from("students").select("id, nisn");
    const nisnMap = new Map((nisnRows ?? []).map((r) => [r.id, r.nisn]));

    for (const r of rows) {
      const statusReal = r.status === "kosong" ? "alpha" : r.status;
      csv += toCsvLine([
        r.name,
        r.class,
        "'" + (nisnMap.get(r.id) ?? ""),
        statusReal.charAt(0).toUpperCase() + statusReal.slice(1),
        r.jam_masuk ? r.jam_masuk.slice(0, 5) : "-",
        r.jam_pulang ? r.jam_pulang.slice(0, 5) : "-",
        r.keterangan ?? "",
      ]);
    }
  } else {
    const bulan = searchParams.get("bulan") ?? "";
    filenameSuffix = bulan;
    const liburMap = await getHariLiburMap();
    const tglList = daftarTanggalBulan(bulan);

    const header = ["Nama Siswa", "Kelas", ...tglList.map((t) => t.slice(8, 10)), "H", "T", "I", "S", "A"];
    csv += toCsvLine(header);

    const { rows } = await getRekapBulanan(bulan, kelasFilter, liburMap);
    for (const row of rows) {
      const cells = tglList.map((t) => {
        const st = row.d[t];
        return st === "libur" ? "L" : st === "kosong" ? "A" : st.charAt(0).toUpperCase();
      });
      const sum = { H: 0, T: 0, I: 0, S: 0, A: 0 };
      for (const c of cells) if (c in sum) sum[c as keyof typeof sum]++;
      csv += toCsvLine([row.nama, row.kelas, ...cells, sum.H, sum.T, sum.I, sum.S, sum.A]);
    }
  }

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rekap_${view}_${filenameSuffix}.csv"`,
    },
  });
}
