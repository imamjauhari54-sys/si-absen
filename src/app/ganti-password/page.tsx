import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { cekWajibGantiPassword } from "@/lib/data/users";
import GantiPasswordForm from "./GantiPasswordForm";
import DevFooter from "@/components/layout/DevFooter";

export const metadata: Metadata = { title: "Ganti Password" };
export const dynamic = "force-dynamic";

export default async function GantiPasswordPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const wajib = await cekWajibGantiPassword(session.userId);

  return (
    <div className="min-h-screen flex items-center justify-center p-5 bg-[#F8FAFC] dark:bg-[#0F172A] relative overflow-hidden">
      <div className="fixed -top-12 -left-12 w-[500px] h-[500px] rounded-full bg-teal-500/15 blur-[80px] -z-10" />
      <div className="fixed -bottom-12 -right-12 w-[600px] h-[600px] rounded-full bg-cyan-500/10 blur-[100px] -z-10" />

      <div className="w-full max-w-[420px] bg-white/85 dark:bg-slate-800/70 backdrop-blur-2xl rounded-[32px] p-9 border border-white/90 dark:border-white/10 shadow-2xl text-center">
        <div className="w-[70px] h-[70px] mx-auto mb-6 rounded-[20px] flex items-center justify-center text-2xl text-white bg-gradient-to-br from-teal-600 to-cyan-500 shadow-lg shadow-teal-600/30">
          <i className="fa-solid fa-key" />
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight mb-2">Ganti Password</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-5 leading-relaxed">
          {wajib
            ? "Demi keamanan akun, Anda wajib mengganti password sebelum melanjutkan."
            : "Perbarui password akun Anda secara berkala untuk menjaga keamanan."}
        </p>

        <GantiPasswordForm wajib={wajib} />
        <DevFooter className="mt-5" />
      </div>
    </div>
  );
}
