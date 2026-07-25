-- =====================================================================
-- Migrasi untuk 7 poin pengembangan SI-ABSEN.
-- Jalankan file ini SEKALI lewat Supabase SQL Editor (Project > SQL Editor).
-- Aman dijalankan berkali-kali (pakai IF NOT EXISTS / ON CONFLICT).
-- =====================================================================

-- 1) DATA MASTER KELAS
--    Supaya nama kelas konsisten (nggak ada lagi typo "Kelas Kelas 3" dsb).
create table if not exists kelas_master (
  id serial primary key,
  nama text unique not null,
  urutan int not null default 0,
  created_at timestamptz not null default now()
);

-- Isi otomatis dari kelas yang sudah kepakai di data siswa & wali kelas saat ini,
-- supaya nggak ada data lama yang "hilang" dari daftar.
insert into kelas_master (nama)
select distinct class from students where class is not null and class <> ''
on conflict (nama) do nothing;

insert into kelas_master (nama)
select distinct class from guru_mengajar_kelas where class is not null and class <> ''
on conflict (nama) do nothing;

-- 2) WAJIB GANTI PASSWORD SAAT LOGIN PERTAMA
alter table users add column if not exists must_change_password boolean not null default false;

-- 3) NOMOR HP ORANG TUA/WALI (untuk notifikasi WhatsApp)
alter table students add column if not exists no_hp_ortu text;

-- 4) LOG AKTIVITAS UMUM (di luar log ubah status absensi yang sudah ada di
--    tabel absensi_log) -- dipakai buat catat tambah/edit/hapus pengguna, dll.
create table if not exists log_aktivitas (
  id serial primary key,
  admin_id integer references users(id) on delete set null,
  aksi text not null,          -- contoh: 'tambah_user', 'edit_user', 'hapus_user', 'import_siswa'
  target text,                 -- deskripsi singkat objek yang diubah, misal nama pengguna/siswa
  keterangan text,
  created_at timestamptz not null default now()
);

create index if not exists idx_log_aktivitas_created_at on log_aktivitas (created_at desc);

-- 5) PENGATURAN NOTIFIKASI WHATSAPP
--    Disimpan di tabel settings yang sudah ada (key/value), tidak perlu kolom baru.
--    Key yang dipakai aplikasi: 'wa_enabled', 'wa_gateway_url', 'wa_api_key', 'wa_sender'
insert into settings (key, value) values ('wa_enabled', 'false') on conflict (key) do nothing;
