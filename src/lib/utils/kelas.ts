/**
 * Rapikan input nama kelas dari admin supaya konsisten & menghindari typo umum,
 * misalnya admin tanpa sadar mengetik "Kelas 3" padahal cukup "3" saja (karena label
 * di UI sudah otomatis menambahkan kata "Kelas " di depannya) — kalau dibiarkan akan
 * jadi "Kelas Kelas 3" saat ditampilkan.
 */
export function normalizeKelas(input: string): string {
  const trimmed = input.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";

  // Buang kata "kelas" di depan (case-insensitive), boleh diikuti spasi/tanda hubung.
  const stripped = trimmed.replace(/^kelas[\s-]*/i, "").trim();

  // Kalau setelah dibuang jadi kosong (mis. admin cuma ngetik "Kelas"), pakai teks asli
  // supaya tidak kehilangan input sama sekali.
  return stripped || trimmed;
}
