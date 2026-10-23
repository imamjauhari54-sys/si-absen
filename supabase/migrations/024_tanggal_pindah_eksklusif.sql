-- 024_tanggal_pindah_eksklusif.sql
-- Mengubah arti riwayat_kelas.nonaktif_pada menjadi TANGGAL PINDAH = hari terakhir siswa TAMPIL di rekap,
-- tetapi absensi pada tanggal itu SENDIRI tidak dihitung:
--   * absensi SEBELUM tanggal pindah dihitung normal;
--   * absensi PADA dan sesudah tanggal pindah tidak dihitung (apa pun statusnya); tidak ada record yang dihapus.
-- Contoh: pindah 15 Agustus -> dihitung sampai 14 Agustus; 15 Agustus tampil (lencana "Pindah") tanpa dihitung;
-- mulai 16 Agustus siswa tidak tampil.
-- (Migrasi 023 sebelumnya memakai arti inklusif: tanggal pindah masih dihitung.)
--
-- Isi:
--   1. TIDAK ada pergeseran data. Tanggal yang sudah tersimpan dibaca apa adanya sebagai "tanggal pindah" baru
--      (tanggal yang diketik admin di form). Baris lama dari backfill migrasi 020 (absensi terakhir + 1, digeser
--      023 menjadi absensi terakhir) kini berarti absensi terakhir ikut tidak dihitung: periksa manual bila ada.
--   2. rekap_history_siswa(): memotong record PADA dan sesudah tanggal pindah (<)
--   3. hari_efektif_sebelum(): hari efektif SEBELUM tanggal pindah, pengganti hari_efektif_sampai (migrasi 023)
-- Prasyarat: migrasi 020. Aman dijalankan ulang.
-- Jalankan migrasi ini BERSAMAAN dengan men-deploy kode yang memakainya (arti tanggalnya berubah).

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'riwayat_kelas' and column_name = 'nonaktif_pada'
  ) then
    raise exception 'Prasyarat belum terpenuhi: kolom riwayat_kelas.nonaktif_pada (migrasi 020) belum ada.';
  end if;
end $$;

comment on column public.riwayat_kelas.nonaktif_pada is
  'Tanggal pindah/keluar = hari terakhir siswa TAMPIL di rekap; absensi pada tanggal ini dan sesudahnya TIDAK dihitung (eksklusif); kosong = penuh sepanjang tapel. [eksklusif-v2]';

-- Agregat semester: record pada/sesudah tanggal pindah dipotong ------------------------------------

create or replace function public.rekap_history_siswa(p_tapel text, p_semester text, p_ids bigint[])
returns table (siswa_id bigint, status text, jumlah integer)
language sql
stable
as $$
  select a.siswa_id, a.status, count(*)::integer as jumlah
  from public.absensi a
  left join public.riwayat_kelas r on r.siswa_id = a.siswa_id and r.tapel = p_tapel
  where a.tapel = p_tapel
    and a.semester = p_semester
    and a.siswa_id = any (p_ids)
    and extract(isodow from a.tanggal) <> 7
    and not exists (select 1 from public.hari_libur h where h.tanggal = a.tanggal)
    and (r.nonaktif_pada is null or a.tanggal < r.nonaktif_pada)
  group by a.siswa_id, a.status;
$$;

-- Hari efektif SEBELUM tanggal tertentu (eksklusif) -------------------------------------------------
-- p_sebelum kosong = tanpa batas (sama dengan hari_efektif).

create or replace function public.hari_efektif_sebelum(p_tapel text, p_semester text, p_sebelum date)
returns integer
language sql
stable
as $$
  select count(distinct a.tanggal)::integer
  from public.absensi a
  where a.tapel = p_tapel
    and a.semester = p_semester
    and extract(isodow from a.tanggal) <> 7
    and not exists (select 1 from public.hari_libur h where h.tanggal = a.tanggal)
    and (p_sebelum is null or a.tanggal < p_sebelum);
$$;

drop function if exists public.hari_efektif_sampai(text, text, date);

revoke all on function public.rekap_history_siswa(text, text, bigint[]) from public, anon, authenticated;
revoke all on function public.hari_efektif_sebelum(text, text, date) from public, anon, authenticated;
grant execute on function public.rekap_history_siswa(text, text, bigint[]) to service_role;
grant execute on function public.hari_efektif_sebelum(text, text, date) to service_role;
