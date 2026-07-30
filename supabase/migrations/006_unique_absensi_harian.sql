-- 006_unique_absensi_harian.sql
-- Menutup race condition di scan-absen/proses: dua scan yang datang nyaris
-- bersamaan (misal 2 scanner beda di gerbang yang sama) bisa lolos SELECT
-- "belum ada absen hari ini" berdua sebelum salah satunya sempat INSERT,
-- lalu keduanya INSERT baris `absensi` masing-masing untuk siswa+tanggal
-- yang sama. Constraint ini bikin baris kedua otomatis ditolak di level
-- database, bukan cuma diandalkan dari urutan baca-lalu-tulis di kode.
--
-- Aman dijalankan ulang (idempotent).

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'absensi_siswa_tanggal_unique'
  ) then
    -- Kalau kebetulan sudah ada baris duplikat (siswa_id, tanggal) dari bug
    -- lama, ALTER TABLE ini akan gagal dengan pesan constraint violation.
    -- Kalau itu terjadi, bersihkan dulu duplikatnya (simpan baris dengan id
    -- terkecil, hapus sisanya) sebelum menjalankan migration ini lagi.
    alter table absensi
      add constraint absensi_siswa_tanggal_unique unique (siswa_id, tanggal);
  end if;
end $$;
