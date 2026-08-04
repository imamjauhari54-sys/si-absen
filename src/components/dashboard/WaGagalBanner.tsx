"use client";

import Link from "next/link";
import { useState } from "react";

export default function WaGagalBanner({ jumlah }: { jumlah: number }) {
  const [hidden, setHidden] = useState(false);
  if (hidden || jumlah <= 0) return null;

  return (
    <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300 reveal">
      <Link href="/log-wa" className="flex items-center gap-3 min-w-0 flex-1 no-underline text-inherit group">
        <div className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-900/40 flex items-center justify-center flex-shrink-0">
          <i className="fas fa-comment-slash text-sm" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-tight group-hover:underline">
            {jumlah} notifikasi WA gagal terkirim dalam 24 jam terakhir
          </p>
          <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-0.5">
            Kemungkinan gateway WA bermasalah atau ada nomor HP tidak valid — klik untuk lihat detailnya.
          </p>
        </div>
      </Link>
      <button
        onClick={() => setHidden(true)}
        title="Sembunyikan"
        className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-red-500 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40 transition"
      >
        <i className="fas fa-xmark text-sm" />
      </button>
    </div>
  );
}
