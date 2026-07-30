-- 005_soft_delete_siswa.sql
-- Soft-delete untuk siswa: hapus dari pemakaian sehari-hari TANPA menghapus
-- riwayat absensinya. "Hapus" yang lama (hard delete, cascading ke absensi,
-- absensi_log, absensi_qr_token) tetap ada, tapi sekarang cuma boleh dipakai
-- untuk siswa yang statusnya sudah non-aktif (lihat halaman "Siswa Nonaktif").
--
-- Aman dijalankan ulang (idempotent) — semua pakai IF NOT EXISTS / cek dulu.

alter table students add column if not exists status text not null default 'aktif';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'students_status_check'
  ) then
    alter table students
      add constraint students_status_check check (status in ('aktif', 'lulus', 'pindah'));
  end if;
end $$;

create index if not exists idx_students_status on students (status);

-- NISN: kalau ada unique constraint lama di kolom ini, drop dulu (nama
-- constraint-nya bisa beda-beda tergantung kapan tabel awal dibuat, jadi
-- dicari otomatis lewat information_schema, bukan di-hardcode).
do $$
declare
  nama_constraint text;
begin
  select tc.constraint_name into nama_constraint
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name = tc.constraint_name
   and kcu.table_schema = tc.table_schema
  where tc.table_schema = 'public'
    and tc.table_name = 'students'
    and tc.constraint_type = 'UNIQUE'
    and kcu.column_name = 'nisn'
  group by tc.constraint_name
  having count(*) = 1
  limit 1;

  if nama_constraint is not null then
    execute format('alter table students drop constraint %I', nama_constraint);
  end if;
end $$;

drop index if exists students_nisn_key;
drop index if exists idx_students_nisn;

-- Ganti jadi partial unique: NISN cuma wajib unik di antara siswa yang masih
-- aktif. Siswa yang sudah lulus/pindah boleh "melepas" NISN-nya supaya bisa
-- dipakai siswa baru tanpa bentrok, tapi baris lamanya (dan riwayat
-- absensinya) tetap tersimpan.
create unique index if not exists idx_students_nisn_aktif
  on students (nisn)
  where status = 'aktif' and nisn is not null;
