# Baseline perhitungan absensi (DIBEKUKAN)

**Satu siswa, satu tapel, satu periode, satu hasil** — dari Portal Siswa maupun dashboard admin.

## Aturan (hanya ada di `src/lib/utils/rekap-siswa.ts`)

Untuk setiap tanggal (bukan Minggu), status ditentukan berurutan:

| # | Kondisi | Status | Dihitung? |
|---|---|---|---|
| 1 | Hari libur | libur | tidak |
| 2 | Pada/sesudah tanggal pindah, atau di dalam jeda `[pindah, kembali)` | nonaktif | tidak (data tetap tersimpan) |
| 3 | Sebelum catatan pertama siswa di tapel itu (`awal_catatan_siswa`, migrasi 026); siswa tanpa catatan = semua hari | kosong | tidak |
| 4 | Ada catatan absensi | status catatan | ya |
| 5 | Hari lampau tanpa catatan | alpha (bawaan) | ya |
| 6 | Hari ini / mendatang tanpa catatan | kosong | tidak |

Tanggal kembali sudah dihitung; tanggal pindah sendiri tidak dihitung. Satu hari dihitung paling banyak satu kali.

## Siapa yang memakainya

Rekap Harian (termasuk ekspor CSV harian), Rekap Bulanan (admin), kartu Rekap Bulanan dan kartu ringkasan atas (Portal Siswa & riwayat admin), grafik tren 6 bulan. Batas awal (#3) selalu dari fungsi SQL yang sama (`awal_catatan_siswa`, lewat `ambilMulaiBanyak`). Hari libur (#1) selalu ikut dikirim ke fungsi bersama, termasuk di Rekap Harian.

Di Rekap Harian dan ekspornya, hari libur tampil/terekspor sebagai **Libur** dan siswa sebelum catatan pertama sebagai **Belum tercatat** — keduanya tidak dihitung dan bukan Alpha.

## Dibekukan

- Jangan menulis ulang rumus ini di halaman lain. Tes penjaga `rekap-siswa.baseline.test.ts` memakai **daftar izin**: literal `"alpha"` di `lib/data`, `lib/utils`, dan `app/api` hanya boleh ada di file yang terdaftar, dan `tidakDihitungPada()` hanya di file yang diizinkan. File baru yang melanggar membuat tes gagal dan harus ditinjau.
- Tes integrasi `rekap.integrasi.test.ts` menjalankan fungsi data sungguhan (Harian, Bulanan, Portal, ringkasan, grafik) terhadap database tiruan berbatas 1.000 baris dan membandingkannya dengan perhitungan acuan dari data mentah: hari libur, batas awal, pindah, jeda, dan paginasi ikut teruji.
- Mengubah aturan = mengubah angka yang dilihat siswa/orang tua. Ubah di `rekap-siswa.ts`, perbarui tes penerimaan di `rekap-siswa.baseline.test.ts`, dan pastikan semua tampilan ikut.

## Pengecualian yang diketahui (belum disatukan)

**Rekap History (akumulasi semester, admin)** memakai definisi *hari efektif* di database (`hari_dihitung_siswa`, `rekap_history_siswa`): hanya tanggal yang punya catatan absensi bagi siapa pun yang dihitung, dan tidak ada Alpha bawaan. Sama dengan aturan di atas selama auto-alpha menulis baris setiap hari sekolah; berbeda bila ada hari sekolah tanpa satu pun catatan. Menyatukannya adalah keputusan terpisah.
