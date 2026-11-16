-- 028_wa_log_keputusan.sql
-- Notifikasi WhatsApp keputusan pengajuan izin/sakit dicatat di wa_log dengan tipe 'keputusan'.
-- Hanya melonggarkan CHECK (tipe) yang dibuat migrasi 007; data lama tidak berubah. Aman dijalankan ulang.
-- Bila migrasi ini belum dijalankan: pesan tetap terkirim, hanya baris lognya yang gagal dicatat (console.error di server).
alter table public.wa_log drop constraint if exists wa_log_tipe_check;
alter table public.wa_log add constraint wa_log_tipe_check check (tipe in ('absen', 'alpha', 'keputusan'));
