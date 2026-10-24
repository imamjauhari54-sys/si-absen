import type { ReactNode } from "react";

/**
 * Teks informasi jumlah data di bawah tabel/daftar: "Menampilkan X dari Y {satuan}".
 * Ditaruh RAPAT tepat di bawah kartu tabel (sebelum kontrol halaman), supaya tampilannya seragam
 * di semua halaman. `children` = info tambahan di sisi kanan (mis. ringkasan L/P di Data Siswa).
 */
export default function InfoJumlah({
  tampil,
  total,
  satuan,
  pencarian,
  className = "",
  children,
}: {
  tampil: number;
  total: number;
  satuan: string;
  /** Kata kunci pencarian yang sedang aktif (opsional). */
  pencarian?: string;
  className?: string;
  children?: ReactNode;
}) {
  if (total <= 0) return null;
  return (
    <div
      className={`no-print mt-1 px-1 flex flex-wrap justify-between items-center gap-2 text-xs text-gray-500 dark:text-gray-400 ${className}`}
    >
      <span>
        Menampilkan <strong className="text-gray-700 dark:text-gray-300">{tampil}</strong> dari{" "}
        <strong className="text-gray-700 dark:text-gray-300">{total}</strong> {satuan}
        {pencarian && (
          <>
            {" "}
            · Hasil pencarian &quot;<strong>{pencarian}</strong>&quot;
          </>
        )}
      </span>
      {children}
    </div>
  );
}
