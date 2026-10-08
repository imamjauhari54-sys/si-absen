import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { getWaLogPage, hitungWaGagalTotal } from "@/lib/data/wa-log";
import Pagination from "@/components/ui/Pagination";

const PAGE_SIZE = 10;

export const metadata: Metadata = { title: "Log Notifikasi WA" };
export const dynamic = "force-dynamic";

const BULAN_INDO = ["", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function formatWaktu(iso: string) {
  const d = new Date(iso);
  const tgl = String(d.getDate()).padStart(2, "0");
  const bln = BULAN_INDO[d.getMonth() + 1];
  const jam = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${tgl} ${bln}, ${jam}`;
}

const TIPE_LABEL: Record<string, string> = { absen: "Absen", alpha: "Alpha" };

export default async function LogWaPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireSession(["admin"]);

  const params = await searchParams;
  const pageParam = Math.max(1, parseInt(params.page || "1", 10) || 1);
  const [{ rows: logs, total, totalPages, page }, jumlahGagal] = await Promise.all([
    getWaLogPage(pageParam, PAGE_SIZE),
    hitungWaGagalTotal(),
  ]);
  const buildPageHref = (p: number) => `/log-wa?page=${p}`;

  return (
    <div className="w-full px-4 pt-2 mb-14">
      <div className="mb-6 reveal">
        <h2 className="text-2xl font-extrabold text-gray-800 dark:text-white tracking-tight">Log Notifikasi WA</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm font-medium">
          Riwayat percobaan kirim notifikasi WhatsApp ke orang tua. Total{" "}
          <strong className="text-gray-700 dark:text-gray-200">{total}</strong> percobaan.
          {jumlahGagal > 0 && (
            <span className="ml-1 text-red-500 font-bold">{jumlahGagal} gagal di antaranya.</span>
          )}
        </p>
      </div>

      <div className="section-card shadow-sm overflow-hidden reveal">
        {logs.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <div className="flex flex-col items-center justify-center opacity-60">
              <i className="fas fa-comment-slash text-4xl text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-sm font-bold text-gray-500 dark:text-gray-400">
                Belum ada percobaan kirim WA tercatat
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {logs.map((log) => {
              const gagal = log.status === "gagal";
              return (
                <div key={log.id} className="px-5 py-4 flex gap-3 items-start">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      gagal
                        ? "text-red-500 bg-red-50 dark:bg-red-900/20"
                        : "text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                    }`}
                  >
                    <i className={`fas ${gagal ? "fa-triangle-exclamation" : "fa-check"} text-xs`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug">
                      <span className="font-bold">{log.namaSiswa}</span> — notif {TIPE_LABEL[log.tipe] ?? log.tipe}{" "}
                      {gagal ? "gagal dikirim" : "berhasil terkirim"}
                      {log.nomorHp ? ` ke ${log.nomorHp}` : " (nomor HP kosong)"}
                    </p>
                    {gagal && log.errorMessage && (
                      <p className="text-xs text-red-500 mt-0.5 font-mono break-all">{log.errorMessage}</p>
                    )}
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">{formatWaktu(log.createdAt)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Pagination page={page} totalPages={totalPages} buildHref={buildPageHref} />
      </div>
    </div>
  );
}
