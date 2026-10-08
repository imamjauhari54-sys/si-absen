"use client";

/**
 * Pagination client-side (bukan berbasis URL/Link seperti komponen
 * ui/Pagination) — dipakai khusus di tabel Rekap Harian & Bulanan yang
 * SENGAJA tetap menarik & merender SEMUA baris ke DOM (dibutuhkan untuk
 * widget statistik total & fitur Cetak/Print), tapi baris yang ditampilkan
 * di layar dibatasi per halaman lewat CSS (lihat penggunaan class
 * `hidden print:table-row` / `hidden print:block` di HarianTable &
 * BulananTable). Karena itu, kontrol halamannya cukup state React biasa,
 * tidak perlu query param — dan otomatis disembunyikan saat print lewat
 * class `no-print` yang sudah dipakai di seluruh halaman Rekap.
 */
export default function RekapPagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  const pageNumbers: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);
  for (let i = start; i <= end; i++) pageNumbers.push(i);

  return (
    <div className="no-print flex items-center justify-center gap-1.5 py-4 flex-wrap border-t border-gray-100 dark:border-gray-700/50">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="w-9 h-9 flex items-center justify-center rounded-lg text-xs font-bold border transition disabled:opacity-40 disabled:pointer-events-none border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
      >
        <i className="fas fa-chevron-left text-[10px]" />
      </button>

      {start > 1 && (
        <>
          <button
            type="button"
            onClick={() => onChange(1)}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-xs font-bold border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            1
          </button>
          {start > 2 && <span className="text-gray-400 text-xs px-1">...</span>}
        </>
      )}

      {pageNumbers.map((p) => (
        <button
          type="button"
          key={p}
          onClick={() => onChange(p)}
          className={`w-9 h-9 flex items-center justify-center rounded-lg text-xs font-bold border transition ${
            p === page
              ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
              : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
          }`}
        >
          {p}
        </button>
      ))}

      {end < totalPages && (
        <>
          {end < totalPages - 1 && <span className="text-gray-400 text-xs px-1">...</span>}
          <button
            type="button"
            onClick={() => onChange(totalPages)}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-xs font-bold border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {totalPages}
          </button>
        </>
      )}

      <button
        type="button"
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        className="w-9 h-9 flex items-center justify-center rounded-lg text-xs font-bold border transition disabled:opacity-40 disabled:pointer-events-none border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
      >
        <i className="fas fa-chevron-right text-[10px]" />
      </button>
    </div>
  );
}
