-- Uji perilaku migrasi 020 (tanggal & alasan keluar di riwayat_kelas) dan 021 (ubah_tanggal_keluar).
--
-- Jalankan di database LOKAL/UJI yang sudah menjalankan migrasi 001-021 (superuser, mis. `postgres`):
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/nonaktif_riwayat.test.sql nama_db_uji
--
-- Seluruh skrip berjalan dalam SATU transaksi yang di-ROLLBACK di akhir, jadi tidak meninggalkan data.
-- Tetap JANGAN dijalankan di produksi: skrip menambah siswa uji (NISN "UJI-...") dan mengubah data
-- sementara. Tapel aktif dibaca dari absensi_setting (tidak diubah). Backfill 020 tidak diuji di sini
-- karena hanya berjalan sekali saat migrasi.
\set ON_ERROR_STOP on

begin;

create function pg_temp.cek(label text, kondisi boolean) returns void language plpgsql as $$
begin
  if kondisi is not true then raise exception 'GAGAL: %', label; end if;
  raise notice 'OK    : %', label;
end $$;

create function pg_temp.baris(p_nisn text, p_tapel text) returns riwayat_kelas language sql as $$
  select r.* from riwayat_kelas r join students s on s.id = r.siswa_id where s.nisn = p_nisn and r.tapel = p_tapel $$;

