-- Uji fungsi koreksi_absen_masuk (migrasi 014) di database kosong.
-- Jalankan:  psql -v ON_ERROR_STOP=1 -f supabase/tests/koreksi_absen_masuk.test.sql <database-uji>
-- JANGAN dijalankan di database produksi (membuat tabel uji dengan nama sama).
\set ON_ERROR_STOP on

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;

drop table if exists absensi_log, absensi cascade;
create table absensi (
  id bigint generated always as identity primary key,
  siswa_id bigint not null, tanggal date not null,
  status text not null check (status in ('hadir','terlambat','izin','sakit','alpha')),
  jam_masuk time, jam_pulang time, keterangan text, scan_oleh text, scanner_id text,
  unique (siswa_id, tanggal)
);
create table absensi_log (
  id bigint generated always as identity primary key,
  admin_id bigint, siswa_id bigint, tanggal_absen date,
  status_lama text, status_baru text, keterangan text, scanner_id text,
  created_at timestamptz not null default now()
);
\i supabase/migrations/014_koreksi_scan_offline.sql

create or replace function _cek(nama text, kondisi boolean) returns void language plpgsql as $$
begin
  if not kondisi then raise exception 'GAGAL: %', nama; end if;
  raise notice 'OK    : %', nama;
end $$;

-- helper pemanggil
create or replace function _koreksi(p_siswa bigint, p_jam time, p_status text, p_scan_id text default null)
returns table (dikoreksi boolean, status_lama text, jam_lama time) language sql as $$
  select * from public.koreksi_absen_masuk(p_siswa, date '2026-10-08', p_jam, p_status, 'Tanpa Keterangan (Sistem)', 'HP-ADMIN', 'sistem_otomatis', 1, p_scan_id);
$$;

-- 1) offline 07.10, online 07.20 tercatat TERLAMBAT -> jam 07.10, status hadir
insert into absensi (siswa_id, tanggal, status, jam_masuk) values (1, '2026-10-08', 'terlambat', '07:20');
select _cek('terlambat 07.20 -> hadir 07.10', (select dikoreksi and status_lama = 'terlambat' from _koreksi(1, '07:10', 'hadir', '11111111-1111-4111-8111-111111111111')));
select _cek('baris absensi berubah', exists (select 1 from absensi where siswa_id = 1 and status = 'hadir' and jam_masuk = '07:10'));
select _cek('log koreksi tertulis (1 baris, ada teks koreksi)', (select count(*) = 1 and bool_and(keterangan like 'Koreksi scan offline:%') from absensi_log where siswa_id = 1));

-- 2) idempoten: item antrean yang sama dikirim ulang -> tidak ada efek kedua
select _cek('kirim ulang scan_id sama -> tidak dikoreksi lagi', (select not dikoreksi from _koreksi(1, '07:10', 'hadir', '11111111-1111-4111-8111-111111111111')));
select _cek('log tetap 1 baris', (select count(*) = 1 from absensi_log where siswa_id = 1));

-- 3) scan offline lebih LAMBAT dari yang tercatat tidak boleh memundurkan jam
select _cek('jam hanya bisa maju ke arah lebih awal', (select not dikoreksi from _koreksi(1, '07:14', 'hadir', '22222222-2222-4222-8222-222222222222')));
select _cek('jam masuk tetap 07.10', exists (select 1 from absensi where siswa_id = 1 and jam_masuk = '07:10'));

-- 4) alpha dari sistem dikoreksi jadi hadir; keterangan alpha dibersihkan
insert into absensi (siswa_id, tanggal, status, keterangan) values (2, '2026-10-08', 'alpha', 'Tanpa Keterangan (Sistem)');
select _cek('alpha sistem -> hadir', (select dikoreksi and status_lama = 'alpha' from _koreksi(2, '07:10', 'hadir', '33333333-3333-4333-8333-333333333333')));
select _cek('keterangan alpha sistem dihapus & jam terisi', exists (select 1 from absensi where siswa_id = 2 and status = 'hadir' and jam_masuk = '07:10' and keterangan is null));

-- 5) alpha dari sistem + scan 07.30 -> terlambat
insert into absensi (siswa_id, tanggal, status, keterangan) values (3, '2026-10-08', 'alpha', 'Tanpa Keterangan (Sistem)');
select _cek('alpha sistem -> terlambat 07.30', (select dikoreksi from _koreksi(3, '07:30', 'terlambat', '44444444-4444-4444-8444-444444444444')));
select _cek('status terlambat tersimpan', exists (select 1 from absensi where siswa_id = 3 and status = 'terlambat' and jam_masuk = '07:30'));

-- 6) izin / sakit / alpha manual TIDAK ditimpa
insert into absensi (siswa_id, tanggal, status, keterangan) values (4, '2026-10-08', 'sakit', 'Demam'), (5, '2026-10-08', 'izin', 'Acara keluarga'), (6, '2026-10-08', 'alpha', 'Tidak ada kabar');
select _cek('sakit tidak ditimpa', (select not dikoreksi from _koreksi(4, '07:10', 'hadir')));
select _cek('izin tidak ditimpa', (select not dikoreksi from _koreksi(5, '07:10', 'hadir')));
select _cek('alpha manual tidak ditimpa', (select not dikoreksi from _koreksi(6, '07:10', 'hadir')));
select _cek('status manual utuh', (select count(*) = 3 from absensi where siswa_id in (4,5,6) and status in ('sakit','izin','alpha') and jam_masuk is null));
select _cek('tidak ada log untuk yang ditolak', (select count(*) = 0 from absensi_log where siswa_id in (4,5,6)));

-- 7) tidak ada absensi -> tidak ada efek
select _cek('tanpa absensi -> tidak dikoreksi', (select not dikoreksi from _koreksi(99, '07:10', 'hadir')));

-- 8) status_baru tidak valid ditolak
do $$ begin
  begin perform * from public.koreksi_absen_masuk(1, date '2026-10-08', time '07:00', 'alpha', 'x', 's', 'o', 1, null);
    raise exception 'GAGAL: status_baru alpha seharusnya ditolak';
  exception when raise_exception then
    if sqlerrm like 'GAGAL%' then raise; end if;
    raise notice 'OK    : status_baru tidak valid ditolak';
  end;
end $$;

-- 9) fungsi tidak bisa dipanggil anon/authenticated (hanya service_role)
select _cek('anon tanpa hak EXECUTE', not has_function_privilege('anon', 'public.koreksi_absen_masuk(bigint,date,time,text,text,text,text,bigint,text)', 'execute'));
select _cek('service_role punya hak EXECUTE', has_function_privilege('service_role', 'public.koreksi_absen_masuk(bigint,date,time,text,text,text,text,bigint,text)', 'execute'));
\echo === SEMUA UJI SQL LULUS ===
