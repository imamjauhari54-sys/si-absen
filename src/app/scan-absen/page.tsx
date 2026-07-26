import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getSettingValue } from "@/lib/data/settings";
import Scanner from "./Scanner";
import "./scan.css";

export const metadata: Metadata = { title: "Scan QR" };
export const dynamic = "force-dynamic";

export default async function ScanAbsenPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/dashboard");

  const namaSekolah = await getSettingValue("nama_sekolah", "SI-ABSEN");

  return <Scanner namaSekolah={namaSekolah} />;
}
