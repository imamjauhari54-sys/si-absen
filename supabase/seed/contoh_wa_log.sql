-- Contoh isi wa_log buat nyoba halaman /log-wa dan banner di Dashboard.
-- Sesuaikan siswa_id di bawah biar match sama id yang beneran ada di
-- tabel students kamu (dari screenshot sebelumnya: id 1, 3, 4, 5, 6 ada).
-- Aman dijalankan berkali-kali, gak bentrok sama data lain.

insert into wa_log (siswa_id, nama_siswa, nomor_hp, tipe, status, error_message, created_at) values
  -- berhasil terkirim, notif hadir
  (1, 'Ahmad Fauzi Rahman', '6281234567890', 'absen', 'terkirim', null, now() - interval '2 hours'),

  -- gagal: gateway WA down / server error
  (3, 'Dewi Lestari', '6281234567891', 'absen', 'gagal', 'Gateway WA merespons status 500', now() - interval '90 minutes'),

  -- gagal: API key salah / expired
  (4, 'Nadia Putri Anggraini', '6281234567892', 'absen', 'gagal', 'Gateway WA merespons status 401', now() - interval '80 minutes'),

  -- gagal: nomor HP orang tua belum diisi sama sekali
  (5, 'Rian Pratama', null, 'absen', 'gagal', 'Nomor HP orang tua belum diisi.', now() - interval '70 minutes'),

  -- gagal: timeout / gak bisa konek ke gateway sama sekali
  (6, 'Budi Santoso', '6281234567893', 'alpha', 'gagal', 'fetch failed: connect ETIMEDOUT', now() - interval '3 hours'),

  -- berhasil terkirim, notif alpha
  (1, 'Ahmad Fauzi Rahman', '6281234567890', 'alpha', 'terkirim', null, now() - interval '1 day'),

  -- gagal: format nomor gak valid (misal kosong setelah dibersihin)
  (3, 'Dewi Lestari', '000', 'absen', 'gagal', 'Nomor HP tidak valid.', now() - interval '2 days');
