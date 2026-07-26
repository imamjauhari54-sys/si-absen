"use client";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="px-4 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-2"
    >
      <i className="fas fa-print" /> Cetak
    </button>
  );
}
