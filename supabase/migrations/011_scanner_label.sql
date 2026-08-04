-- Jalankan di Supabase SQL Editor
-- Label kustom biar admin bisa kasih nama sendiri per device scanner
-- (misal "Scanner Gerbang Depan"), soalnya nama otomatis dari user-agent
-- gak bisa bedain 2 device merk/OS yang sama.
alter table absensi_scanner
  add column if not exists label text;
