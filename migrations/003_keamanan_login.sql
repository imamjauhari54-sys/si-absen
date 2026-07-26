-- =====================================================================
-- 003_keamanan_login.sql
-- Rate limiting percobaan login (anti brute-force).
-- Aman dijalankan berkali-kali (ADD COLUMN IF NOT EXISTS).
-- =====================================================================

alter table users add column if not exists failed_attempts integer not null default 0;
alter table users add column if not exists locked_until timestamptz;

comment on column users.failed_attempts is 'Jumlah percobaan login gagal berturut-turut sejak reset terakhir.';
comment on column users.locked_until is 'Akun terkunci sementara sampai waktu ini kalau failed_attempts melewati batas.';
