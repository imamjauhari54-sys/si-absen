import Link from "next/link";

export default function JadwalCard({
  jamMasuk,
  batasTerlambat,
  jamPulang,
}: {
  jamMasuk: string;
  batasTerlambat: string;
  jamPulang: string;
}) {
  const jadwal = [
    { lbl: "Jam Masuk", val: jamMasuk, text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/20" },
    { lbl: "Batas Terlambat", val: batasTerlambat, text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/20" },
    { lbl: "Jam Pulang", val: jamPulang, text: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-50 dark:bg-indigo-900/20" },
  ];

  return (
    <div className="section-card p-5 lg:col-span-1 reveal flex flex-col">
      <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-2 border-b border-gray-100 dark:border-gray-700 pb-3 mb-3">
        <i className="fas fa-stopwatch text-indigo-500" /> Jadwal Sekolah
      </h3>

      <div className="space-y-3 flex-1">
        {jadwal.map((j) => (
          <div key={j.lbl} className={`flex justify-between items-center p-3 rounded-xl ${j.bg}`}>
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{j.lbl}</span>
            <span className={`font-mono text-sm font-bold ${j.text}`}>{j.val}</span>
          </div>
        ))}
      </div>

      <Link
        href="/setting"
        className="mt-4 block text-center py-2 px-4 rounded-xl text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:text-indigo-400 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/40 transition no-underline"
      >
        <i className="fas fa-cog mr-1" /> Ubah Pengaturan
      </Link>
    </div>
  );
}
