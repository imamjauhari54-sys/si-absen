-- Uji fungsi edit manual + Pulihkan (migrasi 019, revisi) di database KOSONG.
--
-- Jalankan dari akar repo, di database LOKAL/UJI saja (superuser, mis. `postgres`):
--   createdb si_absen_uji
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/edit_manual_pulihkan.test.sql si_absen_uji
--
-- JANGAN dijalankan di database produksi: skrip ini MENGHAPUS dan membuat ulang tabel uji dengan nama
-- sama (absensi, students, ...), dan mengubah default privileges database uji agar meniru Supabase.
-- Pakai database TERPISAH dari koreksi_absen_masuk.test.sql (tabel `absensi` keduanya berbeda bentuknya).
--
-- DUA MODE (jalankan keduanya; psql >= 13):
--   biasa : psql -v ON_ERROR_STOP=1 -f supabase/tests/edit_manual_pulihkan.test.sql si_absen_uji
--           meniru Supabase: objek baru otomatis terbuka bagi anon/authenticated/service_role (default privileges).
--   ketat : psql -v ON_ERROR_STOP=1 -v tanpa_default_privileges=1 -f supabase/tests/edit_manual_pulihkan.test.sql si_absen_uji
--           TANPA default privileges: hak hanya berasal dari grant/revoke EKSPLISIT di migrasi 019. Di mode ini
--           grant ke service_role benar-benar diuji kecukupannya (mis. kalau migrasi 020 membersihkan default privileges).
--
-- Peran: skenario RPC dijalankan sebagai `service_role` (seperti supabaseAdmin di aplikasi), dan bagian
-- hak akses mencoba sebagai `anon` dan `authenticated`. Peran dibuat kalau belum ada; service_role harus
-- BYPASSRLS (di Supabase memang begitu) karena tabel snapshot memakai RLS tanpa policy.
\set ON_ERROR_STOP on

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  begin
    alter role service_role bypassrls;
  exception when insufficient_privilege then
    raise notice 'service_role belum BYPASSRLS dan peran ini tidak boleh mengubahnya (butuh superuser).';
  end;
end $$;

drop table if exists absensi_edit_manual, absensi_log, log_aktivitas, wa_log, riwayat_kelas, absensi, absensi_setting, students, users cascade;
drop function if exists public.edit_manual_absensi(bigint, date[], text, text, text, bigint, text, text, text);

-- Meniru default privileges Supabase (tabel & fungsi baru otomatis terbuka bagi anon/authenticated/service_role).
-- Inilah alasan 019 harus mencabut hak secara EKSPLISIT. Hanya mengenai database uji ini.
-- Hanya mengenai database uji ini. Dalam mode ketat default privileges dibersihkan agar tidak ada hak "gratis".
grant usage on schema public to anon, authenticated, service_role;
\if :{?tanpa_default_privileges}
  \echo === MODE KETAT: tanpa default privileges (hak hanya dari grant eksplisit) ===
  alter default privileges in schema public revoke all on tables    from anon, authenticated, service_role;
  alter default privileges in schema public revoke all on functions from anon, authenticated, service_role;
  alter default privileges in schema public revoke all on sequences from anon, authenticated, service_role;
\else
  \echo === MODE BIASA: meniru default privileges Supabase ===
  alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
\endif

create table users (id bigint generated always as identity primary key, name text not null);
create table students (id bigint generated always as identity primary key, name text not null, class text not null);
create table absensi_setting (id bigint generated always as identity primary key, tapel text, semester text);
create table absensi (
  id bigint generated always as identity primary key,
  siswa_id bigint not null references students (id) on delete cascade,
  tanggal date not null,
  status text not null check (status in ('hadir','terlambat','izin','sakit','alpha')),
  jam_masuk time, jam_pulang time, keterangan text, lampiran text,
  tapel text, semester text, scan_oleh text, scanner_id text,
  unique (siswa_id, tanggal)
);
create table absensi_log (
  id bigint generated always as identity primary key,
  admin_id bigint, siswa_id bigint, tanggal_absen date,
  status_lama text, status_baru text, keterangan text, scanner_id text,
  created_at timestamptz not null default now()
);
create table log_aktivitas (
  id serial primary key,
  admin_id integer, aksi text not null, target text, keterangan text,
  created_at timestamptz not null default now()
);
create table riwayat_kelas (
  siswa_id bigint not null references students (id) on delete cascade,
  tapel text not null, kelas text not null,
  primary key (siswa_id, tapel)
);
create table wa_log (id bigint generated always as identity primary key, siswa_id bigint, pesan text);

-- Mode ketat: tabel dasar aplikasi (BUKAN tabel 019) diberi hak seperti di produksi supaya skenario bisa berjalan;
-- tabel/fungsi milik 019 tidak diberi apa pun di sini, hanya migrasi yang boleh memberinya.
\if :{?tanpa_default_privileges}
  grant all on all tables in schema public to service_role;
  grant select on all tables in schema public to anon, authenticated;
  grant all on all sequences in schema public to service_role;
\endif

insert into users (name) values ('Imam (Admin)'), ('Bu Sri');
-- Siswa 1..10: riwayat hanya 2026/2027. Siswa 11: 2025/2026 DAN 2026/2027. Siswa 12: hanya 2026/2027.
-- Siswa 13: tanpa riwayat kelas sama sekali.
insert into students (name, class) select 'Siswa ' || g, '5' from generate_series(1, 13) g;
insert into riwayat_kelas (siswa_id, tapel, kelas) select g, '2026/2027', '5' from generate_series(1, 12) g;
insert into riwayat_kelas (siswa_id, tapel, kelas) values (11, '2025/2026', '4');
-- Setting AKTIF sengaja berbeda dari tapel historis yang diuji: tidak boleh dipakai untuk tanggal historis.
insert into absensi_setting (tapel, semester) values ('2026/2027', 'ganjil');

-- Default privileges tidak boleh berubah karena migrasi.
create temp table _defacl_awal as select defaclrole::regrole::text as r, defaclnamespace::regnamespace::text as n, defaclobjtype, defaclacl::text as a from pg_default_acl;

\i supabase/migrations/019_edit_manual_pulihkan.sql
-- Jalankan ulang harus aman (idempotent).
\i supabase/migrations/019_edit_manual_pulihkan.sql

create or replace function _cek(nama text, kondisi boolean) returns void language plpgsql as $$
begin
  if kondisi is not true then raise exception 'GAGAL: %', nama; end if;
  raise notice 'OK    : %', nama;
end $$;

