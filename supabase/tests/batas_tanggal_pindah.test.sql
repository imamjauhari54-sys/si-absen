-- Uji migrasi 022/023: tanggal pindah (riwayat_kelas.nonaktif_pada) = HARI TERAKHIR siswa masih dihitung
-- pada Rekap History (inklusif).
--
-- Jalankan di database LOKAL/UJI yang sudah menjalankan migrasi 001-023 (superuser, mis. `postgres`):
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/batas_tanggal_pindah.test.sql nama_db_uji
--
-- Satu transaksi yang di-ROLLBACK di akhir (tidak meninggalkan data), memakai tapel uji "1999/2000"
-- supaya tidak tercampur data sungguhan. JANGAN dijalankan di produksi (menambah siswa uji dan
-- menghabiskan nomor ID identity yang tidak ikut di-rollback). Tidak untuk SQL Editor Supabase
-- (memakai perintah psql \set dan \gset).
\set ON_ERROR_STOP on

begin;

create function pg_temp.cek(label text, kondisi boolean) returns void language plpgsql as $$
begin
  if kondisi is not true then raise exception 'GAGAL: %', label; end if;
  raise notice 'OK    : %', label;
end $$;

-- Skenario: siswa A pindah 20 Okt 2026 tetapi baru dinonaktifkan kemudian; auto-alpha sempat menulis
-- alpha sistem untuk 20, 21, 22 Okt. Siswa B tetap aktif sebagai pembanding. Minggu 18 Okt tidak ada.
insert into students (name, class, nisn) values ('PINDAH A', '7A', 'BTS-1'), ('AKTIF B', '7A', 'BTS-2'), ('AWAL C', '7A', 'BTS-3');
select id as a_id from students where nisn = 'BTS-1' \gset
select id as b_id from students where nisn = 'BTS-2' \gset
select id as c_id from students where nisn = 'BTS-3' \gset

insert into riwayat_kelas (siswa_id, tapel, kelas, nonaktif_pada, alasan_nonaktif) values
  (:a_id, '1999/2000', '7A', '2026-10-20', 'pindah'),
  (:b_id, '1999/2000', '7A', null, null),
  (:c_id, '1999/2000', '7A', '2026-10-12', 'pindah');   -- pindah SEBELUM semua record: tidak punya hari terhitung

-- A: hadir 13,14 | terlambat 15 | alpha 16, 19 | PADA tanggal pindah alpha sistem 20 |
--    sesudah pindah: hadir 21, alpha sistem 22
insert into absensi (siswa_id, tanggal, status, keterangan, tapel, semester, scan_oleh)
select :a_id, d::date, st, k, '1999/2000', 'ganjil', 'x' from (values
  ('2026-10-13','hadir',null),('2026-10-14','hadir',null),('2026-10-15','terlambat',null),
  ('2026-10-16','alpha',null),('2026-10-19','alpha',null),
  ('2026-10-20','alpha','Tanpa Keterangan (Sistem)'),('2026-10-21','hadir',null),('2026-10-22','alpha','Tanpa Keterangan (Sistem)')
) v(d, st, k);
-- B: aktif, hadir di semua tanggal yang sama
insert into absensi (siswa_id, tanggal, status, tapel, semester, scan_oleh)
select :b_id, d::date, 'hadir', '1999/2000', 'ganjil', 'x'
from unnest(array['2026-10-13','2026-10-14','2026-10-15','2026-10-16','2026-10-19','2026-10-20','2026-10-21','2026-10-22']) d;
-- C: hanya punya record SESUDAH tanggal pindahnya (12 Okt)
insert into absensi (siswa_id, tanggal, status, tapel, semester, scan_oleh)
values (:c_id, '2026-10-13', 'alpha', '1999/2000', 'ganjil', 'x');

-- 1. History semester ganjil: record sesudah tanggal pindah dipotong, pada tanggal pindah masih dihitung
select pg_temp.cek('A: record sampai DAN PADA 20 Okt dihitung (2 hadir, 1 terlambat, 3 alpha)',
  (select jsonb_object_agg(status, jumlah) = '{"hadir":2,"terlambat":1,"alpha":3}'::jsonb
     from rekap_history_siswa('1999/2000', 'ganjil', array[:a_id]::bigint[])));
select pg_temp.cek('A: hadir 21 Okt dan alpha otomatis 22 Okt (sesudah pindah) tidak ikut terhitung',
  (select sum(jumlah) = 6 from rekap_history_siswa('1999/2000', 'ganjil', array[:a_id]::bigint[])));
