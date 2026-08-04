-- =====================================================================
-- Akun Developer (super admin tersembunyi)
-- Role tetap 'admin' (jadi otomatis akses penuh: scan, kelola siswa,
-- log aktivitas, dll) tapi sengaja di-exclude dari query getUsersList()
-- (lihat src/lib/data/users.ts) sehingga TIDAK muncul di halaman
-- Manajemen Pengguna, dan API edit/hapus user memblokir akun ini juga
-- (lihat src/lib/auth/developer.ts).
--
-- Login: imamjauhari85@gmail.com / 12345
-- Password di-hash pakai bcrypt (cost 10) — SAMA persis dengan cara
-- password user lain disimpan, jadi login lewat form biasa di /login.
--
-- Aman dijalankan berkali-kali: kalau username sudah ada, cuma di-update
-- (password/role di-reset ke default), nggak bikin baris dobel.
-- =====================================================================

insert into users (username, password, name, role, must_change_password, failed_attempts, locked_until)
values (
  'imamjauhari85@gmail.com',
  '$2b$10$JMatH2/hY7Fhtb9eLy7D2.O7IGJOhMxdKb59LXd4dJ5kfT.8LYjT2', -- hash dari "12345"
  'Developer',
  'admin',
  false,
  0,
  null
)
on conflict (username) do update set
  password = excluded.password,
  name = excluded.name,
  role = excluded.role,
  must_change_password = excluded.must_change_password,
  failed_attempts = 0,
  locked_until = null;