-- Kode galat (SQLSTATE) dari sebuah perintah, atau NULL kalau berhasil. Dipakai untuk uji penolakan.
create or replace function _sqlstate(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return null; exception when others then return sqlstate; end $$;
create or replace function _pesan(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return null; exception when others then return sqlerrm; end $$;
create or replace function _hint(p_sql text) returns text language plpgsql as $$
declare v text;
begin execute p_sql; return null; exception when others then get stacked diagnostics v = pg_exception_hint; return v; end $$;

create or replace function _edit(p_siswa bigint, p_tgl date, p_status text, p_ket text default null, p_lamp text default null)
returns boolean language sql as $$
  select o_diubah from public.edit_manual_absensi(p_siswa, array[p_tgl], p_status, p_ket, p_lamp, 1, 'Imam (Admin)');
$$;

create or replace function _periode(p_siswa bigint, p_tgl date, p_status text default 'izin')
returns jsonb language sql as $$
  select o_periode_baru from public.edit_manual_absensi(p_siswa, array[p_tgl], p_status, null, null, 1, 'Imam (Admin)');
$$;

-- _pulihkan: memulihkan EDIT TERAKHIR yang ada (seperti pengguna yang menekan tombol Pulihkan pada kondisi terbaru).
-- Kalau belum ada edit sama sekali dikirim ID 0 (fungsi menjawab tidak_ada_edit sebelum memeriksa ID).
create or replace function _pulihkan(p_siswa bigint, p_tgl date) returns text language sql as $$
  select o_kode from public.pulihkan_edit_manual(
    p_siswa, p_tgl,
    coalesce((select max(e.id) from public.absensi_edit_manual e where e.siswa_id = p_siswa and e.tanggal = p_tgl), 0),
    1, 'Imam (Admin)');
$$;

-- _pulihkan_id: memulihkan edit dengan ID TERTENTU (yang dikonfirmasi pengguna, bisa sudah usang).
create or replace function _pulihkan_id(p_siswa bigint, p_tgl date, p_edit bigint) returns text language sql as $$
  select o_kode from public.pulihkan_edit_manual(p_siswa, p_tgl, p_edit, 1, 'Imam (Admin)');
$$;

create or replace function _bisa(p_siswa bigint, p_tgl date) returns boolean language sql as $$
  select exists (select 1 from public.daftar_bisa_pulihkan(p_tgl, array[p_siswa]));
$$;

-- Semua skenario RPC berikut berjalan sebagai service_role (seperti supabaseAdmin di aplikasi).
set role service_role;

-- ═══ 1) Contoh dari spesifikasi: hadir 07:15/14:00 + lampiran -> sakit -> Pulihkan ═══════════════
insert into absensi (siswa_id, tanggal, status, jam_masuk, jam_pulang, keterangan, lampiran, tapel, semester, scan_oleh, scanner_id)
values (1, '2026-10-08', 'hadir', '07:15', '14:00', null, 'fotoA', '2026/2027', 'ganjil', 'sistem_otomatis', 'HP-A');

select _cek('edit hadir -> sakit berhasil', _edit(1, '2026-10-08', 'sakit', 'Sakit'));
select _cek('status sakit: jam masuk & pulang dikosongkan, keterangan terisi',
  exists (select 1 from absensi where siswa_id = 1 and status = 'sakit' and jam_masuk is null and jam_pulang is null and keterangan = 'Sakit'));
select _cek('lampiran tidak diubah kalau tidak diminta', exists (select 1 from absensi where siswa_id = 1 and lampiran = 'fotoA'));
select _cek('baris yang sudah ada: scan_oleh, scanner_id, tapel, semester DIPERTAHANKAN (bukan nama pengedit)',
  exists (select 1 from absensi where siswa_id = 1 and scan_oleh = 'sistem_otomatis' and scanner_id = 'HP-A' and tapel = '2026/2027' and semester = 'ganjil'));
select _cek('rev naik setelah edit', exists (select 1 from absensi where siswa_id = 1 and rev = 2));
select _cek('tombol Pulihkan tersedia', _bisa(1, '2026-10-08'));

select _cek('Pulihkan -> ok', _pulihkan(1, '2026-10-08') = 'ok');
select _cek('data kembali PERSIS seperti sebelum edit (status, jam, keterangan, lampiran, petugas, scanner)',
  exists (select 1 from absensi where siswa_id = 1 and status = 'hadir' and jam_masuk = '07:15' and jam_pulang = '14:00'
            and keterangan is null and lampiran = 'fotoA' and scan_oleh = 'sistem_otomatis' and scanner_id = 'HP-A'
            and tapel = '2026/2027' and semester = 'ganjil'));
select _cek('Pulihkan juga menaikkan rev (edit lama jadi tidak berlaku)', exists (select 1 from absensi where siswa_id = 1 and rev = 3));
select _cek('setelah dipulihkan tombol hilang', not _bisa(1, '2026-10-08'));
select _cek('Pulihkan kedua kali ditolak (sudah_dipulihkan)', _pulihkan(1, '2026-10-08') = 'sudah_dipulihkan');
select _cek('riwayat edit menandai sudah dipulihkan + siapa',
  exists (select 1 from absensi_edit_manual where siswa_id = 1 and dipulihkan_at is not null and dipulihkan_nama = 'Imam (Admin)'));

-- ═══ 2) hadir/terlambat mempertahankan jam ═════════════════════════════════════════════════════
insert into absensi (siswa_id, tanggal, status, jam_masuk, jam_pulang, tapel, semester, scan_oleh)
values (2, '2026-10-08', 'hadir', '07:15', '14:00', '2026/2027', 'ganjil', 'sistem_otomatis');
select _cek('hadir -> terlambat berhasil', _edit(2, '2026-10-08', 'terlambat', 'Ban bocor'));
select _cek('terlambat: jam tetap dipertahankan', exists (select 1 from absensi where siswa_id = 2 and status = 'terlambat' and jam_masuk = '07:15' and jam_pulang = '14:00'));
select _cek('terlambat -> hadir berhasil', _edit(2, '2026-10-08', 'hadir', null));
select _cek('hadir: jam tetap dipertahankan', exists (select 1 from absensi where siswa_id = 2 and status = 'hadir' and jam_masuk = '07:15' and jam_pulang = '14:00'));

-- ═══ 3) Kembali ke hadir tidak membuat jam otomatis ═══════════════════════════════════════════
insert into absensi (siswa_id, tanggal, status, tapel, semester, scan_oleh) values (3, '2026-10-08', 'izin', '2026/2027', 'ganjil', 'x');
select _cek('izin -> hadir berhasil', _edit(3, '2026-10-08', 'hadir', null));
select _cek('hadir dari izin: jam tetap KOSONG (tidak dibuat otomatis)', exists (select 1 from absensi where siswa_id = 3 and status = 'hadir' and jam_masuk is null and jam_pulang is null));
insert into absensi (siswa_id, tanggal, status, keterangan, tapel, semester) values (3, '2026-10-09', 'alpha', 'Tanpa Keterangan (Sistem)', '2026/2027', 'ganjil');
select _cek('alpha -> terlambat berhasil', _edit(3, '2026-10-09', 'terlambat', null));
select _cek('alpha -> terlambat: jam tetap kosong', exists (select 1 from absensi where siswa_id = 3 and tanggal = '2026-10-09' and status = 'terlambat' and jam_masuk is null));

