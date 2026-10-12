import Link from "next/link";
import type { RiwayatKelasSiswa } from "@/lib/data/riwayat-kelas";

/**
 * Perjalanan kelas satu siswa per tahun pelajaran. Chip yang diklik membuka history tapel itu
 * (filter semester dipertahankan). Disembunyikan kalau baru ada satu tapel — belum ada yang
 * bisa dibandingkan.
 */
export default function RiwayatKelas({
  riwayat,
  tapelAktif,
  tapelDilihat,
  semester,
}: {
  riwayat: RiwayatKelasSiswa[];
  tapelAktif: string;
  tapelDilihat: string;
  semester: string;
}) {
  if (riwayat.length < 2) return null;

  return (
    <div className="mt-3">
      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Riwayat Kelas</div>
      <div className="flex flex-wrap gap-2">
        {riwayat.map((r) => {
          const dilihat = r.tapel === tapelDilihat;
          const qs = new URLSearchParams({ tapel: r.tapel, semester });
          return (
            <Link
              key={r.tapel}
              href={`?${qs.toString()}`}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border no-underline transition ${
                dilihat
                  ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                  : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-indigo-400"
              }`}
            >
              <span className="font-mono opacity-80">{r.tapel}</span>
              <span>Kelas {r.kelas}</span>
              {r.tapel === tapelAktif && <span className={`text-[9px] uppercase ${dilihat ? "opacity-80" : "text-emerald-600 dark:text-emerald-400"}`}>aktif</span>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
