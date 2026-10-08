import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getStudentSession } from "@/lib/auth/student-session";
import CekAbsenForm from "./cek-absen-form";
import DevFooter from "@/components/layout/DevFooter";

export const metadata: Metadata = { title: "Cek Absensi Siswa" };

export default async function PortalSiswaPage() {
  // Kalau sesi siswa masih aktif, langsung lempar ke dashboard — nggak perlu
  // isi NISN ulang tiap buka halaman ini.
  const session = await getStudentSession();
  if (session) redirect("/portal-siswa/dashboard");

  return (
    <div className="min-h-screen flex items-center justify-center p-5 bg-[#F8FAFC] dark:bg-[#0F172A] relative overflow-hidden">
      <div className="fixed -top-12 -left-12 w-[500px] h-[500px] rounded-full bg-indigo-500/15 blur-[80px] -z-10" />
      <div className="fixed -bottom-12 -right-12 w-[600px] h-[600px] rounded-full bg-purple-500/10 blur-[100px] -z-10" />

      <div className="w-full max-w-[420px] bg-white/85 dark:bg-slate-800/70 backdrop-blur-2xl rounded-[32px] p-9 border border-white/90 dark:border-white/10 shadow-2xl text-center">
        <div className="w-[70px] h-[70px] mx-auto mb-6 rounded-[20px] flex items-center justify-center text-2xl text-white bg-gradient-to-br from-indigo-600 to-purple-600 shadow-lg shadow-indigo-600/30">
          <i className="fa-solid fa-user-graduate" />
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight mb-2">
          Cek Absensi Siswa
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-5 leading-relaxed">
          Masukkan NISN kamu untuk melihat riwayat kehadiran. Data ditampilkan
          apa adanya (read-only), tidak bisa diubah dari sini.
        </p>

        <CekAbsenForm />

        <div className="mt-7 text-sm text-slate-500 dark:text-slate-400">
          Admin / guru?{" "}
          <Link href="/login" className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">
            Masuk di sini
          </Link>
        </div>
        <DevFooter className="mt-4" />
      </div>
    </div>
  );
}