-- ═══ 4) Edit yang MEMBUAT baris baru -> Pulihkan menghapusnya ═════════════════════════════════
select _cek('edit pada tanggal tanpa baris membuat baris baru', _edit(4, '2026-10-08', 'hadir', null));
select _cek('baris baru: jam kosong, scan_oleh NULL (bukan hasil pemindaian), periode terisi',
  exists (select 1 from absensi where siswa_id = 4 and status = 'hadir' and jam_masuk is null and jam_pulang is null
            and scan_oleh is null and scanner_id is null and tapel = '2026/2027' and semester = 'ganjil'));
select _cek('identitas pengedit baris baru tercatat di snapshot', exists (select 1 from absensi_edit_manual where siswa_id = 4 and editor_nama = 'Imam (Admin)' and editor_id = 1));
select _cek('snapshot sebelum = NULL (baris belum ada)', exists (select 1 from absensi_edit_manual where siswa_id = 4 and sebelum is null));
select _cek('Pulihkan baris baru -> ok', _pulihkan(4, '2026-10-08') = 'ok');
select _cek('baris absensi yang dibuat edit DIHAPUS', not exists (select 1 from absensi where siswa_id = 4 and tanggal = '2026-10-08'));
select _cek('log transisi: Belum Absen -> hadir lalu hadir -> Belum Absen',
  (select count(*) = 2 from absensi_log where siswa_id = 4 and
     ((status_lama = 'Belum Absen' and status_baru = 'hadir') or (status_lama = 'hadir' and status_baru = 'Belum Absen'))));

-- ═══ 5) Setelah proses lain mengubah absensi -> pemulihan ditolak ════════════════════════════
insert into absensi (siswa_id, tanggal, status, jam_masuk, tapel, semester) values (5, '2026-10-08', 'hadir', '07:10', '2026/2027', 'ganjil');
select _cek('edit hadir -> terlambat', _edit(5, '2026-10-08', 'terlambat', 'x'));
update absensi set jam_pulang = '12:00' where siswa_id = 5 and tanggal = '2026-10-08';   -- mis. scan pulang
select _cek('tombol Pulihkan hilang setelah ada proses lain', not _bisa(5, '2026-10-08'));
select _cek('Pulihkan ditolak (sudah_berubah)', _pulihkan(5, '2026-10-08') = 'sudah_berubah');
select _cek('data hasil proses lain TIDAK ditimpa', exists (select 1 from absensi where siswa_id = 5 and status = 'terlambat' and jam_pulang = '12:00'));

-- baris dihapus lalu dibuat ulang oleh proses lain (id berbeda) -> juga ditolak
select _cek('edit membuat baris', _edit(6, '2026-10-08', 'izin', 'x'));
delete from absensi where siswa_id = 6 and tanggal = '2026-10-08';
select _cek('baris dihapus -> sudah_berubah', _pulihkan(6, '2026-10-08') = 'sudah_berubah');
select _cek('edit membuat baris lagi', _edit(6, '2026-10-09', 'izin', 'x'));
delete from absensi where siswa_id = 6 and tanggal = '2026-10-09';
insert into absensi (siswa_id, tanggal, status, jam_masuk) values (6, '2026-10-09', 'hadir', '07:00');
select _cek('baris dibuat ulang proses lain (id beda) -> sudah_berubah', _pulihkan(6, '2026-10-09') = 'sudah_berubah');
select _cek('baris proses lain tidak dihapus', exists (select 1 from absensi where siswa_id = 6 and tanggal = '2026-10-09' and status = 'hadir'));

-- ═══ 6) Masa pemulihan (bawaan 7 hari, bisa diatur) ═══════════════════════════════════════════
select _cek('kolom masa pemulihan bawaan = 7', (select masa_pulihkan_hari = 7 from absensi_setting limit 1));
insert into absensi (siswa_id, tanggal, status, jam_masuk, tapel, semester) values (7, '2026-10-08', 'hadir', '07:10', '2026/2027', 'ganjil');
select _cek('edit', _edit(7, '2026-10-08', 'sakit', 'x'));
update absensi_edit_manual set diedit_at = now() - interval '6 days 23 hours' where siswa_id = 7;
select _cek('6 hari 23 jam: masih bisa', _bisa(7, '2026-10-08'));
update absensi_edit_manual set diedit_at = now() - interval '8 days' where siswa_id = 7;
select _cek('8 hari: tombol hilang', not _bisa(7, '2026-10-08'));
select _cek('8 hari: ditolak (kedaluwarsa)', _pulihkan(7, '2026-10-08') = 'kedaluwarsa');
update absensi_setting set masa_pulihkan_hari = 10;
select _cek('masa diperpanjang jadi 10 hari: bisa lagi', _bisa(7, '2026-10-08'));
select _cek('masa 10 hari: Pulihkan ok', _pulihkan(7, '2026-10-08') = 'ok');
update absensi_setting set masa_pulihkan_hari = 7;

-- ═══ 7) Hanya edit manual TERAKHIR yang bisa dipulihkan ══════════════════════════════════════
insert into absensi (siswa_id, tanggal, status, jam_masuk, jam_pulang, tapel, semester) values (8, '2026-10-08', 'hadir', '07:10', '14:00', '2026/2027', 'ganjil');
select _cek('edit 1: hadir -> izin', _edit(8, '2026-10-08', 'izin', 'a'));
select _cek('edit 2: izin -> sakit', _edit(8, '2026-10-08', 'sakit', 'b'));
select _cek('Pulihkan edit terakhir -> ok', _pulihkan(8, '2026-10-08') = 'ok');
select _cek('kembali ke kondisi sebelum edit TERAKHIR (izin, bukan hadir)', exists (select 1 from absensi where siswa_id = 8 and status = 'izin' and keterangan = 'a'));
select _cek('edit lama (edit 1) tidak bisa ikut dipulihkan', _pulihkan(8, '2026-10-08') = 'sudah_dipulihkan');
select _cek('tombol Pulihkan tidak muncul untuk edit lama', not _bisa(8, '2026-10-08'));
select _cek('data tetap izin', exists (select 1 from absensi where siswa_id = 8 and status = 'izin'));

-- ═══ 7b) Pulihkan membawa ID edit yang DIKONFIRMASI pengguna (skenario K7, berurutan) ═══════════
-- Admin melihat tombol Pulihkan untuk E1 (kembali ke hadir). Guru menyimpan E2 (sakit -> izin).
-- Admin mengonfirmasi E1: HARUS ditolak (sudah_berubah), E2 tidak boleh dipulihkan diam-diam.
insert into absensi (siswa_id, tanggal, status, jam_masuk, tapel, semester) values (7, '2026-10-14', 'hadir', '07:10', '2026/2027', 'ganjil');
select _cek('E1: hadir -> sakit', _edit(7, '2026-10-14', 'sakit', 'e1'));
select min(id) as e1 from absensi_edit_manual where siswa_id = 7 and tanggal = '2026-10-14' \gset
select _cek('E2: sakit -> izin', _edit(7, '2026-10-14', 'izin', 'e2'));
select max(id) as e2 from absensi_edit_manual where siswa_id = 7 and tanggal = '2026-10-14' \gset
select rev as rev_k7, status as status_k7 from absensi where siswa_id = 7 and tanggal = '2026-10-14' \gset
select count(*) as log_aktivitas_k7 from log_aktivitas \gset
select count(*) as log_status_k7 from absensi_log where siswa_id = 7 \gset

