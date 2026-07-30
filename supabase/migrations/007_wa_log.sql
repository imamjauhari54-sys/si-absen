-- 007_wa_log.sql
-- Sebelumnya kegagalan kirim WA cuma ditangkap catch{} kosong — kalau
-- gateway WA down, gak ada jejaknya sama sekali, admin gak akan tahu kenapa
-- orang tua gak dapet notifikasi. Tabel ini mencatat SETIAP percobaan kirim
-- (baik berhasil maupun gagal) supaya bisa ditelusuri.

create table if not exists wa_log (
  id bigint generated always as identity primary key,
  siswa_id bigint references students(id) on delete set null,
  nama_siswa text not null,
  nomor_hp text,
  tipe text not null check (tipe in ('absen', 'alpha')),
  status text not null check (status in ('terkirim', 'gagal')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_wa_log_status on wa_log (status);
create index if not exists idx_wa_log_created_at on wa_log (created_at desc);
create index if not exists idx_wa_log_siswa_id on wa_log (siswa_id);
