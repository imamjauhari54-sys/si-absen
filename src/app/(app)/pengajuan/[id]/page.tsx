import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { assertBolehAksesSiswa } from "@/lib/auth/akses-kelas";
import { ambilDetailPengajuan, ambilSiswaIdPengajuan, GalatBaca } from "@/lib/data/pengajuan";
import { fiturBelumAktif, STATUS_PENGAJUAN_LABEL } from "@/lib/utils/pengajuan";
import { formatTanggalPendek, GAYA_STATUS, keteranganHari, ringkasRentang } from "@/lib/utils/pengajuan-form";
import { formatWaktuWib } from "@/lib/utils/tanggal";
import PageTitle from "@/components/ui/PageTitle";
import KeputusanPengajuan from "@/components/pengajuan/KeputusanPengajuan";

export const metadata: Metadata = { title: "Detail Pengajuan" };
export const dynamic = "force-dynamic";

export default async function DetailPengajuanPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(["admin", "guru"]);
  const { id: idMentah } = await params;
  if (!/^[0-9]{1,15}$/.test(idMentah)) notFound();
  const id = Number(idMentah);

  let detail;
  try {
    const siswaId = await ambilSiswaIdPengajuan(id);
    if (siswaId === null) notFound();
    // Akses diperiksa SEBELUM detail dimuat. Guru: "kelas lain" tampil sama dengan "tidak ada" (404), tidak membocorkan.
    const akses = await assertBolehAksesSiswa(session, siswaId);
    if (!akses.ok) notFound();
    detail = await ambilDetailPengajuan(id);
  } catch (e) {
    if (e instanceof GalatBaca && fiturBelumAktif(e.kodeDb)) {
      return <div className="w-full px-4 pt-2"><div role="alert" className="section-card p-6 text-sm text-rose-600">Fitur pengajuan izin belum aktif di server (migrasi 027 belum dijalankan).</div></div>;
    }
    throw e;
  }
  if (!detail) notFound();
  const { pengajuan: p, pratinjau } = detail;
  const lampiranAman = p.lampiran && /^https:\/\//i.test(p.lampiran) ? p.lampiran : null;

  return (
    <div className="w-full px-4 pt-2 mb-14">
      <div className="mb-4"><Link href="/pengajuan" className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"><i className="fas fa-arrow-left mr-1" aria-hidden="true" />Kembali ke daftar</Link></div>
      <div className="mb-6 reveal flex flex-wrap items-start justify-between gap-3">
        <PageTitle icon="fa-envelope-open-text" title={p.siswa.name}>
          Kelas {p.siswa.class}{p.siswa.nisn ? ` · NISN ${p.siswa.nisn}` : ""}
        </PageTitle>
        <span className={`px-3 py-1.5 rounded-full border text-xs font-extrabold ${GAYA_STATUS[p.status]}`} data-testid="status-pengajuan">{STATUS_PENGAJUAN_LABEL[p.status]}</span>
      </div>

      <div className="section-card shadow-sm p-5 mb-4 space-y-3 text-sm">
        <div className="font-extrabold text-gray-800 dark:text-white">{p.jenis === "sakit" ? "Sakit" : "Izin"} · {ringkasRentang(p.tanggalDari, p.tanggalSampai)}</div>
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Alasan dari orang tua</div>
          <p className="mt-1 text-gray-700 dark:text-gray-200 whitespace-pre-wrap break-words" data-testid="alasan">{p.alasan}</p>
        </div>
        {lampiranAman && (
          <a href={lampiranAman} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
            <i className="fas fa-paperclip" aria-hidden="true" /> Lihat lampiran (buka di tab baru)
          </a>
        )}
        <div className="text-[11px] text-gray-400">Diajukan {formatWaktuWib(p.diajukanPada)}</div>
      </div>

      {p.status === "menunggu" ? (
        <KeputusanPengajuan id={p.id} pratinjau={pratinjau} />
      ) : (
        <div className="section-card shadow-sm p-5 text-sm" data-testid="keputusan-final">
          <div className="font-extrabold text-gray-800 dark:text-white mb-2">
            {STATUS_PENGAJUAN_LABEL[p.status]}
            {p.diputuskanNama && <span className="font-semibold text-gray-500"> oleh {p.diputuskanNama}</span>}
            {p.diputuskanPada && <span className="font-semibold text-gray-400"> · {formatWaktuWib(p.diputuskanPada)}</span>}
          </div>
          <ul className="divide-y divide-gray-100 dark:divide-gray-700/50 text-xs">
            {p.hari.map((h) => {
              const k = keteranganHari(h, p.status, p.jenis);
              return (
                <li key={h.tanggal} className="flex justify-between gap-3 py-1.5">
                  <span className="font-semibold text-gray-600 dark:text-gray-300">{formatTanggalPendek(h.tanggal)}</span>
                  <span className="text-right text-gray-500 dark:text-gray-400">{k.teks}</span>
                </li>
              );
            })}
          </ul>
          {p.catatanKeputusan && <p className="mt-3 text-xs text-gray-600 dark:text-gray-300"><span className="font-bold">Catatan:</span> {p.catatanKeputusan}</p>}
        </div>
      )}
    </div>
  );
}