select _cek('E2 adalah edit terbaru (id lebih besar dari E1)', :e2 > :e1);
select _cek('daftar_bisa_pulihkan mengembalikan o_edit_id = edit TERAKHIR (E2), bukan E1',
  (select o_edit_id from public.daftar_bisa_pulihkan('2026-10-14', array[7]::bigint[])) = :e2);

select _cek('KRITERIA UTAMA: mengonfirmasi E1 padahal edit terakhir sudah E2 -> sudah_berubah', _pulihkan_id(7, '2026-10-14', :e1) = 'sudah_berubah');
select _cek('data TIDAK berubah (status, rev) dan E2 tidak dipulihkan diam-diam',
  exists (select 1 from absensi where siswa_id = 7 and tanggal = '2026-10-14' and rev = :rev_k7 and status = :'status_k7' and status = 'izin'));
select _cek('E1 maupun E2 tidak ditandai dipulihkan', not exists (select 1 from absensi_edit_manual where siswa_id = 7 and tanggal = '2026-10-14' and dipulihkan_at is not null));
select _cek('penolakan tidak menulis log apa pun', (select count(*) from log_aktivitas) = :log_aktivitas_k7 and (select count(*) from absensi_log where siswa_id = 7) = :log_status_k7);
select _cek('tombol Pulihkan untuk E2 tetap tersedia', _bisa(7, '2026-10-14'));

select _cek('ID 0 / tidak ada -> sudah_berubah, tanpa perubahan', _pulihkan_id(7, '2026-10-14', 0) = 'sudah_berubah' and _pulihkan_id(7, '2026-10-14', 999999999) = 'sudah_berubah');
select _cek('ID edit milik SISWA LAIN -> sudah_berubah, tanpa perubahan',
  _pulihkan_id(7, '2026-10-14', (select max(id) from absensi_edit_manual where siswa_id = 8)) = 'sudah_berubah'
  and exists (select 1 from absensi where siswa_id = 7 and tanggal = '2026-10-14' and rev = :rev_k7));
select _cek('ID edit milik TANGGAL LAIN -> sudah_berubah, tanpa perubahan',
  _pulihkan_id(7, '2026-10-14', (select max(id) from absensi_edit_manual where siswa_id = 7 and tanggal = '2026-10-08')) = 'sudah_berubah');
select _cek('tanpa edit sama sekali tetap tidak_ada_edit (walau ID dikirim)', _pulihkan_id(12, '2026-10-14', :e2) = 'tidak_ada_edit');
select _cek('p_edit_id NULL ditolak dengan galat jelas, tanpa perubahan',
  _pesan($q$select * from public.pulihkan_edit_manual(7, '2026-10-14', null, 1, 'x')$q$) like '%p_edit_id wajib%'
  and exists (select 1 from absensi where siswa_id = 7 and tanggal = '2026-10-14' and rev = :rev_k7));

select _cek('mengonfirmasi E2 (edit terakhir) -> ok', _pulihkan_id(7, '2026-10-14', :e2) = 'ok');
select _cek('kembali ke kondisi sebelum E2 (sakit, bukan hadir)', exists (select 1 from absensi where siswa_id = 7 and tanggal = '2026-10-14' and status = 'sakit' and keterangan = 'e1'));
select _cek('E2 yang sama diulang -> sudah_dipulihkan', _pulihkan_id(7, '2026-10-14', :e2) = 'sudah_dipulihkan');
select _cek('E1 yang usang setelah E2 dipulihkan -> sudah_berubah (E2 masih edit terakhir)', _pulihkan_id(7, '2026-10-14', :e1) = 'sudah_berubah');
select _cek('edit baru setelah pemulihan: konfirmasi lama (E2 yang sudah dipulihkan) -> sudah_berubah, bukan sudah_dipulihkan',
  _edit(7, '2026-10-14', 'alpha', 'e3') and _pulihkan_id(7, '2026-10-14', :e2) = 'sudah_berubah');

-- ═══ 8) Tanpa edit / tanpa perubahan ═════════════════════════════════════════════════════════
select _cek('tanggal tanpa edit -> tidak_ada_edit', _pulihkan(9, '2026-10-08') = 'tidak_ada_edit');
insert into absensi (siswa_id, tanggal, status, jam_masuk, tapel, semester) values (9, '2026-10-08', 'hadir', '07:10', '2026/2027', 'ganjil');
select _cek('edit tanpa perubahan -> o_diubah = false', _edit(9, '2026-10-08', 'hadir', null) = false);
select _cek('edit tanpa perubahan tidak membuat riwayat/rev baru',
  not exists (select 1 from absensi_edit_manual where siswa_id = 9) and exists (select 1 from absensi where siswa_id = 9 and rev = 1));
select _cek('edit tanpa perubahan: o_periode_baru NULL', (select o_periode_baru is null from public.edit_manual_absensi(9, array['2026-10-08']::date[], 'hadir', null, null, 1, 'x')));

-- ═══ 9) Semantik lampiran: NULL = tetap, '' = hapus, URL = ganti ═════════════════════════════
insert into absensi (siswa_id, tanggal, status, jam_masuk, lampiran, tapel, semester) values (10, '2026-10-08', 'sakit', null, 'lama.jpg', '2026/2027', 'ganjil');
select _cek('ubah keterangan saja', _edit(10, '2026-10-08', 'sakit', 'ket baru'));
select _cek('lampiran tetap kalau tidak diminta berubah', exists (select 1 from absensi where siswa_id = 10 and lampiran = 'lama.jpg' and keterangan = 'ket baru'));
select _cek('hapus lampiran ("")', _edit(10, '2026-10-08', 'sakit', 'ket baru', ''));
select _cek('lampiran kosong ("") menghapus lampiran', exists (select 1 from absensi where siswa_id = 10 and lampiran is null));
select _cek('lampiran URL baru', _edit(10, '2026-10-08', 'sakit', 'ket baru', 'https://res.cloudinary.com/x/baru.jpg'));
select _cek('lampiran URL baru disimpan', exists (select 1 from absensi where siswa_id = 10 and lampiran like '%baru.jpg'));
select _cek('Pulihkan edit lampiran terakhir -> ok', _pulihkan(10, '2026-10-08') = 'ok');
select _cek('lampiran kembali ke kondisi sebelumnya (kosong)', exists (select 1 from absensi where siswa_id = 10 and lampiran is null and keterangan = 'ket baru'));

