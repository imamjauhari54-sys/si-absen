import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getFotoUser, getNamaSekolah } from "@/lib/data/dashboard";
import { cekWajibGantiPassword, getNipUser } from "@/lib/data/users";
import { getKelasWali } from "@/lib/data/wali-kelas";
import { hitungPenandaPengajuan } from "@/lib/data/penanda-pengajuan";
import AppShell from "@/components/layout/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession(); // redirect ke /login kalau belum login

  if (await cekWajibGantiPassword(session.userId)) {
    redirect("/ganti-password");
  }

  const [namaSekolah, fotoTerbaru, nipUser, cookieStore, pengajuanMenunggu] = await Promise.all([
    getNamaSekolah("SI-ABSEN"),
    getFotoUser(session.username),
    getNipUser(session.username),
    cookies(),
    // Penanda pengajuan izin yang menunggu. Admin: semua kelas; wali kelas: kelasnya (dari DB); guru tanpa kelas: 0.
    // Selalu aman: hitungPenandaPengajuan tidak pernah melempar.
    session.role === "admin"
      ? hitungPenandaPengajuan(null)
      : getKelasWali(session.userId).then((k) => (k ? hitungPenandaPengajuan(k) : 0)),
  ]);
  const initialDark = (cookieStore.get("theme")?.value ?? "dark") === "dark";

  return (
    <AppShell
      namaSekolah={namaSekolah}
      isAdmin={session.role === "admin"}
      guruNama={session.nama}
      guruRole={session.role === "admin" ? "Admin" : "Guru"}
      guruFoto={fotoTerbaru}
      guruUsername={session.username}
      guruNip={nipUser}
      initialDark={initialDark}
      pengajuanMenunggu={pengajuanMenunggu}
    >
      {children}
    </AppShell>
  );
}