select pg_temp.cek('B (aktif): semua 8 record dihitung',
  (select sum(jumlah) = 8 from rekap_history_siswa('1999/2000', 'ganjil', array[:b_id]::bigint[])));
select pg_temp.cek('C (pindah sebelum semua record): tidak ada hari terhitung, tidak muncul di agregat',
  (select count(*) = 0 from rekap_history_siswa('1999/2000', 'ganjil', array[:c_id]::bigint[])));

-- 2. Semester berikutnya (genap): siswa yang pindah di ganjil tidak punya hari terhitung
insert into absensi (siswa_id, tanggal, status, tapel, semester, scan_oleh)
values (:a_id, '2027-01-12', 'alpha', '1999/2000', 'genap', 'x'), (:b_id, '2027-01-12', 'hadir', '1999/2000', 'genap', 'x');
select pg_temp.cek('semester genap: A (pindah di ganjil) hilang dari agregat',
  (select count(*) = 0 from rekap_history_siswa('1999/2000', 'genap', array[:a_id]::bigint[])));
select pg_temp.cek('semester genap: B (aktif) tetap ada',
  (select count(*) = 1 from rekap_history_siswa('1999/2000', 'genap', array[:b_id]::bigint[])));

-- 3. Penyebut persentase per siswa
select pg_temp.cek('hari efektif satu semester = 8 hari unik (13,14,15,16,19,20,21,22 Okt)',
  hari_efektif('1999/2000', 'ganjil') = 8);
select pg_temp.cek('hari_efektif_sampai 20 Okt = 6 hari (13,14,15,16,19,20) — termasuk tanggal pindah',
  hari_efektif_sampai('1999/2000', 'ganjil', '2026-10-20') = 6);
select pg_temp.cek('hari_efektif_sampai tanpa batas (null) = hari_efektif',
  hari_efektif_sampai('1999/2000', 'ganjil', null) = hari_efektif('1999/2000', 'ganjil'));
select pg_temp.cek('hari_efektif_sampai setelah semua record = hari_efektif',
  hari_efektif_sampai('1999/2000', 'ganjil', '2030-01-01') = hari_efektif('1999/2000', 'ganjil'));
select pg_temp.cek('persen A dengan penyebut sampai tanggal pindah = (2 hadir + 1 terlambat) / 6 = 50%',
  round(((2 + 1)::numeric / hari_efektif_sampai('1999/2000', 'ganjil', '2026-10-20')) * 100, 1) = 50.0);
select pg_temp.cek('fungsi lama hari_efektif_sebelum sudah dihapus',
  not exists (select 1 from pg_proc where proname = 'hari_efektif_sebelum'));

-- 4. Tanggal pindah diubah/dikosongkan: hasil menyesuaikan, tanpa menghapus record
update riwayat_kelas set nonaktif_pada = null, alasan_nonaktif = null where siswa_id = :a_id and tapel = '1999/2000';
select pg_temp.cek('tanggal pindah dikosongkan: semua 8 record A terhitung lagi',
  (select sum(jumlah) = 8 from rekap_history_siswa('1999/2000', 'ganjil', array[:a_id]::bigint[])));
update riwayat_kelas set nonaktif_pada = '2026-10-21', alasan_nonaktif = 'pindah' where siswa_id = :a_id and tapel = '1999/2000';
select pg_temp.cek('tanggal pindah digeser ke 21 Okt: 7 record terhitung (hadir 21 Okt ikut, 22 Okt dipotong)',
  (select sum(jumlah) = 7 from rekap_history_siswa('1999/2000', 'ganjil', array[:a_id]::bigint[])));
select pg_temp.cek('record absensi tidak ada yang terhapus',
  (select count(*) = 8 + 1 from absensi where siswa_id = :a_id and tapel = '1999/2000'));

-- 5. Hari libur tetap diabaikan bersama batas tanggal pindah
insert into hari_libur (tanggal, keterangan) values ('2026-10-14', 'uji');
update riwayat_kelas set nonaktif_pada = '2026-10-20' where siswa_id = :a_id and tapel = '1999/2000';
select pg_temp.cek('hari libur 14 Okt + batas 20 Okt: A tinggal 5 record terhitung',
  (select sum(jumlah) = 5 from rekap_history_siswa('1999/2000', 'ganjil', array[:a_id]::bigint[])));
select pg_temp.cek('hari_efektif_sampai mengabaikan hari libur (5 hari)',
  hari_efektif_sampai('1999/2000', 'ganjil', '2026-10-20') = 5);

\echo SEMUA UJI LULUS (transaksi di-rollback)
rollback;