create function pg_temp.galat(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return null; exception when others then return sqlerrm; end $$;

-- tapel aktif harus ada
select pg_temp.cek('absensi_setting punya tapel aktif', (select coalesce(tapel, '') <> '' from absensi_setting order by id limit 1));
create temp table _t as select tapel from absensi_setting order by id limit 1;

insert into students (name, class, nisn) values
  ('UJI A', '7A', 'UJI-1'), ('UJI B', '7A', 'UJI-2'), ('UJI C', '7B', 'UJI-3');
select pg_temp.cek('siswa aktif baru punya baris riwayat tanpa tanggal/alasan keluar',
  (select count(*) = 3 from riwayat_kelas r join students s on s.id = r.siswa_id, _t
     where s.nisn like 'UJI-%' and r.tapel = _t.tapel and r.nonaktif_pada is null and r.alasan_nonaktif is null));

-- 020: nonaktifkan dengan tanggal pilihan
select nonaktifkan_siswa((select id from students where nisn = 'UJI-1'), 'pindah', '2026-10-15');
select pg_temp.cek('nonaktifkan dengan tanggal: tanggal, alasan, dan status tersimpan',
  (select nonaktif_pada = '2026-10-15' and alasan_nonaktif = 'pindah' from pg_temp.baris('UJI-1', (select tapel from _t)) )
  and (select status = 'pindah' from students where nisn = 'UJI-1'));

-- 020: tanpa tanggal = hari ini WIB
select nonaktifkan_siswa((select id from students where nisn = 'UJI-2'), 'lulus', null);
select pg_temp.cek('nonaktifkan tanpa tanggal: hari ini (WIB)',
  (select nonaktif_pada = (now() at time zone 'Asia/Jakarta')::date and alasan_nonaktif = 'lulus' from pg_temp.baris('UJI-2', (select tapel from _t))));

-- 020: penolakan
select pg_temp.cek('nonaktifkan ulang ditolak', pg_temp.galat($q$select nonaktifkan_siswa((select id from students where nisn='UJI-1'),'pindah',null)$q$) = 'Siswa ini sudah berstatus non-aktif.');
select pg_temp.cek('id tidak ada ditolak', pg_temp.galat($q$select nonaktifkan_siswa(-1,'pindah',null)$q$) = 'Siswa tidak ditemukan.');
select pg_temp.cek('alasan tidak valid ditolak', pg_temp.galat($q$select nonaktifkan_siswa((select id from students where nisn='UJI-3'),'cuti',null)$q$) like 'Alasan tidak valid%');

-- 020: constraint
select pg_temp.cek('tanggal tanpa alasan ditolak constraint',
  pg_temp.galat($q$update riwayat_kelas set alasan_nonaktif = null where siswa_id = (select id from students where nisn='UJI-1') and nonaktif_pada is not null$q$) like '%riwayat_kelas_tanggal_alasan_check%');
select pg_temp.cek('alasan selain lulus/pindah ditolak constraint',
  pg_temp.galat($q$update riwayat_kelas set alasan_nonaktif = 'cuti' where siswa_id = (select id from students where nisn='UJI-1')$q$) like '%riwayat_kelas_alasan_check%');

-- 020: edit kelas siswa non-aktif tidak menimpa tanggal; lulus -> pindah mengganti alasan saja
update students set class = '7Z' where nisn = 'UJI-1';
select pg_temp.cek('edit kelas siswa non-aktif: tanggal tetap', (select nonaktif_pada = '2026-10-15' and kelas = '7Z' from pg_temp.baris('UJI-1', (select tapel from _t))));
update students set status = 'pindah' where nisn = 'UJI-2';
select pg_temp.cek('lulus -> pindah: alasan ikut, tanggal tetap',
  (select alasan_nonaktif = 'pindah' and nonaktif_pada = (now() at time zone 'Asia/Jakarta')::date from pg_temp.baris('UJI-2', (select tapel from _t))));

-- 020: siswa_tapel
select pg_temp.cek('siswa_tapel mengembalikan tanggal & alasan keluar',
  (select nonaktif_pada = '2026-10-15' and alasan_nonaktif = 'pindah' from siswa_tapel((select tapel from _t)) where nama = 'UJI A'));

-- 021: ubah_tanggal_keluar
select ubah_tanggal_keluar((select id from students where nisn = 'UJI-1'), '2026-10-10');
select pg_temp.cek('ubah tanggal: nilai baru, alasan tetap', (select nonaktif_pada = '2026-10-10' and alasan_nonaktif = 'pindah' from pg_temp.baris('UJI-1', (select tapel from _t))));
select ubah_tanggal_keluar((select id from students where nisn = 'UJI-1'), null);
select pg_temp.cek('ubah tanggal ke kosong: tanggal dihapus, alasan tetap', (select nonaktif_pada is null and alasan_nonaktif = 'pindah' from pg_temp.baris('UJI-1', (select tapel from _t))));
select pg_temp.cek('siswa aktif ditolak', pg_temp.galat($q$select ubah_tanggal_keluar((select id from students where nisn='UJI-3'), '2026-10-10')$q$) like 'Siswa ini masih aktif%');
select pg_temp.cek('id tidak ada ditolak (ubah)', pg_temp.galat($q$select ubah_tanggal_keluar(-1, '2026-10-10')$q$) = 'Siswa tidak ditemukan.');
select pg_temp.cek('tanggal masa depan ditolak', pg_temp.galat($q$select ubah_tanggal_keluar((select id from students where nisn='UJI-1'), ((now() at time zone 'Asia/Jakarta')::date + 1))$q$) = 'Tanggal keluar tidak boleh di masa depan.');

-- 021: siswa yang lulus lewat wizard (baris tapel lama, tanpa alasan): alasan diisi dari students.status,
-- dan hanya baris tapel TERAKHIR yang diubah
insert into students (name, class, nisn, status) values ('UJI D', '9A', 'UJI-4', 'lulus');
insert into riwayat_kelas (siswa_id, tapel, kelas)
  select id, t, '9A' from students, (values ('1998/1999'), ('1999/2000')) v(t) where nisn = 'UJI-4';
select ubah_tanggal_keluar((select id from students where nisn = 'UJI-4'), '2000-03-01');
select pg_temp.cek('tapel terakhir diubah dan alasan diisi dari status',
  (select nonaktif_pada = '2000-03-01' and alasan_nonaktif = 'lulus' from pg_temp.baris('UJI-4', '1999/2000')));
select pg_temp.cek('tapel yang lebih lama tidak tersentuh', (select nonaktif_pada is null and alasan_nonaktif is null from pg_temp.baris('UJI-4', '1998/1999')));

-- 020: diaktifkan kembali mengosongkan tanggal & alasan
update students set status = 'aktif' where nisn = 'UJI-1';
select pg_temp.cek('diaktifkan kembali: tanggal & alasan kosong', (select nonaktif_pada is null and alasan_nonaktif is null from pg_temp.baris('UJI-1', (select tapel from _t))));

-- 020: operasi massal (kenaikan kelas) yang mematikan sinkronisasi tidak menyentuh riwayat
select set_config('app.lewati_riwayat', '1', true);
update students set status = 'lulus' where nisn = 'UJI-3';
select pg_temp.cek('app.lewati_riwayat: baris riwayat tidak disentuh', (select nonaktif_pada is null and alasan_nonaktif is null from pg_temp.baris('UJI-3', (select tapel from _t))));

\echo SEMUA UJI LULUS (transaksi di-rollback)
rollback;
