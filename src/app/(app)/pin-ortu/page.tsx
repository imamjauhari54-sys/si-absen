import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { kelasHalamanAtauRedirect } from "@/lib/auth/akses-kelas";
import { getKelasMasterList } from "@/lib/data/kelas";
import { ambilStatusPinKelas, GalatBaca, type StatusPinKelas } from "@/lib/data/pengajuan";
import { fiturBelumAktif } from "@/lib/utils/pengajuan";
import PageTitle from "@/components/ui/PageTitle";
import KelolaPin from "@/components/pin/KelolaPin";

export const metadata: Metadata = { title: "PIN Orang Tua" };
export const dynamic = "force-dynamic";

export default async function PinOrtuPage({ searchParams }: { searchParams: Promise<{ kelas?: string }> }) {
  const session = await requireSession(["admin", "guru"]);
  const kelasWali = await kelasHalamanAtauRedirect(session);
  const sp = await searchParams;
  const daftarKelas = session.role === "admin" ? await getKelasMasterList() : [];
  // Guru: kelas wali dari DB (query string diabaikan). Admin: harus kelas yang ada di master.
  const kelas = session.role === "guru" ? kelasWali : daftarKelas.includes(sp.kelas ?? "") ? (sp.kelas as string) : "";

  let siswa: StatusPinKelas[] = [];
  let galat: string | null = null;
  if (kelas) {
    try {
      siswa = await ambilStatusPinKelas(kelas);
    } catch (e) {
      galat = e instanceof GalatBaca && fiturBelumAktif(e.kodeDb)
        ? "Fitur PIN orang tua belum aktif di server (migrasi 027 belum dijalankan)."
        : "Gagal memuat data PIN. Muat ulang halaman.";
      console.error("[pin-ortu] gagal memuat:", e instanceof Error ? e.message : e);
    }
  }

  return (
    <div className="w-full px-4 pt-2 mb-14">
      <div className="no-print mb-6 reveal flex flex-wrap items-start justify-between gap-3">
        <PageTitle icon="fa-key" title="PIN Orang Tua" suffix={kelas ? `— Kelas ${kelas}` : undefined}>
          PIN acak 6 digit untuk masuk ke pengajuan izin di portal. Sistem hanya menyimpan hash, jadi PIN tidak bisa dilihat lagi setelah dicetak.
        </PageTitle>
        <Link href="/pengajuan" className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-600 dark:text-gray-300 hover:border-indigo-300">
          <i className="fas fa-envelope-open-text mr-2" aria-hidden="true" />Pengajuan Izin
        </Link>
      </div>

      {session.role === "admin" && (
        <form method="get" className="no-print mb-4 flex items-center gap-2">
          <select name="kelas" defaultValue={kelas} aria-label="Kelas" className="px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-200">
            <option value="">-- Pilih Kelas --</option>
            {daftarKelas.map((k) => <option key={k} value={k}>Kelas {k}</option>)}
          </select>
          <button type="submit" className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold">Tampilkan</button>
        </form>
      )}

      {galat ? (
        <div role="alert" className="section-card p-6 text-sm text-rose-600 dark:text-rose-300">{galat}</div>
      ) : kelas ? (
        // key=kelas: pindah kelas membuang PIN polos di memori.
        <KelolaPin key={kelas} kelas={kelas} siswa={siswa} />
      ) : (
        <div className="section-card p-10 text-center text-sm text-gray-400">Pilih kelas terlebih dahulu.</div>
      )}
    </div>
  );
}
