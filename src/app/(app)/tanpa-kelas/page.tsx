import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Belum Ada Kelas" };
export const dynamic = "force-dynamic";

/** Tujuan redirect untuk guru yang tidak (lagi) terdaftar sebagai wali kelas manapun. */
export default async function TanpaKelasPage() {
  await requireSession();
  return (
    <div className="w-full px-4 pt-10 mb-14">
      <div className="section-card p-8 max-w-xl mx-auto text-center shadow-sm">
        <i className="fas fa-user-lock text-4xl text-amber-500 mb-4 block" />
        <h1 className="text-lg font-extrabold text-gray-800 dark:text-white mb-2">Anda belum menjadi wali kelas</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Akun Anda belum terhubung ke kelas mana pun (atau penugasannya baru dicabut). Hubungi admin untuk diatur ulang,
          lalu muat ulang halaman ini.
        </p>
      </div>
    </div>
  );
}