-- ═══ 10) Rentang tanggal: satu transaksi, tanggal ganda digabung ═════════════════════════════
select _cek('rentang 2 tanggal (+1 duplikat) -> 2 hasil',
  (select count(*) = 2 and bool_and(o_diubah) from public.edit_manual_absensi(10, array['2026-10-12', '2026-10-13', '2026-10-12']::date[], 'izin', 'Acara', null, 1, 'Imam (Admin)')));
select _cek('satu batch untuk satu submit', (select count(distinct batch_id) = 1 and count(*) = 2 from absensi_edit_manual where siswa_id = 10 and tanggal in ('2026-10-12', '2026-10-13')));
select _cek('masing-masing tanggal bisa dipulihkan sendiri', _bisa(10, '2026-10-12') and _bisa(10, '2026-10-13'));
select _cek('Pulihkan satu tanggal -> ok', _pulihkan(10, '2026-10-12') = 'ok');
select _cek('baris tanggal itu (hasil edit) terhapus', not exists (select 1 from absensi where siswa_id = 10 and tanggal = '2026-10-12'));
select _cek('tanggal lain tidak terganggu', _bisa(10, '2026-10-13') and exists (select 1 from absensi where siswa_id = 10 and tanggal = '2026-10-13' and status = 'izin'));

-- Urutan kunci baris SELALU menaik, apa pun urutan array masuk: inilah yang mencegah deadlock dua edit rentang
-- bersamaan (K5 hanya membuktikan "tidak deadlock" pada contoh kecil; urutannya sendiri dikunci di sini).
-- Array acak 40 tanggal: tanpa ORDER BY pada loop, urutan hasil (= urutan pemrosesan) tidak menaik.
select _cek('tanggal diproses MENAIK walau array masuk acak (urutan kunci konsisten, mencegah deadlock)', (
  with tgl as (select ('2026-11-01'::date + g) as d from generate_series(0, 39) g),
       acak as (select array_agg(d order by md5(d::text)) as a from tgl),
       hasil as (select array_agg(o_tanggal) as urutan from public.edit_manual_absensi(10, (select a from acak), 'izin', 'urutan', null, 1, 'Imam (Admin)'))
  select cardinality(urutan) = 40 and urutan = (select array_agg(d order by d) from tgl) from hasil));

-- ═══ 11) Input tidak valid ditolak ═══════════════════════════════════════════════════════════
select _cek('status tidak valid ditolak', _sqlstate($q$select * from public.edit_manual_absensi(1, array['2026-10-20']::date[], 'bolos', null, null, 1, 'x')$q$) is not null);
select _cek('status NULL ditolak', _sqlstate($q$select * from public.edit_manual_absensi(1, array['2026-10-20']::date[], null, null, null, 1, 'x')$q$) is not null);
select _cek('daftar tanggal kosong ditolak', _sqlstate($q$select * from public.edit_manual_absensi(1, array[]::date[], 'sakit', null, null, 1, 'x')$q$) is not null);
select _cek('siswa tidak ada ditolak', _sqlstate($q$select * from public.edit_manual_absensi(999, array['2026-10-20']::date[], 'sakit', null, null, 1, 'x')$q$) is not null);
select _cek('penolakan tidak meninggalkan baris atau riwayat', not exists (select 1 from absensi where tanggal = '2026-10-20'));

-- ═══ 12) Audit log ═══════════════════════════════════════════════════════════════════════════
select _cek('setiap edit tercatat di log_aktivitas', (select count(*) from log_aktivitas where aksi = 'edit_absensi') = (select count(*) from absensi_edit_manual));
select _cek('setiap pemulihan tercatat di log_aktivitas', (select count(*) from log_aktivitas where aksi = 'pulihkan_absensi') = (select count(*) from absensi_edit_manual where dipulihkan_at is not null));
select _cek('log edit memuat data sebelum & sesudah', exists (select 1 from log_aktivitas where aksi = 'edit_absensi' and keterangan like '%Siswa 1 %' and keterangan like '%Sebelum: Hadir · masuk 07:15 · pulang 14:00%' and keterangan like '%Sesudah: Sakit%'));
select _cek('log pemulihan memuat kondisi yang dikembalikan', exists (select 1 from log_aktivitas where aksi = 'pulihkan_absensi' and keterangan like '%Siswa 1 %' and keterangan like '%Dikembalikan ke: Hadir · masuk 07:15 · pulang 14:00%'));
select _cek('log mencatat siapa pengedit', not exists (select 1 from log_aktivitas where aksi in ('edit_absensi', 'pulihkan_absensi') and admin_id is distinct from 1));

-- ═══ 13) Periode historis per tanggal (bukan setting aktif) ═════════════════════════════════
-- Setting aktif = 2026/2027 ganjil. Semua tanggal di bawah sengaja berada di periode lain.
-- Sumber historis: baris absensi LAIN pada tanggal itu.
insert into absensi (siswa_id, tanggal, status, tapel, semester, scan_oleh) values (1, '2026-03-10', 'hadir', '2025/2026', 'genap', 'sistem_otomatis');
insert into absensi (siswa_id, tanggal, status, tapel, semester, scan_oleh) values (2, '2026-04-07', 'hadir', '2025/2026', null,    'sistem_otomatis');   -- semester kosong
insert into absensi (siswa_id, tanggal, status, tapel, semester, scan_oleh) values (2, '2026-04-08', 'hadir', '2025-2026', 'genap', 'sistem_otomatis');   -- format tapel salah

select _cek('baris BARU memakai periode dari record tanggal itu (bukan setting aktif)',
  _periode(11, '2026-03-10') = '{"tapel":"2025/2026","semester":"genap","sumber_tapel":"record","sumber_semester":"record"}'::jsonb);
select _cek('baris tersimpan dengan tapel/semester historis itu',
  exists (select 1 from absensi where siswa_id = 11 and tanggal = '2026-03-10' and tapel = '2025/2026' and semester = 'genap' and scan_oleh is null));

select _cek('baris yang SUDAH ADA: periode & scan_oleh tidak diubah, o_periode_baru NULL', (
  select o_periode_baru is null and o_diubah from public.edit_manual_absensi(1, array['2026-03-10']::date[], 'sakit', 'Demam', null, 1, 'Imam (Admin)')));
select _cek('periode lama tetap utuh setelah edit',
  exists (select 1 from absensi where siswa_id = 1 and tanggal = '2026-03-10' and status = 'sakit' and tapel = '2025/2026' and semester = 'genap' and scan_oleh = 'sistem_otomatis'));

-- Tidak ada record pada tanggal itu -> KALENDER (Jul-Des ganjil, Jan-Jun genap), bukan setting aktif
select _cek('tanpa record, Agustus -> kalender 2026/2027 ganjil',
  _periode(11, '2026-08-05') = '{"tapel":"2026/2027","semester":"ganjil","sumber_tapel":"kalender","sumber_semester":"kalender"}'::jsonb);
