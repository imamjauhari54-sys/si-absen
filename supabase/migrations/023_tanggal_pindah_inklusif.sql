-- 023_tanggal_pindah_inklusif.sql
-- Mengubah arti riwayat_kelas.nonaktif_pada menjadi TANGGAL PINDAH = HARI TERAKHIR siswa masih dihitung
-- di rekap (inklusif):
--   * absensi sebelum DAN PADA tanggal pindah dihitung normal;
--   * absensi sesudah tanggal pindah tidak dihitung (apa pun statusnya); tidak ada record yang dihapus.
-- Sebelumnya (migrasi 020-022) kolom ini berarti "hari pertama TIDAK dihitung" (eksklusif).
--
-- Isi:
--   1. data yang sudah ada digeser mundur 1 hari — HANYA SEKALI (dijaga penanda di komentar kolom).
--      Ini murni perubahan representasi: kumpulan hari yang dihitung untuk tiap siswa tidak berubah.
--      Termasuk backfill migrasi 020 (absensi terakhir + 1) yang kini menjadi tepat absensi terakhir.
--   2. rekap_history_siswa(): memotong record SESUDAH tanggal pindah (<=)
--   3. hari_efektif_sampai(): hari efektif sampai tanggal pindah (inklusif), pengganti hari_efektif_sebelum
-- Prasyarat: migrasi 020 dan 022. Aman dijalankan ulang.
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

-- 1. Geser data lama sekali saja ----------------------------------------------------------------

do $$
declare
  v_komentar text;
begin
  select col_description('public.riwayat_kelas'::regclass, a.attnum) into v_komentar
  from pg_attribute a
  where a.attrelid = 'public.riwayat_kelas'::regclass and a.attname = 'nonaktif_pada';

  if v_komentar is null or v_komentar not like '%[inklusif-v1]%' then
    update public.riwayat_kelas set nonaktif_pada = nonaktif_pada - 1 where nonaktif_pada is not null;
  end if;
end $$;

comment on column public.riwayat_kelas.nonaktif_pada is
  'Tanggal pindah/keluar = HARI TERAKHIR siswa masih dihitung di rekap (inklusif); kosong = penuh sepanjang tapel. [inklusif-v1]';

-- 2. Agregat semester: record sesudah tanggal pindah dipotong ------------------------------------

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
    and (r.nonaktif_pada is null or a.tanggal <= r.nonaktif_pada)
  group by a.siswa_id, a.status;
$$;

-- 3. Hari efektif sampai tanggal tertentu (inklusif) ---------------------------------------------
-- p_sampai kosong = tanpa batas (sama dengan hari_efektif).

create or replace function public.hari_efektif_sampai(p_tapel text, p_semester text, p_sampai date)
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
    and (p_sampai is null or a.tanggal <= p_sampai);
$$;

drop function if exists public.hari_efektif_sebelum(text, text, date);

revoke all on function public.rekap_history_siswa(text, text, bigint[]) from public, anon, authenticated;
revoke all on function public.hari_efektif_sampai(text, text, date) from public, anon, authenticated;
grant execute on function public.rekap_history_siswa(text, text, bigint[]) to service_role;
grant execute on function public.hari_efektif_sampai(text, text, date) to service_role;
