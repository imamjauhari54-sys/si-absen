import { supabaseAdmin } from "@/lib/supabase/server";
import DevFooter from "@/components/layout/DevFooter";
import AuthExperience from "./AuthExperience";
import type { AuthTab } from "./types";
import "./auth.css";

export type { AuthTab } from "./types";

/**
 * Server component tipis: ambil nama sekolah, lalu render kartu login
 * (dua form + pintu geser) di AuthExperience. Guard sesi tetap di page.tsx.
 */
export default async function AuthShell({ active }: { active: AuthTab }) {
  const { data } = await supabaseAdmin
    .from("settings")
    .select("value")
    .eq("key", "nama_sekolah")
    .maybeSingle();
  const namaSekolah = data?.value || "NAMA SEKOLAH BELUM DIATUR";

  return (
    <AuthExperience
      initial={active}
      namaSekolah={namaSekolah}
      footer={<DevFooter />}
    />
  );
}