select _cek('tanpa record, Februari -> kalender 2025/2026 genap',
  _periode(11, '2026-02-10') = '{"tapel":"2025/2026","semester":"genap","sumber_tapel":"kalender","sumber_semester":"kalender"}'::jsonb);
select _cek('batas kalender: 30 Jun = genap tapel lama, 1 Jul = ganjil tapel baru',
  (select o_periode_baru ->> 'tapel' || ' ' || (o_periode_baru ->> 'semester') from public.edit_manual_absensi(11, array['2026-06-30']::date[], 'izin', null, null, 1, 'x')) = '2025/2026 genap'
  and (select o_periode_baru ->> 'tapel' || ' ' || (o_periode_baru ->> 'semester') from public.edit_manual_absensi(11, array['2026-07-01']::date[], 'izin', null, null, 1, 'x')) = '2026/2027 ganjil');

-- Semester: dari record bila ada, kalender HANYA fallback dan sumbernya eksplisit
select _cek('record punya tapel tetapi semester kosong -> tapel dari record, semester dari kalender',
  _periode(11, '2026-04-07') = '{"tapel":"2025/2026","semester":"genap","sumber_tapel":"record","sumber_semester":"kalender"}'::jsonb);
select _cek('record dengan format tapel salah diabaikan -> kalender',
  _periode(11, '2026-04-08') = '{"tapel":"2025/2026","semester":"genap","sumber_tapel":"kalender","sumber_semester":"kalender"}'::jsonb);

-- Semester tersimpan boleh BEDA dari kalender: record tanggal itu yang menang
insert into absensi (siswa_id, tanggal, status, tapel, semester, scan_oleh) values (2, '2026-05-14', 'hadir', '2025/2026', 'ganjil', 'sistem_otomatis');
select _cek('semester dari record menang atas kalender (Mei tersimpan "ganjil")',
  _periode(11, '2026-05-14') = '{"tapel":"2025/2026","semester":"ganjil","sumber_tapel":"record","sumber_semester":"record"}'::jsonb);

-- Beberapa record berbeda pada satu tanggal: yang terbanyak menang; seri -> tapel terbaru
insert into absensi (siswa_id, tanggal, status, tapel, semester) values
  (3, '2026-05-12', 'hadir', '2025/2026', 'genap'), (4, '2026-05-12', 'hadir', '2025/2026', 'genap'), (5, '2026-05-12', 'hadir', '2026/2027', 'ganjil');
select _cek('periode terbanyak pada tanggal itu menang', _periode(11, '2026-05-12') ->> 'tapel' = '2025/2026');
insert into absensi (siswa_id, tanggal, status, tapel, semester) values
  (3, '2026-05-13', 'hadir', '2025/2026', 'genap'), (4, '2026-05-13', 'hadir', '2026/2027', 'ganjil');
select _cek('seri -> tapel terbaru', _periode(11, '2026-05-13') ->> 'tapel' = '2026/2027');

-- Setting aktif tidak berpengaruh sama sekali
update absensi_setting set tapel = '2099/2100', semester = 'genap';
select _cek('mengubah setting aktif tidak mengubah hasil periode historis',
  _periode(11, '2026-08-20') = '{"tapel":"2026/2027","semester":"ganjil","sumber_tapel":"kalender","sumber_semester":"kalender"}'::jsonb);
update absensi_setting set tapel = '2026/2027', semester = 'ganjil';

-- Rentang yang melintasi pergantian semester/tapel, satu panggilan
select _cek('rentang 29 Jun - 2 Jul: 4 baris baru dalam satu transaksi', (select count(*) = 4 and bool_and(o_diubah) from public.edit_manual_absensi(11, array['2026-06-29','2026-06-30','2026-07-01','2026-07-02']::date[] , 'sakit', 'Rawat', null, 1, 'Imam (Admin)')));
select _cek('Juni -> 2025/2026 genap, Juli -> 2026/2027 ganjil (per tanggal)',
  (select count(*) filter (where tanggal <= '2026-06-30' and tapel = '2025/2026' and semester = 'genap') = 2
      and count(*) filter (where tanggal >= '2026-07-01' and tapel = '2026/2027' and semester = 'ganjil') = 2
   from absensi where siswa_id = 11 and tanggal between '2026-06-29' and '2026-07-02'));
select _cek('catatan periode ikut ke log aktivitas', exists (select 1 from log_aktivitas where aksi = 'edit_absensi' and target = 'Siswa 11' and keterangan like '%Baris baru dibuat dengan periode 2026/2027 ganjil (tapel dari kalender; semester dari kalender)%'));

-- ═══ 14) riwayat_kelas: baris baru hanya dibuat kalau siswa punya riwayat pada tapel itu ═══════
-- Siswa 12 hanya punya 2026/2027. 12 Maret 2026 -> kalender 2025/2026 -> tidak ada riwayat -> EM001.
select _cek('tanpa riwayat_kelas pada tapel hasil penentuan -> SQLSTATE EM001',
  _sqlstate($q$select * from public.edit_manual_absensi(12, array['2026-03-12']::date[], 'izin', null, null, 1, 'x')$q$) = 'EM001');
select _cek('pesan galat menjelaskan siswa, tapel, tanggal, dan asal periode', (
  select m like '%Siswa 12%' and m like '%tapel 2025/2026%' and m like '%12-03-2026%' and m like '%dari kalender%' and m like '%Tidak ada perubahan yang disimpan%'
  from (select _pesan($q$select * from public.edit_manual_absensi(12, array['2026-03-12']::date[], 'izin', null, null, 1, 'x')$q$) as m) s));
select _cek('galat EM001 memberi hint tindakan', _hint($q$select * from public.edit_manual_absensi(12, array['2026-03-12']::date[], 'izin', null, null, 1, 'x')$q$) like '%riwayat kelas%');
select _cek('penolakan tidak meninggalkan baris, snapshot, atau log',
  not exists (select 1 from absensi where siswa_id = 12) and not exists (select 1 from absensi_edit_manual where siswa_id = 12) and not exists (select 1 from log_aktivitas where target = 'Siswa 12'));

-- Sumber 'record' pun tetap dicek: 10 Maret tercatat 2025/2026, siswa 12 tidak punya riwayat itu
select _cek('periode dari record yang tidak punya riwayat siswa -> EM001 juga',
  _pesan($q$select * from public.edit_manual_absensi(12, array['2026-03-10']::date[], 'izin', null, null, 1, 'x')$q$) like '%dari data absensi lain pada tanggal itu%');

-- Semua-atau-tidak-sama-sekali: tanggal pertama sah, kedua ditolak -> tidak ada yang tersimpan
select _cek('rentang dengan satu tanggal ditolak EM001',
  _sqlstate($q$select * from public.edit_manual_absensi(12, array['2026-07-06','2026-03-12']::date[], 'izin', null, null, 1, 'x')$q$) = 'EM001');
