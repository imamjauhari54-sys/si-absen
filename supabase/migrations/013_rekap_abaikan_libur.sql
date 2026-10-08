-- 013_rekap_abaikan_libur.sql
-- Agregasi rekap semester di sisi database, dengan dua tujuan:
--   1. Tanggal yang tercatat di hari_libur (dan hari Minggu) TIDAK dihitung
--      sebagai hari efektif, dan record absensinya pada tanggal itu diabaikan.
--      Berlaku walaupun libur baru dicatat SETELAH absensi hari itu terlanjur
--      ada (mis. libur mendadak sesudah cron auto-alpha jalan).
--   2. Menghindari batas 1000 baris PostgREST: sebelumnya semua baris absensi
--      satu semester ditarik ke Node lalu dihitung di JavaScript, sehingga
--      hasilnya terpotong diam-diam begitu data melebihi 1000 baris.
--
-- Aman dijalankan ulang (create or replace).
-- Jalankan migrasi ini SEBELUM men-deploy kode yang memanggilnya.

create or replace function public.hari_efektif(p_tapel text, p_semester text)
returns integer
language sql
stable
as $$
  select count(distinct a.tanggal)::integer
  from public.absensi a
  where a.tapel = p_tapel
    and a.semester = p_semester
    and extract(isodow from a.tanggal) <> 7
    and not exists (select 1 from public.hari_libur h where h.tanggal = a.tanggal);
$$;

create or replace function public.rekap_history_siswa(p_tapel text, p_semester text, p_ids bigint[])
returns table (siswa_id bigint, status text, jumlah integer)
language sql
stable
as $$
  select a.siswa_id, a.status, count(*)::integer as jumlah
  from public.absensi a
  where a.tapel = p_tapel
    and a.semester = p_semester
    and a.siswa_id = any (p_ids)
    and extract(isodow from a.tanggal) <> 7
    and not exists (select 1 from public.hari_libur h where h.tanggal = a.tanggal)
  group by a.siswa_id, a.status;
$$;

-- Aplikasi memanggil lewat service role (server). Cabut akses dari anon /
-- authenticated supaya fungsi ini tidak bisa dipanggil langsung dari PostgREST.
revoke all on function public.hari_efektif(text, text) from public, anon, authenticated;
revoke all on function public.rekap_history_siswa(text, text, bigint[]) from public, anon, authenticated;
grant execute on function public.hari_efektif(text, text) to service_role;
grant execute on function public.rekap_history_siswa(text, text, bigint[]) to service_role;
