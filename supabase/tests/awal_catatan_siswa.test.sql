-- Uji migrasi 026 (awal_catatan_siswa). Database LOKAL/UJI dengan migrasi 001-026; satu transaksi, di-ROLLBACK.
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/awal_catatan_siswa.test.sql nama_db_uji
\set ON_ERROR_STOP on
begin;

create function pg_temp.cek(label text, kondisi boolean) returns void language plpgsql as $$
begin
  if kondisi is not true then raise exception 'GAGAL: %', label; end if;
  raise notice 'OK    : %', label;
end $$;

insert into students (name, class, nisn) values
  ('AW MULAI JULI', '5', 'AW-1'), ('AW MULAI AGUSTUS', '5', 'AW-2'), ('AW LINTAS TAPEL', '5', 'AW-3'), ('AW TANPA CATATAN', '5', 'AW-4');
create function pg_temp.sid(n text) returns bigint language sql as $$ select id from students where nisn = n $$;

insert into absensi (siswa_id, tanggal, status, tapel, semester) values
  (pg_temp.sid('AW-1'), '2030-07-01', 'hadir', '2030/2031', 'ganjil'),
  (pg_temp.sid('AW-1'), '2030-09-03', 'hadir', '2030/2031', 'ganjil'),
  (pg_temp.sid('AW-2'), '2030-08-15', 'hadir', '2030/2031', 'ganjil'),
  (pg_temp.sid('AW-2'), '2030-08-16', 'alpha', '2030/2031', 'ganjil'),
  (pg_temp.sid('AW-3'), '2029-10-10', 'hadir', '2029/2030', 'ganjil'),   -- tapel sebelumnya
  (pg_temp.sid('AW-3'), '2030-11-05', 'hadir', '2030/2031', 'ganjil');

select pg_temp.cek('siswa mulai 1 Juli: catatan pertama 1 Juli',
  (select mulai = '2030-07-01' from awal_catatan_siswa('2030/2031', array[pg_temp.sid('AW-1')])));
select pg_temp.cek('siswa pertama tercatat 15 Agustus: catatan pertama 15 Agustus (bukan awal tapel)',
  (select mulai = '2030-08-15' from awal_catatan_siswa('2030/2031', array[pg_temp.sid('AW-2')])));
select pg_temp.cek('catatan tapel lain tidak ikut: AW-3 di 2030/2031 mulai 5 Nov (bukan 10 Okt 2029)',
  (select mulai = '2030-11-05' from awal_catatan_siswa('2030/2031', array[pg_temp.sid('AW-3')])));
select pg_temp.cek('tapel sebelumnya dipisah: AW-3 di 2029/2030 mulai 10 Okt 2029',
  (select mulai = '2029-10-10' from awal_catatan_siswa('2029/2030', array[pg_temp.sid('AW-3')])));
select pg_temp.cek('siswa TANPA catatan tidak muncul di hasil (aplikasi memperlakukannya eksplisit sebagai belum tercatat)',
  (select count(*) = 0 from awal_catatan_siswa('2030/2031', array[pg_temp.sid('AW-4')])));
select pg_temp.cek('banyak siswa sekaligus: 3 baris untuk 4 siswa (satu tanpa catatan), tiap siswa tepat satu baris',
  (select count(*) = 3 and count(distinct siswa_id) = 3
   from awal_catatan_siswa('2030/2031', array[pg_temp.sid('AW-1'), pg_temp.sid('AW-2'), pg_temp.sid('AW-3'), pg_temp.sid('AW-4')])));
select pg_temp.cek('hanya siswa yang diminta (filter ids)',
  (select count(*) = 1 from awal_catatan_siswa('2030/2031', array[pg_temp.sid('AW-2')])));
select pg_temp.cek('daftar kosong -> hasil kosong',
  (select count(*) = 0 from awal_catatan_siswa('2030/2031', array[]::bigint[])));

rollback;
