import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStudentSession } from "@/lib/auth/student-session";
import AuthShell from "@/components/auth/AuthShell";

export const metadata: Metadata = { title: "Cek Absensi Siswa" };

export default async function PortalSiswaPage() {
  // Kalau sesi siswa masih aktif, langsung lempar ke dashboard — nggak perlu
  // isi NISN ulang tiap buka halaman ini.
  const session = await getStudentSession();
  if (session) redirect("/portal-siswa/dashboard");

  return <AuthShell active="siswa" />;
}
