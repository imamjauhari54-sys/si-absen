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

## Kontrak untuk cron Alpha otomatis

1. Panggil `terapkan_rencana_pengajuan(hari_ini)` **sebelum** menulis Alpha.
2. Hasilnya memuat `menunggu` (daftar siswa_id dengan pengajuan Menunggu hari itu): untuk mereka **jangan tulis Alpha dan jangan kirim WA Alpha**.
3. Siswa lain diproses seperti biasa.
Evaluasi Alpha saat ditolak/dibatalkan tidak mengirim WA (pemberitahuan penolakan menjadi tugas aplikasi).

## PIN orang tua

Login baca Portal Siswa tetap NISN saja. **Mengajukan/membatalkan wajib PIN 6 digit.** Verifikasi di SQL (`verifikasi_pin_ortu`) dengan kunci baris: 5 salah berturut-turut mengunci 15 menit, kelipatan 5 berikutnya menggandakan (maks 4 jam); tebakan paralel dihitung bergantian. PIN disimpan sebagai hash bcrypt.

> **Peringatan keamanan:** selama PIN masih **bawaan** (`pin_bawaan_ortu()`), siapa pun yang tahu NISN lolos. Aplikasi wajib memaksa ganti PIN (flag `pin_bawaan` dari `verifikasi_pin_ortu`) sebelum mengajukan. Jalur lebih aman yang sudah tersedia: `buat_pin_acak_ortu(ids)` (PIN acak, dibagikan wali kelas) dan `reset_pin_ortu(id)`.

## Pengujian

`supabase/tests/pengajuan_izin.test.sql` (53 pengecekan) dan `supabase/tests/pengajuan_izin_konkurensi.sh` (pengajuan serentak, tebakan PIN paralel, keputusan vs pembatalan, cron ganda). Jalankan hanya di database uji.
