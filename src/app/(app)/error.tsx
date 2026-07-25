"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="w-full px-4 pt-2 mb-14 flex items-center justify-center" style={{ minHeight: "60vh" }}>
      <div className="section-card p-8 max-w-md w-full text-center shadow-sm">
        <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-red-100 dark:bg-red-900/30 text-red-500 dark:text-red-400 flex items-center justify-center text-2xl">
          <i className="fas fa-triangle-exclamation" />
        </div>
        <h2 className="text-lg font-extrabold text-gray-800 dark:text-white mb-2">Terjadi Kesalahan</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
          Halaman ini gagal dimuat. Coba lagi, atau kembali ke Dashboard kalau masalah masih berlanjut.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-sm transition"
          >
            <i className="fas fa-rotate-right mr-1.5" /> Coba Lagi
          </button>
          <Link
            href="/dashboard"
            className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl text-sm font-bold transition no-underline"
          >
            Ke Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
