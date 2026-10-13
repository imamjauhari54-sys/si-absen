import type { ReactNode } from "react";

/**
 * Judul halaman standar: ikon + judul besar, subjudul di bawahnya.
 * Dipakai di semua halaman dalam (app) supaya bentuknya seragam.
 *
 * - `icon`   : nama ikon Font Awesome tanpa prefiks, mis. "fa-users"
 * - `suffix` : teks kecil di belakang judul, mis. "— Semua Kelas"
 * - `children`: isi subjudul (boleh teks atau elemen, mis. <strong>)
 */
export default function PageTitle({
  icon,
  title,
  suffix,
  children,
}: {
  icon: string;
  title: string;
  suffix?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-3">
        <i
          className={`fas ${icon} w-8 text-center text-2xl text-indigo-600 dark:text-indigo-400 flex-shrink-0`}
          aria-hidden="true"
        />
        <h2 className="text-2xl font-extrabold text-gray-800 dark:text-white tracking-tight">
          {title}
          {suffix && (
            <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-1">{suffix}</span>
          )}
        </h2>
      </div>
      {children && (
        <div className="text-gray-500 dark:text-gray-400 mt-1 text-sm font-medium">{children}</div>
      )}
    </div>
  );
}
