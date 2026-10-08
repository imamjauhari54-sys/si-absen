/**
 * Akun developer: admin biasa di level akses (role tetap "admin" di DB,
 * jadi otomatis punya akses penuh ke semua fitur admin — scan, kelola
 * siswa, log aktivitas, dll — tanpa perlu ubah satupun pengecekan
 * `role === "admin"` di seluruh app).
 *
 * Yang beda cuma satu: akun ini SENGAJA disembunyikan dari halaman
 * Manajemen Pengguna (dan API-nya) supaya nggak kelihatan/keedit/kehapus
 * dari sana. Cek dipisah ke sini biar konsisten dipakai di mana-mana.
 */
export const DEVELOPER_USERNAME = "imamjauhari85@gmail.com";

export function isDeveloperUsername(username: string | null | undefined): boolean {
  return (username ?? "").trim().toLowerCase() === DEVELOPER_USERNAME;
}
