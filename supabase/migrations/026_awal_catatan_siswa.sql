-- 026_awal_catatan_siswa.sql
-- Tanggal CATATAN PERTAMA tiap siswa pada satu tapel: batas awal perhitungan absensi.
--
-- Satu sumber untuk SEMUA tampilan (Portal Siswa, kartu ringkasan, Rekap Harian, Rekap Bulanan admin, grafik tren):
-- hari SEBELUM catatan pertama siswa di tapel itu tidak dihitung (bukan Alpha), karena siswa belum/tidak tercatat.
-- Siswa yang TIDAK punya catatan sama sekali di tapel itu tidak muncul di hasil -> aplikasi memperlakukannya
-- secara eksplisit sebagai "belum tercatat" (semua hari kosong), bukan masuk sejak awal tapel.
--
-- Hanya membaca. Aman dijalankan ulang. Tidak mengubah data.

create or replace function public.awal_catatan_siswa(p_tapel text, p_ids bigint[])
returns table (siswa_id bigint, mulai date)
language sql
stable
as $$
  select a.siswa_id, min(a.tanggal) as mulai
  from public.absensi a
  where a.tapel = p_tapel
    and a.siswa_id = any (p_ids)
  group by a.siswa_id;
$$;

revoke all on function public.awal_catatan_siswa(text, bigint[]) from public, anon, authenticated;
grant execute on function public.awal_catatan_siswa(text, bigint[]) to service_role;
