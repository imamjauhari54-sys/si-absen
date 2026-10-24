import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { buatCsvLogRentang } from "@/lib/data/hapus-log";
import { jenisLogValid, validasiRentangHapusLog } from "@/lib/utils/hapus-log";
import { todayJakarta } from "@/lib/utils/tanggal";

/** Unduh CSV log pada rentang tanggal (arsip sebelum dihapus), hanya admin. Rentang yang sama dengan aturan hapus. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ jenis: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ message: "Akses ditolak" }, { status: 403 });
  }

  const { jenis } = await params;
  if (!jenisLogValid(jenis)) return NextResponse.json({ message: "Jenis log tidak valid." }, { status: 400 });

  const sp = req.nextUrl.searchParams;
  const rentang = validasiRentangHapusLog(jenis, sp.get("dari"), sp.get("sampai"), todayJakarta());
  if (!rentang.ok) return NextResponse.json({ message: rentang.message }, { status: 400 });

  const csv = await buatCsvLogRentang(jenis, rentang.dari, rentang.sampai, { hanyaBerhasil: jenis === "wa" && sp.get("hanyaBerhasil") === "1" });
  const nama = jenis === "aktivitas" ? "log-aktivitas" : "log-wa";
  return new NextResponse("\uFEFF" + csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nama}_${rentang.dari}_${rentang.sampai}.csv"`,
    },
  });
}
