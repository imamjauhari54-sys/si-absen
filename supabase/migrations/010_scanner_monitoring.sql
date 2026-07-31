-- Jalankan di Supabase SQL Editor
-- absensi_scanner sudah ada (dibuat manual). Migration ini cuma jaga-jaga
-- kolom scanner_id di absensi & absensi_log ada, karena dipakai proses/route.ts.
alter table absensi
  add column if not exists scanner_id text;

alter table absensi_log
  add column if not exists scanner_id text;
