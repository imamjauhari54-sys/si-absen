/** Hitung halaman untuk daftar yang sudah ada di memori. `page` dibatasi ke 1..totalPages. */
export function paginasi(total: number, pageDiminta: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const mentah = Number.isFinite(pageDiminta) ? Math.floor(pageDiminta) : 1;
  const page = Math.min(Math.max(1, mentah), totalPages);
  const dari = (page - 1) * pageSize;
  return { page, totalPages, dari, sampai: Math.min(total, dari + pageSize) };
}
