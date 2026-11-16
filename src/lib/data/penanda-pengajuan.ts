import { revalidateTag, unstable_cache } from "next/cache";
import { hitungPengajuanMenunggu } from "@/lib/data/pengajuan";

/**
 * Penanda jumlah pengajuan Menunggu di menu (admin: semua kelas; wali kelas: kelasnya).
 * Dipakai layout di SETIAP navigasi, jadi dicache singkat (30 dtk) dan dibuang segera saat ada pengajuan baru,
 * dibatalkan, atau diputuskan. TIDAK PERNAH melempar: penanda hanya hiasan, layout tidak boleh rusak karenanya
 * (mis. migrasi 027 belum dijalankan -> 0).
 */
export const TAG_PENANDA_PENGAJUAN = "pengajuan-menunggu";

export async function hitungPenandaPengajuan(kelas: string | null): Promise<number> {
  try {
    return await unstable_cache(() => hitungPengajuanMenunggu(kelas), ["penanda-pengajuan", kelas ?? "*"], {
      tags: [TAG_PENANDA_PENGAJUAN],
      revalidate: 30,
    })();
  } catch {
    return 0;
  }
}

/** Best-effort: kegagalan membuang cache tidak boleh menggagalkan permintaan (cache tetap habis sendiri dalam 30 dtk). */
export function segarkanPenandaPengajuan(): void {
  try {
    revalidateTag(TAG_PENANDA_PENGAJUAN, "max");
  } catch {
    /* di luar lingkup permintaan (mis. uji): abaikan */
  }
}
