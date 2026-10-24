import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { catatLog } from "@/lib/data/log-aktivitas";
import { hapusLogRentang, hitungLogRentang } from "@/lib/data/hapus-log";
import { jenisLogValid, validasiRentangHapusLog } from "@/lib/utils/hapus-log";
import { formatTglIndo, todayJakarta } from "@/lib/utils/tanggal";

/**
 * Hapus log berdasarkan rentang tanggal (WIB), hanya admin.
 *  - aksi "pratinjau": hanya menghitung baris yang akan terhapus.
 *  - aksi "hapus"    : menghapus permanen lalu mencatat satu baris di Log Aktivitas.
 * Log aktivitas hanya bisa dihapus jika sudah lebih dari 90 hari (jejak audit); log WA bebas sampai hari ini.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ jenis: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ status: "error", message: "Akses ditolak" }, { status: 403 });
  }

  const { jenis } = await params;
  if (!jenisLogValid(jenis)) return NextResponse.json({ status: "error", message: "Jenis log tidak valid." }, { status: 400 });

  const form = await req.formData();
  const aksi = String(form.get("aksi") || "pratinjau");
  const rentang = validasiRentangHapusLog(jenis, form.get("dari"), form.get("sampai"), todayJakarta());
  if (!rentang.ok) return NextResponse.json({ status: "error", message: rentang.message });
  const opsi = { hanyaBerhasil: jenis === "wa" && form.get("hanyaBerhasil") === "1" };

  try {
    if (aksi !== "hapus") {
      const jumlah = await hitungLogRentang(jenis, rentang.dari, rentang.sampai, opsi);
      return NextResponse.json({ status: "ok", jumlah });
    }

    const jumlah = await hapusLogRentang(jenis, rentang.dari, rentang.sampai, opsi);
    const nama = jenis === "aktivitas" ? "log aktivitas" : opsi.hanyaBerhasil ? "log WA yang terkirim" : "log WA";
    await catatLog(
      session.userId,
      jenis === "aktivitas" ? "hapus_log_aktivitas" : "hapus_log_wa",
      nama,
      `Menghapus ${jumlah} ${nama} tanggal ${formatTglIndo(rentang.dari)} – ${formatTglIndo(rentang.sampai)}.`
    );
    return NextResponse.json({ status: "ok", jumlah });
  } catch (e) {
    return NextResponse.json({ status: "error", message: e instanceof Error ? e.message : "Gagal memproses log." });
  }
}
