import { cookies } from "next/headers";
import { requireSession } from "@/lib/auth/session";
import { getFotoUser, getNamaSekolah } from "@/lib/data/dashboard";
import AppShell from "@/components/layout/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession(); // redirect ke /login kalau belum login

  const [namaSekolah, fotoTerbaru, cookieStore] = await Promise.all([
    getNamaSekolah("SI-ABSEN"),
    getFotoUser(session.username),
    cookies(),
  ]);
  const initialDark = (cookieStore.get("theme")?.value ?? "dark") === "dark";

  return (
    <AppShell
      namaSekolah={namaSekolah}
      isAdmin={session.role === "admin"}
      guruNama={session.nama}
      guruRole={session.role === "admin" ? "Admin" : "Guru"}
      guruFoto={fotoTerbaru}
      initialDark={initialDark}
    >
      {children}
    </AppShell>
  );
}
