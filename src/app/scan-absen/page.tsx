import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getSettingValue } from "@/lib/data/settings";
import { cekHariLibur } from "@/lib/data/dashboard";
import { todayJakarta } from "@/lib/utils/tanggal";
import Scanner from "./Scanner";
import "./scan.css";

export const metadata: Metadata = { title: "Scan QR" };
export const dynamic = "force-dynamic";

export default async function ScanAbsenPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/dashboard");

  const [namaSekolah, { isLibur, pesanLibur }] = await Promise.all([
    getSettingValue("nama_sekolah", "SI-ABSEN"),
    cekHariLibur(todayJakarta()),
  ]);

  // Server tetap menolak scan di hari libur; banner ini hanya memberi tahu admin sejak awal.
  return <Scanner namaSekolah={namaSekolah} liburInfo={isLibur ? pesanLibur || "Hari libur" : null} />;
}
