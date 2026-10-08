import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import LoginForm from "./login-form";
import DevFooter from "@/components/layout/DevFooter";

export const metadata: Metadata = { title: "Masuk" };

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  const { data } = await supabaseAdmin
    .from("settings")
    .select("value")
    .eq("key", "nama_sekolah")
    .maybeSingle();

  const namaSekolah = data?.value || "NAMA SEKOLAH BELUM DIATUR";

  return (
    <main className="min-h-screen flex items-center justify-center p-5 bg-[#F8FAFC] dark:bg-[#0F172A] relative overflow-hidden">
      <div className="fixed -top-12 -left-12 w-[500px] h-[500px] rounded-full bg-teal-500/15 blur-[80px] -z-10" />
      <div className="fixed -bottom-12 -right-12 w-[600px] h-[600px] rounded-full bg-cyan-500/10 blur-[100px] -z-10" />

      <div className="w-full max-w-[420px] bg-white/85 dark:bg-slate-800/70 backdrop-blur-2xl rounded-[32px] p-9 border border-white/90 dark:border-white/10 shadow-2xl text-center">
        <div className="w-[70px] h-[70px] mx-auto mb-6 rounded-[20px] flex items-center justify-center text-2xl text-white bg-gradient-to-br from-teal-600 to-cyan-500 shadow-lg shadow-teal-600/30">
          <i className="fa-solid fa-qrcode text-4xl" />
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight mb-2">
          Masuk SI-ABSEN
        </h1>
        <p className="text-slate-600 dark:text-slate-400 text-sm mb-5 leading-relaxed">
          Sistem Absensi Digital Berbasis QR Code. Silakan masuk untuk mengelola kehadiran.
        </p>

        <LoginForm />

        <div className="mt-5 text-sm text-slate-600 dark:text-slate-400">
          Siswa?{" "}
          <a href="/portal-siswa" className="text-teal-600 dark:text-teal-400 font-semibold hover:underline">
            Cek absensi kamu di sini
          </a>
        </div>

        <div className="mt-4 text-sm text-slate-600 dark:text-slate-400">
          {namaSekolah}
        </div>
        <DevFooter className="mt-1.5" />
      </div>
    </main>
  );
}
