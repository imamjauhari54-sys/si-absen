-- =====================================================================
-- SI-ABSEN — Schema Supabase (Postgres) + Data Sample
-- Cakupan: Step 1-3 (Setup, Dashboard, Data Siswa) + kolom future-proof
-- (jam_pulang) yang sudah kelihatan dipakai di history_siswa.php.
--
-- Cara pakai: copy-paste seluruh file ini ke Supabase Dashboard >
-- SQL Editor > New query > Run. Aman dijalankan berkali-kali (semua
-- CREATE TABLE pakai IF NOT EXISTS, semua INSERT pakai ON CONFLICT).
-- =====================================================================


-- =====================================================================
-- 1. USERS — akun login admin & guru
-- =====================================================================
create table if not exists users (
  id         bigint generated always as identity primary key,
  username   text not null unique,
  password   text not null,                    -- hash bcrypt
  name       text not null,
  role       text not null check (role in ('admin', 'guru')),
  foto       text                               -- URL Cloudinary, boleh kosong
);


-- =====================================================================
-- 2. STUDENTS — data siswa
-- =====================================================================
create table if not exists students (
  id             bigint generated always as identity primary key,
  name           text not null,
  class          text not null,
  foto           text,                          -- URL Cloudinary, boleh kosong
  nisn           text unique,                    -- NULL boleh lebih dari satu, tapi kalau diisi harus unik
  jenis_kelamin  text check (jenis_kelamin in ('L', 'P'))
);

create index if not exists idx_students_class on students (class);


-- =====================================================================
-- 3. GURU_MENGAJAR_KELAS — mapping guru -> kelas yang diampu
-- =====================================================================
create table if not exists guru_mengajar_kelas (
  id       bigint generated always as identity primary key,
  guru_id  bigint not null references users (id) on delete cascade,
  class    text not null,
  mapel    text not null,                       -- 'Guru Kelas' = wali kelas (dipakai utk cek login)
  unique (guru_id, class, mapel)
);


-- =====================================================================
-- 4. ABSENSI_SETTING — pengaturan jam & tahun ajaran (single-row config)
-- =====================================================================
create table if not exists absensi_setting (
  id                 bigint generated always as identity primary key,
  jam_masuk          time not null default '07:00:00',
  batas_terlambat    time not null default '07:15:00',
  jam_pulang_mulai   time not null default '11:30:00',
  tapel              text not null default '2025/2026',
  semester           text not null default 'genap'
);


-- =====================================================================
-- 5. ABSENSI — data kehadiran harian
-- =====================================================================
create table if not exists absensi (
  id           bigint generated always as identity primary key,
  siswa_id     bigint not null references students (id) on delete cascade,
  tanggal      date not null,
  status       text not null check (status in ('hadir', 'terlambat', 'izin', 'sakit', 'alpha')),
  jam_masuk    time,
  jam_pulang   time,                             -- dipakai di history_siswa.php (step lanjutan)
  keterangan   text,
  tapel        text,
  semester     text,
  scan_oleh    text,                             -- 'sistem_otomatis' (scan QR), 'manual_scanner', atau nama guru (edit manual)
  scanner_id   text,                             -- device fingerprint scanner yang memproses (fitur Scan QR)
  created_at   timestamptz not null default now(),
  unique (siswa_id, tanggal)                     -- 1 siswa cuma boleh 1 record per hari
);

create index if not exists idx_absensi_tanggal on absensi (tanggal);
create index if not exists idx_absensi_siswa on absensi (siswa_id);
create index if not exists idx_absensi_created_at on absensi (created_at desc);

-- Migration guard buat yang sudah pernah jalanin versi skrip sebelumnya.
alter table absensi add column if not exists scanner_id text;


-- =====================================================================
-- 6. ABSENSI_LOG — audit trail perubahan status absensi
-- =====================================================================
create table if not exists absensi_log (
  id            bigint generated always as identity primary key,
  admin_id      bigint references users (id) on delete set null,
  siswa_id      bigint references students (id) on delete set null,
  tanggal_absen date,                             -- tanggal absensi yang diedit (bukan waktu edit)
  status_lama   text,
  status_baru   text,
  keterangan    text,
  scanner_id    text,                             -- device fingerprint scanner (fitur Scan QR), NULL kalau dari edit manual di Rekap
  created_at    timestamptz not null default now()
);