select _cek('atomik: tanggal yang sah (6 Jul) TIDAK ikut tersimpan', not exists (select 1 from absensi where siswa_id = 12));
select _cek('atomik: tidak ada log atau riwayat edit tersisa', not exists (select 1 from log_aktivitas where target = 'Siswa 12') and not exists (select 1 from absensi_edit_manual where siswa_id = 12));
select _cek('siswa dengan riwayat pada tapel itu (juga 6 Jul) tetap bisa diedit', _edit(12, '2026-07-06', 'izin', 'Acara'));

select _cek('siswa tanpa riwayat kelas sama sekali -> EM001',
  _sqlstate($q$select * from public.edit_manual_absensi(13, array['2026-07-06']::date[], 'izin', null, null, 1, 'x')$q$) = 'EM001');

-- Pemeriksaan hanya untuk baris BARU: baris yang sudah ada tetap bisa diedit
insert into absensi (siswa_id, tanggal, status, tapel, semester, scan_oleh) values (13, '2026-07-07', 'hadir', '2026/2027', 'ganjil', 'sistem_otomatis');
select _cek('baris yang SUDAH ADA tetap bisa diedit walau siswa tanpa riwayat_kelas', _edit(13, '2026-07-07', 'sakit', 'x'));
select _cek('...dan periodenya tidak berubah', exists (select 1 from absensi where siswa_id = 13 and tanggal = '2026-07-07' and tapel = '2026/2027' and semester = 'ganjil' and scan_oleh = 'sistem_otomatis'));

-- ═══ 15) Tidak ada notifikasi WhatsApp dari database ═════════════════════════════════════════
select _cek('wa_log tetap kosong setelah semua edit & pemulihan', (select count(*) = 0 from wa_log));
select _cek('fungsi edit/pulihkan tidak menyentuh tabel/fungsi WhatsApp',
  not exists (select 1 from pg_proc where proname in ('edit_manual_absensi', 'pulihkan_edit_manual', 'daftar_bisa_pulihkan', 'absensi_periode_tanggal') and prosrc ~* '(wa_log|whatsapp|notif)'));

reset role;

-- ═══ 16) Hak akses per peran (anon / authenticated ditolak, service_role cukup) ═══════════════
-- 16a) Katalog: EXECUTE hanya untuk pemilik dan service_role (daftar-izin, bukan daftar-larangan).
-- Catatan: fungsi dengan proacl NULL = hak bawaan (EXECUTE terbuka untuk PUBLIC); aclexplode(NULL) tidak
-- menghasilkan baris, jadi harus diganti acldefault() agar tidak lolos begitu saja.
create or replace function _penerima_execute(p_fungsi regprocedure) returns setof oid language sql stable as $$
  select a.grantee
    from pg_proc p, lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   where p.oid = p_fungsi and a.privilege_type = 'EXECUTE';
$$;
-- Penerima yang TIDAK diizinkan (0 = PUBLIC). p_boleh_service = apakah service_role termasuk yang diizinkan.
create or replace function _penerima_terlarang(p_fungsi regprocedure, p_boleh_service boolean) returns text language sql stable as $$
  select string_agg(case when g = 0 then 'PUBLIC' else g::regrole::text end, ', ')
    from _penerima_execute(p_fungsi) g
   where g <> (select proowner from pg_proc where oid = p_fungsi)
     and not (p_boleh_service and g = 'service_role'::regrole::oid);
$$;

-- Kontrol negatif: pemeriksaan di atas HARUS bisa gagal.
--  (1) fungsi di schema public memakai default privileges (anon/authenticated/service_role) -> harus terdeteksi
--  (2) fungsi di schema TANPA default privileges: proacl NULL (PUBLIC EXECUTE) -> harus terdeteksi
create function public._kontrol_default_privileges() returns int language sql as 'select 1';
create schema _kontrol_tanpa_default;
create function _kontrol_tanpa_default._kontrol_acl_null() returns int language sql as 'select 1';
select _cek('kontrol negatif: fungsi yang tidak dicabut (hak bawaan) terdeteksi terbuka',
  _penerima_terlarang('public._kontrol_default_privileges()'::regprocedure, true) is not null);
select _cek('kontrol negatif: proacl NULL (PUBLIC EXECUTE) terdeteksi, tidak lolos diam-diam',
  (select proacl is null from pg_proc where oid = '_kontrol_tanpa_default._kontrol_acl_null()'::regprocedure)
  and _penerima_terlarang('_kontrol_tanpa_default._kontrol_acl_null()'::regprocedure, true) = 'PUBLIC');
drop function public._kontrol_default_privileges();
drop schema _kontrol_tanpa_default cascade;

select _cek('katalog: 6 fungsi 019 hanya boleh dieksekusi pemilik + service_role (tidak ada PUBLIC/anon/authenticated/lainnya)',
  _penerima_terlarang('public.edit_manual_absensi(bigint,date[],text,text,text,bigint,text)'::regprocedure, true) is null
  and _penerima_terlarang('public.pulihkan_edit_manual(bigint,date,bigint,bigint,text)'::regprocedure, true) is null
  and _penerima_terlarang('public.daftar_bisa_pulihkan(date,bigint[])'::regprocedure, true) is null
  and _penerima_terlarang('public.absensi_snapshot(public.absensi)'::regprocedure, true) is null
  and _penerima_terlarang('public.absensi_ringkas(jsonb)'::regprocedure, true) is null
  and _penerima_terlarang('public.absensi_periode_tanggal(date)'::regprocedure, true) is null);
-- Migrasi mencabut fungsi trigger dari PUBLIC/anon/authenticated. service_role boleh tetap memegang hak bawaan
-- (peran tepercaya, tidak berbahaya); trigger berjalan terlepas dari hak EXECUTE (diuji di 16e).
select _cek('katalog: fungsi trigger absensi_naikkan_rev tidak terbuka bagi PUBLIC/anon/authenticated',
  _penerima_terlarang('public.absensi_naikkan_rev()'::regprocedure, true) is null);
select _cek('katalog: service_role punya EXECUTE pada 3 RPC dan 3 helper (RPC tidak gagal)',
  has_function_privilege('service_role', 'public.edit_manual_absensi(bigint,date[],text,text,text,bigint,text)', 'execute')
  and has_function_privilege('service_role', 'public.pulihkan_edit_manual(bigint,date,bigint,bigint,text)', 'execute')
  and has_function_privilege('service_role', 'public.daftar_bisa_pulihkan(date,bigint[])', 'execute')
  and has_function_privilege('service_role', 'public.absensi_snapshot(public.absensi)', 'execute')
  and has_function_privilege('service_role', 'public.absensi_ringkas(jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.absensi_periode_tanggal(date)', 'execute'));

