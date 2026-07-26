import Link from "next/link";

/**
 * Kontrol paginasi sederhana berbasis link (?page=N), supaya tetap jalan di
 * halaman server component tanpa JS tambahan. `buildHref` menerima nomor
 * halaman dan mengembalikan URL lengkap (termasuk filter/search yang sedang
 * aktif).
 */
export default function Pagination({
  page,
  totalPages,
  buildHref,
}: {
  page: number;
  totalPages: number;
  buildHref: (page: number) => string;
}) {
  if (totalPages <= 1) return null;

  const pageNumbers: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);
  for (let i = start; i <= end; i++) pageNumbers.push(i);

  return (
    <div className="flex items-center justify-center gap-1.5 py-5 flex-wrap">
      <Link
        href={buildHref(Math.max(1, page - 1))}
        aria-disabled={page <= 1}
        className={`w-9 h-9 flex items-center justify-center rounded-lg text-xs font-bold border transition no-underline ${
          page <= 1
            ? "pointer-events-none opacity-40 border-gray-200 dark:border-gray-700 text-gray-400"
            : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
        }`}
      >
        <i className="fas fa-chevron-left text-[10px]" />
      </Link>

      {start > 1 && (
        <>
          <Link href={buildHref(1)} className="w-9 h-9 flex items-center justify-center rounded-lg text-xs font-bold border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 no-underline">
            1
          </Link>
          {start > 2 && <span className="text-gray-400 text-xs px-1">...</span>}
        </>
      )}

      {pageNumbers.map((p) => (
        <Link
          key={p}
          href={buildHref(p)}
          className={`w-9 h-9 flex items-center justify-center rounded-lg text-xs font-bold border transition no-underline ${
            p === page
              ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
              : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
          }`}
        >
          {p}
        </Link>
      ))}

      {end < totalPages && (
        <>
          {end < totalPages - 1 && <span className="text-gray-400 text-xs px-1">...</span>}
          <Link href={buildHref(totalPages)} className="w-9 h-9 flex items-center justify-center rounded-lg text-xs font-bold border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 no-underline">
            {totalPages}
          </Link>
        </>
      )}

      <Link
        href={buildHref(Math.min(totalPages, page + 1))}
        aria-disabled={page >= totalPages}
        className={`w-9 h-9 flex items-center justify-center rounded-lg text-xs font-bold border transition no-underline ${
          page >= totalPages
            ? "pointer-events-none opacity-40 border-gray-200 dark:border-gray-700 text-gray-400"
            : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
        }`}
      >
        <i className="fas fa-chevron-right text-[10px]" />
      </Link>
    </div>
  );
}
