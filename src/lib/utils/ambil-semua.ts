/**
 * Supabase (PostgREST) membatasi hasil query maksimal 1000 baris per request
 * (default "Max rows"). Query yang melewati batas itu TIDAK error — barisnya
 * terpotong diam-diam, sehingga rekap bisa menampilkan alpha palsu atau angka
 * yang salah begitu jumlah siswa bertambah.
 *
 * Helper ini mengambil data per halaman lewat .range() sampai habis.
 * Query WAJIB punya .order() yang stabil (mis. .order("id")) supaya halaman
 * tidak tumpang-tindih.
 *
 * Contoh:
 *   const rows = await ambilSemua<{ siswa_id: number; tanggal: string }>((dari, sampai) =>
 *     supabaseAdmin.from("absensi").select("siswa_id, tanggal").order("id").range(dari, sampai)
 *   );
 */
export async function ambilSemua<T>(
  buatQuery: (dari: number, sampai: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  ukuranHalaman = 1000,
  batasHalaman = 200
): Promise<T[]> {
  const hasil: T[] = [];
  for (let h = 0; h < batasHalaman; h++) {
    const dari = h * ukuranHalaman;
    const { data, error } = await buatQuery(dari, dari + ukuranHalaman - 1);
    if (error) throw new Error(`Gagal mengambil data: ${error.message}`);
    const baris = data ?? [];
    hasil.push(...baris);
    if (baris.length < ukuranHalaman) break;
  }
  return hasil;
}
