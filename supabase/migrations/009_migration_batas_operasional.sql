-- Jalankan di Supabase SQL Editor
alter table absensi_setting
  add column if not exists durasi_kunci_menit integer not null default 120,
  add column if not exists toleransi_pagi_menit integer not null default 60;
