-- 008_lampiran_absensi.sql
-- Port dari fitur "Foto Surat / Lampiran" di Edit Kehadiran (versi PHP lama).
-- Menyimpan URL foto (di-upload ke Cloudinary dari browser, sama seperti
-- foto profil siswa) sebagai bukti pendukung izin/sakit.

alter table absensi add column if not exists lampiran text;
