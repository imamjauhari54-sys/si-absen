-- Jalankan di Supabase SQL Editor
-- NIP (Nomor Induk Pegawai) pengguna, diisi sendiri lewat modal "Edit Profil Lengkap".
alter table users
  add column if not exists nip text;