-- 16b) Tabel snapshot: hak service_role persis select/insert/update
select _cek('tabel snapshot: service_role hanya INSERT, SELECT, UPDATE; anon/authenticated/PUBLIC tidak ada',
  (select string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants where table_schema = 'public' and table_name = 'absensi_edit_manual' and grantee = 'service_role') = 'INSERT,SELECT,UPDATE'
  and not exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name = 'absensi_edit_manual' and grantee in ('anon', 'authenticated', 'PUBLIC')));

-- 16c) Panggilan nyata sebagai anon
set role anon;
select _cek('anon: RPC edit ditolak (42501)', _sqlstate($q$select * from public.edit_manual_absensi(1, array['2026-10-08']::date[], 'izin', null, null, 1, 'x')$q$) = '42501');
select _cek('anon: RPC pulihkan ditolak (42501)', _sqlstate($q$select * from public.pulihkan_edit_manual(1, '2026-10-08', 1, 1, 'x')$q$) = '42501');
select _cek('anon: daftar_bisa_pulihkan ditolak (42501)', _sqlstate($q$select * from public.daftar_bisa_pulihkan('2026-10-08', array[1]::bigint[])$q$) = '42501');
select _cek('anon: helper absensi_snapshot ditolak (42501)', _sqlstate($q$select public.absensi_snapshot(a) from public.absensi a limit 1$q$) = '42501');
select _cek('anon: helper absensi_ringkas ditolak (42501)', _sqlstate($q$select public.absensi_ringkas('{}'::jsonb)$q$) = '42501');
select _cek('anon: helper absensi_periode_tanggal ditolak (42501)', _sqlstate($q$select * from public.absensi_periode_tanggal('2026-10-08')$q$) = '42501');
select _cek('anon: tabel snapshot tidak bisa dibaca/ditulis (42501)',
  _sqlstate($q$select * from public.absensi_edit_manual$q$) = '42501' and _sqlstate($q$insert into public.absensi_edit_manual (siswa_id, tanggal, sesudah, absensi_id, rev_sesudah) values (1, '2026-10-08', '{}', 1, 1)$q$) = '42501');
reset role;

-- 16d) Panggilan nyata sebagai authenticated
set role authenticated;
select _cek('authenticated: RPC edit/pulihkan/daftar ditolak (42501)',
  _sqlstate($q$select * from public.edit_manual_absensi(1, array['2026-10-08']::date[], 'izin', null, null, 1, 'x')$q$) = '42501'
  and _sqlstate($q$select * from public.pulihkan_edit_manual(1, '2026-10-08', 1, 1, 'x')$q$) = '42501'
  and _sqlstate($q$select * from public.daftar_bisa_pulihkan('2026-10-08', array[1]::bigint[])$q$) = '42501');
select _cek('authenticated: ketiga helper ditolak (42501)',
  _sqlstate($q$select public.absensi_snapshot(a) from public.absensi a limit 1$q$) = '42501'
  and _sqlstate($q$select public.absensi_ringkas('{}'::jsonb)$q$) = '42501'
  and _sqlstate($q$select * from public.absensi_periode_tanggal('2026-10-08')$q$) = '42501');
select _cek('authenticated: tabel snapshot ditolak (42501)', _sqlstate($q$select * from public.absensi_edit_manual$q$) = '42501');
reset role;

-- 16e) service_role: semua yang diperlukan berjalan; yang tidak diperlukan ditolak
set role service_role;
select _cek('service_role: RPC utama berjalan (memakai helper di dalamnya)', _edit(9, '2026-10-08', 'sakit', 'uji hak') and _pulihkan(9, '2026-10-08') = 'ok');
select _cek('service_role: helper bisa dipanggil langsung', public.absensi_ringkas('{"status":"hadir"}'::jsonb) = 'Hadir' and (select o_tapel = '2026/2027' from public.absensi_periode_tanggal('2026-10-08')));
select _cek('service_role: DELETE dan TRUNCATE tabel snapshot tidak diberikan (42501)',
  _sqlstate($q$delete from public.absensi_edit_manual where false$q$) = '42501' and _sqlstate($q$truncate public.absensi_edit_manual$q$) = '42501');
select rev as rev_sebelum from absensi where siswa_id = 9 and tanggal = '2026-10-08' \gset
update absensi set jam_pulang = '15:00' where siswa_id = 9 and tanggal = '2026-10-08';
select _cek('service_role: trigger rev tetap berjalan walau EXECUTE fungsi trigger dicabut',
  (select rev from absensi where siswa_id = 9 and tanggal = '2026-10-08') = :rev_sebelum + 1);
reset role;

-- 16f) Tabel lain dan default privileges tidak tersentuh
select _cek('migrasi tidak mengubah default privileges', (select count(*) from _defacl_awal) = (select count(*) from pg_default_acl)
  and not exists (select r, n, defaclobjtype, a from (select defaclrole::regrole::text as r, defaclnamespace::regnamespace::text as n, defaclobjtype, defaclacl::text as a from pg_default_acl) x
                  except select r, n, defaclobjtype, a from _defacl_awal));
select _cek('hak tabel lain tidak dicabut (service_role masih penuh pada absensi)', has_table_privilege('service_role', 'public.absensi', 'delete') and has_table_privilege('service_role', 'public.absensi', 'update'));

-- Hapus siswa oleh service_role meng-cascade snapshot walau tidak punya hak DELETE pada tabel snapshot
set role service_role;
select count(*) as snapshot_siswa_11_sebelum from absensi_edit_manual where siswa_id = 11 \gset
select _cek('ada snapshot milik siswa 11', :snapshot_siswa_11_sebelum > 0);
delete from students where id = 11;
select _cek('hapus siswa meng-cascade snapshot-nya', not exists (select 1 from absensi_edit_manual where siswa_id = 11));
reset role;

-- ═══ 17) Bentuk objek ═════════════════════════════════════════════════════════════════════════
select _cek('hanya satu edit_manual_absensi dan bersignature 7 argumen (tanpa p_tapel/p_semester)',
  (select count(*) = 1 and bool_and(pronargs = 7) and bool_and(pg_get_function_arguments(oid) not like '%p_tapel%' and pg_get_function_arguments(oid) not like '%p_semester%')
     from pg_proc where proname = 'edit_manual_absensi' and pronamespace = 'public'::regnamespace));
select _cek('hanya satu pulihkan_edit_manual, 5 argumen, memuat p_edit_id (versi 4 argumen tanpa ID sudah dibuang)',
  (select count(*) = 1 and bool_and(pronargs = 5) and bool_and(pg_get_function_arguments(oid) like '%p_edit_id%')
     from pg_proc where proname = 'pulihkan_edit_manual' and pronamespace = 'public'::regnamespace));
select _cek('tabel snapshot memakai RLS', (select relrowsecurity from pg_class where oid = 'public.absensi_edit_manual'::regclass));

\echo SEMUA UJI LULUS