create index if not exists idx_absensi_log_created_at on absensi_log (created_at desc);

-- Migration guard: kalau tabel ini dibuat dari versi skrip sebelumnya
-- (sebelum kolom tanggal_absen/scanner_id ditambahkan), kolom-kolom ini
-- akan ditambahkan di sini tanpa mengubah data yang sudah ada.
alter table absensi_log add column if not exists tanggal_absen date;
alter table absensi_log add column if not exists scanner_id text;


-- =====================================================================
-- 6b. ABSENSI_SCANNER — tracking perangkat scanner QR (multi-scanner)
-- =====================================================================
create table if not exists absensi_scanner (
  scanner_id           text primary key,          -- md5(user-agent + ip), di-generate otomatis oleh browser scanner
  device_name          text,
  ip_address           text,
  status               text not null default 'active',
  total_scans          integer not null default 0,
  offline_queue_count  integer not null default 0,
  last_sync            timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);


-- =====================================================================
-- 7. ABSENSI_QR_TOKEN — token QR per siswa (1 siswa = 1 token aktif)
-- =====================================================================
create table if not exists absensi_qr_token (
  siswa_id  bigint primary key references students (id) on delete cascade,
  token     text not null unique
);


-- =====================================================================
-- 8. HARI_LIBUR — kalender libur sekolah
-- =====================================================================
create table if not exists hari_libur (
  id          bigint generated always as identity primary key,
  tanggal     date not null unique,
  keterangan  text not null
);


-- =====================================================================
-- 9. SETTINGS — key-value pengaturan umum sekolah
-- =====================================================================
create table if not exists settings (
  key    text primary key,
  value  text
);


-- =====================================================================
-- SEED DATA
-- =====================================================================

-- --- 9.1 Settings umum sekolah -----------------------------------------
insert into settings (key, value) values
  ('nama_sekolah',   'UPTD SDN Tamansareh 2'),
  ('alamat_sekolah', 'Sampang, Jawa Timur')
on conflict (key) do update set value = excluded.value;

-- --- 9.2 Pengaturan jam & tahun ajaran ----------------------------------
insert into absensi_setting (jam_masuk, batas_terlambat, jam_pulang_mulai, tapel, semester)
select '07:00:00', '07:15:00', '11:30:00', '2025/2026', 'genap'
where not exists (select 1 from absensi_setting);

-- --- 9.3 Akun login -------------------------------------------------------
-- admin / admin123
-- guru5 / guru123
insert into users (username, password, name, role, foto) values
  ('admin', '$2b$10$Zt9Ah5pCCfSC2NlnhUTqXuNxrBwhzPV7udUTQ8wMLPQdK/vCGQe26', 'Imam (Admin)', 'admin', null),
  ('guru5', '$2b$10$M3JcDkviPx9toHwSELFIie6FMbe7yhBwa2N/uqB1fzv7LduwCyDMC', 'Bu Sri Wahyuni, S.Pd', 'guru', null)
on conflict (username) do nothing;

-- --- 9.4 Guru kelas 5 sebagai wali kelas ---------------------------------
insert into guru_mengajar_kelas (guru_id, class, mapel)
select id, '5', 'Guru Kelas' from users where username = 'guru5'
on conflict (guru_id, class, mapel) do nothing;

-- --- 9.5 Data siswa (4 siswa kelas 5, 2 siswa kelas 6) -------------------
insert into students (name, class, foto, nisn, jenis_kelamin) values
  ('Ahmad Fauzi Rahman',   '5', null, '0091234501', 'L'),
  ('Siti Nurhaliza',       '5', null, '0091234502', 'P'),
  ('Budi Santoso',         '5', null, '0091234503', 'L'),
  ('Dewi Lestari',         '5', null, '0091234504', 'P'),
  ('Rian Pratama',         '6', null, '0091234505', 'L'),
  ('Nadia Putri Anggraini','6', null, '0091234506', 'P')
on conflict (nisn) do nothing;

-- --- 9.6 Token QR sample (biasanya di-generate otomatis oleh aplikasi) ---
insert into absensi_qr_token (siswa_id, token)
select id, encode(sha256((id::text || name || 'SIELISA_ABSEN_2025')::bytea), 'hex')
from students
on conflict (siswa_id) do nothing;

