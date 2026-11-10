# Pengajuan izin/sakit dari Portal Siswa (migrasi 027)

Orang tua mengajukan → wali kelas/admin menyetujui → absensi tercatat. **Pengajuan tidak pernah langsung mengubah absensi.**

## Aturan

| Ketentuan | Sakit | Izin |
|---|---|---|
| Durasi | maks 14 hari (rentang kalender) | 1 hari sekolah |
| Beberapa hari | ya (Minggu & libur dilewati) | tidak (buat pengajuan baru) |
| Lampiran | wajib bila > 2 hari sekolah | opsional |
| Persetujuan wali kelas/admin | wajib | wajib |
| Scan mengalahkan pengajuan | ya | ya |

Batas umum (satu tempat: `aturan_pengajuan_izin()` / konstanta di fungsi): maks 7 hari ke belakang, 30 hari ke depan, 3 pengajuan Menunggu per siswa, tanggal yang sama tidak boleh dipakai dua pengajuan aktif (dijaga indeks unik).

## Siklus per hari (`pengajuan_izin_hari.hasil`)

- **hari lampau disetujui** → langsung ditulis lewat `edit_manual_absensi` (snapshot, bisa dipulihkan). Alpha lama diubah jadi izin/sakit. Hari yang sudah Hadir/Terlambat **tidak ditimpa** (`scan_menang`); hari yang sudah izin/sakit dibiarkan (`sudah_tercatat`).
- **hari ini/mendatang disetujui** → hanya **rencana** (`direncanakan`). Cron `terapkan_rencana_pengajuan(tanggal)` menulisnya pada harinya **hanya bila siswa tidak scan**. Bila siswa scan, Hadir/Terlambat menang; pengajuan tetap **Disetujui** sebagai riwayat, absensi mengikuti kejadian sebenarnya.
- **persetujuan sebagian** → hari yang tidak disetujui TIDAK otomatis izin/sakit; mengikuti aturan normal. Hari lampau tanpa catatan dievaluasi **Alpha** (`dialpha`).
- **ditolak / dibatalkan** → sama: hari lampau tanpa catatan dievaluasi Alpha; hari ini/mendatang diserahkan ke aturan normal.

## Status Menunggu di seluruh aplikasi

Hari yang pengajuannya **Menunggu** tampil **Menunggu** dan **tidak dihitung** (bukan Alpha) di: Rekap Harian & Bulanan admin, Portal Siswa (kartu bulanan, kartu ringkasan, grafik), ekspor CSV ("M"), peringatan Alpha berturut-turut, History semester (SQL), dan Alpha otomatis. Aturannya satu: `utils/rekap-siswa.ts` (baseline) + `tanggal_menunggu()` di SQL. Catatan **nyata** (Hadir/Terlambat/Izin/Sakit) pada hari itu tetap menang. Ditolak/dibatalkan → kembali ke baseline; Disetujui → catatan izin/sakit.

## Cron Alpha otomatis (`/api/absen/auto-alpha`, sudah tersambung)

1. Memanggil `terapkan_rencana_pengajuan(hari_ini)` **sebelum** membaca absensi: pengajuan disetujui untuk hari ini ditulis sebagai izin/sakit (hanya bila siswa tidak scan).
2. Siswa dengan pengajuan **Menunggu** hari ini: **tidak ditulis Alpha dan tidak dikirimi WA Alpha**.
3. **Gagal tertutup**: bila pemrosesan pengajuan error (selain fitur belum terpasang), tidak ada Alpha/WA yang dikirim dan respons 500.
Evaluasi Alpha saat ditolak/dibatalkan tidak mengirim WA (pemberitahuan keputusan menjadi tugas aplikasi).

## PIN orang tua (ACAK, tanpa PIN bawaan)

Login baca Portal Siswa tetap NISN saja. **Mengajukan/membatalkan wajib PIN 6 digit acak per siswa.** Alur: wali kelas/admin membuat PIN (`buat_pin_acak_ortu`) → membagikannya **pribadi** → menandai sudah dibagikan (`tandai_pin_dibagikan`). Sistem **tidak pernah** menganggap PIN terbagikan otomatis (`dibagikan_pada` hanya terisi lewat tindakan eksplisit). Siswa tanpa PIN tidak bisa mengajukan (`PIN_BELUM_DIATUR`).

Verifikasi di SQL (`verifikasi_pin_ortu`) dengan kunci baris: 5 salah berturut-turut mengunci 15 menit, kelipatan 5 berikutnya menggandakan (maks 4 jam); tebakan paralel dihitung bergantian. PIN disimpan sebagai hash bcrypt. Reset (`reset_pin_ortu`) membuat PIN acak **baru**; PIN lama mati dan status "dibagikan" dikosongkan. Orang tua boleh mengganti PIN sendiri (wajib PIN lama).

## Pengujian

`supabase/tests/pengajuan_izin.test.sql` (64 pengecekan, termasuk PIN acak dan status Menunggu di fungsi rekap SQL) dan `supabase/tests/pengajuan_izin_konkurensi.sh` (pengajuan serentak, tebakan PIN paralel, keputusan vs pembatalan, cron ganda). Jalankan hanya di database uji.
