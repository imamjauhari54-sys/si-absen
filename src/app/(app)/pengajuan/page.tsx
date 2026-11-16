import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { kelasHalamanAtauRedirect } from "@/lib/auth/akses-kelas";
import { getKelasMasterList } from "@/lib/data/kelas";
import { ambilDaftarPengajuan, GalatBaca, hitungPengajuanMenunggu, type HasilDaftar } from "@/lib/data/pengajuan";
import { fiturBelumAktif, STATUS_PENGAJUAN_LABEL } from "@/lib/utils/pengajuan";
import { formatTanggalPendek, GAYA_STATUS, ringkasRentang } from "@/lib/utils/pengajuan-form";
import PageTitle from "@/components/ui/PageTitle";
import Pagination from "@/components/ui/Pagination";
import InfoJumlah from "@/components/ui/InfoJumlah";

const PAGE_SIZE = 15;

export const metadata: Metadata = { title: "Pengajuan Izin" };
export const dynamic = "force-dynamic";

type SP = { page?: string; status?: string; kelas?: string; selesai?: string };

export default async function PengajuanPage({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await requireSession(["admin", "guru"]);
  const kelasWali = await kelasHalamanAtauRedirect(session); // "" = admin (semua kelas)
  const sp = await searchParams;

  const status: "menunggu" | "semua" = sp.status === "semua" ? "semua" : "menunggu";
  const daftarKelas = session.role === "admin" ? await getKelasMasterList() : [];
  // Guru: SELALU kelas wali dari DB, query string diabaikan. Admin: kelas harus ada di master, kalau tidak = semua.
  const kelas: string | null = session.role === "guru" ? kelasWali : daftarKelas.includes(sp.kelas ?? "") ? (sp.kelas as string) : null;
  const halaman = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  let hasil: HasilDaftar = { baris: [], total: 0 };
  let menunggu = 0;
  let galat: string | null = null;
  try {
    [hasil, menunggu] = await Promise.all([
      ambilDaftarPengajuan({ kelas, status, halaman, perHalaman: PAGE_SIZE }),
      hitungPengajuanMenunggu(kelas),
    ]);
  } catch (e) {
    const kode = e instanceof GalatBaca ? e.kodeDb : null;
    galat = fiturBelumAktif(kode)
      ? "Fitur pengajuan izin belum aktif di server (migrasi 027 belum dijalankan)."
      : "Gagal memuat pengajuan. Muat ulang halaman.";
    console.error("[pengajuan] gagal memuat:", e instanceof Error ? e.message : e);
  }

  const totalHalaman = Math.max(1, Math.ceil(hasil.total / PAGE_SIZE));
  const href = (p: number, s = status) => {
    const q = new URLSearchParams();
    if (s === "semua") q.set("status", "semua");
    if (session.role === "admin" && kelas) q.set("kelas", kelas);
    if (p > 1) q.set("page", String(p));
    const t = q.toString();
    return `/pengajuan${t ? `?${t}` : ""}`;
  };
  const pesan = (sp.selesai ?? "").slice(0, 200);

  return (
    <div className="w-full px-4 pt-2 mb-14">
      <div className="mb-6 reveal flex flex-wrap items-start justify-between gap-3">
        <PageTitle icon="fa-envelope-open-text" title="Pengajuan Izin" suffix={kelas ? `— Kelas ${kelas}` : "— Semua Kelas"}>
          Izin/sakit yang diajukan orang tua lewat portal. <strong className="text-gray-700 dark:text-gray-200">{menunggu}</strong> menunggu keputusan.
        </PageTitle>
        <Link href="/pin-ortu" className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-600 dark:text-gray-300 hover:border-indigo-300">
          <i className="fas fa-key mr-2" aria-hidden="true" />PIN Orang Tua
        </Link>
      </div>

      {pesan && (
        <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800 px-4 py-2.5 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
          {pesan}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2 reveal">
        {(["menunggu", "semua"] as const).map((s) => (
          <Link
            key={s}
            href={href(1, s)}
            aria-current={status === s ? "page" : undefined}
            className={`px-3.5 py-1.5 rounded-full text-xs font-extrabold border ${status === s ? "bg-indigo-600 border-indigo-600 text-white" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"}`}
          >
            {s === "menunggu" ? "Menunggu" : "Semua"}
          </Link>
        ))}
        {session.role === "admin" && (
          <form method="get" className="flex items-center gap-2 ml-auto">
            {status === "semua" && <input type="hidden" name="status" value="semua" />}
            <select name="kelas" defaultValue={kelas ?? ""} aria-label="Kelas" className="px-3 py-1.5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl text-xs text-gray-700 dark:text-gray-200">
              <option value="">Semua kelas</option>
              {daftarKelas.map((k) => <option key={k} value={k}>Kelas {k}</option>)}
            </select>
            <button type="submit" className="px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-xs font-bold text-gray-700 dark:text-gray-200">Terapkan</button>
          </form>
        )}
      </div>

      {galat ? (
        <div role="alert" className="section-card p-6 text-sm text-rose-600 dark:text-rose-300">{galat}</div>
      ) : (
        <div className="section-card shadow-sm overflow-hidden reveal">
          {hasil.baris.length === 0 ? (
            <div className="px-5 py-14 text-center text-sm text-gray-400" data-testid="daftar-kosong">
              <i className="fas fa-inbox text-4xl text-gray-300 dark:text-gray-600 mb-3 block" aria-hidden="true" />
              {status === "menunggu" ? "Tidak ada pengajuan yang menunggu." : "Belum ada pengajuan."}
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700/50" data-testid="daftar-pengajuan">
              {hasil.baris.map((p) => (
                <li key={p.id}>
                  <Link href={`/pengajuan/${p.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/40">
                    <div className="min-w-0">
                      <div className="text-sm font-extrabold text-gray-800 dark:text-white truncate">{p.siswa.name} <span className="font-semibold text-gray-400">· Kelas {p.siswa.class}</span></div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {p.jenis === "sakit" ? "Sakit" : "Izin"} · {ringkasRentang(p.tanggalDari, p.tanggalSampai)} · {p.hari.length} hari · diajukan {formatTanggalPendek(p.diajukanPada.slice(0, 10))}
                        {p.lampiran && <> · <i className="fas fa-paperclip" aria-label="ada lampiran" /></>}
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full border text-[11px] font-extrabold ${GAYA_STATUS[p.status]}`}>{STATUS_PENGAJUAN_LABEL[p.status]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <InfoJumlah tampil={hasil.baris.length} total={hasil.total} satuan="pengajuan" />
        <Pagination page={halaman} totalPages={totalHalaman} buildHref={(p) => href(p)} />
      </div>
    </div>
  );
}