-- --- 9.7 Data absensi 6 hari terakhir (relatif ke tanggal hari ini) ------
-- Skenario: Ahmad Fauzi rajin (hadir/terlambat), Siti Nurhaliza alpha
-- berturut-turut (buat trigger alert "Alpha Berturut-turut" di dashboard),
-- Budi izin, Dewi sakit, Rian (kelas 6) hadir, Nadia (kelas 6) sengaja
-- belum ada record hari ini (buat trigger kartu "Perlu Perhatian").

-- Ahmad Fauzi: hadir/terlambat 6 hari terakhir
insert into absensi (siswa_id, tanggal, status, jam_masuk, tapel, semester, scan_oleh)
select s.id, d.tgl, d.status, d.jam, '2025/2026', 'genap', 'sistem'
from students s
join (values
  (current_date,     'hadir',     '06:55:00'::time),
  (current_date - 1, 'terlambat', '07:20:00'::time),
  (current_date - 2, 'hadir',     '06:50:00'::time),
  (current_date - 3, 'hadir',     '06:58:00'::time),
  (current_date - 4, 'terlambat', '07:18:00'::time),
  (current_date - 5, 'hadir',     '06:52:00'::time)
) as d(tgl, status, jam) on true
where s.name = 'Ahmad Fauzi Rahman'
on conflict (siswa_id, tanggal) do nothing;

-- Siti Nurhaliza: alpha 5 hari terakhir berturut-turut (>= 3 hari => alert nyala)
insert into absensi (siswa_id, tanggal, status, keterangan, tapel, semester, scan_oleh)
select s.id, d.tgl, 'alpha', 'Tanpa Keterangan (Sistem)', '2025/2026', 'genap', 'sistem'
from students s
join (values
  (current_date - 1),
  (current_date - 2),
  (current_date - 3),
  (current_date - 4),
  (current_date - 5)
) as d(tgl) on true
where s.name = 'Siti Nurhaliza'
on conflict (siswa_id, tanggal) do nothing;

-- Budi Santoso: izin hari ini
insert into absensi (siswa_id, tanggal, status, keterangan, tapel, semester, scan_oleh)
select id, current_date, 'izin', 'Acara keluarga', '2025/2026', 'genap', 'guru5'
from students where name = 'Budi Santoso'
on conflict (siswa_id, tanggal) do nothing;

-- Dewi Lestari: sakit hari ini
insert into absensi (siswa_id, tanggal, status, keterangan, tapel, semester, scan_oleh)
select id, current_date, 'sakit', 'Demam', '2025/2026', 'genap', 'guru5'
from students where name = 'Dewi Lestari'
on conflict (siswa_id, tanggal) do nothing;

-- Rian Pratama (kelas 6): hadir hari ini
insert into absensi (siswa_id, tanggal, status, jam_masuk, tapel, semester, scan_oleh)
select id, current_date, 'hadir', '06:49:00', '2025/2026', 'genap', 'sistem'
from students where name = 'Rian Pratama'
on conflict (siswa_id, tanggal) do nothing;

-- Nadia Putri Anggraini (kelas 6): sengaja TIDAK diberi record hari ini
-- (biar muncul di kartu "Perlu Perhatian" / belum absen)

-- --- 9.8 Hari libur sample (10 hari ke depan, buat contoh) ---------------
insert into hari_libur (tanggal, keterangan) values
  (current_date + 10, 'Libur Semester')
on conflict (tanggal) do nothing;

-- --- 9.9 Log aktivitas sample ---------------------------------------------
insert into absensi_log (admin_id, siswa_id, tanggal_absen, status_lama, status_baru, keterangan, created_at)
select
  (select id from users where username = 'admin'),
  (select id from students where name = 'Budi Santoso'),
  current_date,
  'alpha', 'izin', 'Dikoreksi setelah orang tua konfirmasi lewat WA',
  now() - interval '2 hour'
where exists (select 1 from students where name = 'Budi Santoso')
  and not exists (select 1 from absensi_log where keterangan = 'Dikoreksi setelah orang tua konfirmasi lewat WA');


-- =====================================================================
-- SELESAI. Cek cepat:
--   select * from students;
--   select * from absensi order by tanggal desc;
--   select * from users;
-- =====================================================================
