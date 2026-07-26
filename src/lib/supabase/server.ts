import "server-only";
import { createClient } from "@supabase/supabase-js";

// SI-ABSEN adalah aplikasi internal admin/guru (bukan aplikasi publik dengan
// user sign-up sendiri), dan semua akses data dilakukan lewat Server
// Components / Server Actions / Route Handlers — tidak ada query Supabase
// langsung dari browser. Karena itu kita pakai service role key di server
// saja (lewati RLS) dan otorisasi ditegakkan manual lewat sesi JWT
// (lihat src/lib/auth). Pola ini SENGAJA berbeda dari project Next.js lain
// yang publik (mis. website sekolah) yang memakai anon key + RLS di client.
//
// PENTING: file ini di-guard oleh "server-only" — akan error build kalau
// tidak sengaja di-import dari client component.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Supabase env belum lengkap. Cek NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di .env.local"
  );
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
