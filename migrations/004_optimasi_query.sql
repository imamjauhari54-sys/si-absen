-- =====================================================================
-- Migrasi optimasi query (perbaikan loading halaman Data Siswa, Rekap
-- History, dan dropdown "reset data per bulan" di Pengaturan).
-- Jalankan SEKALI lewat Supabase SQL Editor. Aman dijalankan berkali-kali.
-- =====================================================================

-- Fungsi ini menggantikan cara lama yang narik SELURUH kolom `tanggal` dari
-- tabel `absensi` (bisa puluhan ribu baris seiring waktu) cuma buat diambil
-- bulan-nya (YYYY-MM) yang unik. Dengan RPC ini, perhitungan DISTINCT
-- dilakukan di level database (lebih cepat, tidak transfer data mentah ke
-- server Next.js).
create or replace function distinct_bulan_absensi()
returns table (bulan text) as $$
  select distinct to_char(tanggal::date, 'YYYY-MM') as bulan
  from absensi
  order by bulan desc;
$$ language sql stable;

-- Index bantu supaya query bertanggal (dipakai di banyak halaman rekap)
-- tetap cepat walau datanya sudah banyak.
create index if not exists idx_absensi_tanggal on absensi (tanggal);
create index if not exists idx_absensi_tapel_semester on absensi (tapel, semester);
create index if not exists idx_absensi_siswa_id on absensi (siswa_id);
create index if not exists idx_students_class on students (class);
