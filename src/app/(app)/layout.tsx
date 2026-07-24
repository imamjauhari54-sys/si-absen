import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getFotoUser, getNamaSekolah } from "@/lib/data/dashboard";
import { cekWajibGantiPassword } from "@/lib/data/users";
import AppShell from "@/components/layout/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession(); // redirect ke /login kalau belum login

  if (await cekWajibGantiPassword(session.userId)) {
    redirect("/ganti-password");
  }

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
