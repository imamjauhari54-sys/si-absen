-- Matriks pembanding SQL <-> TypeScript untuk PRATINJAU nasib hari pengajuan (migrasi 027).
-- Menjalankan putuskan_pengajuan_izin (setujui & tolak) untuk 3 waktu (lampau/hari ini/mendatang) x 6 kondisi catatan absensi
-- yang sudah ada, lalu mencetak hasilnya sebagai JSON. Pencocokan dengan src/lib/utils/pengajuan.ts dikerjakan
-- src/lib/utils/pengajuan.matriks.test.ts:
--   psql -h HOST -U USER -X -q -At -v ON_ERROR_STOP=1 -f supabase/tests/pengajuan_pratinjau_matriks.sql nama_db_uji > /tmp/matriks.json
--   PENGAJUAN_MATRIKS_JSON=/tmp/matriks.json npx vitest run src/lib/utils/pengajuan.matriks.test.ts
-- Satu transaksi yang di-ROLLBACK (membuat siswa "MX-*" lalu dibuang; menghapus data contoh migrasi 001 di jendela uji). JANGAN dijalankan di produksi.
\set ON_ERROR_STOP on
begin;
create function pg_temp.hari() returns date language sql as $$ select (now() at time zone 'Asia/Jakarta')::date $$;
create function pg_temp.lalu(n int) returns date language sql as $$
  select d from hari_sekolah_rentang(pg_temp.hari() - 25, pg_temp.hari() - 1) d order by d desc offset n - 1 limit 1 $$;
create function pg_temp.depan(n int) returns date language sql as $$
  select d from hari_sekolah_rentang(pg_temp.hari() + 1, pg_temp.hari() + 25) d order by d offset n - 1 limit 1 $$;
delete from students where nisn like '00912345%';
delete from hari_libur where tanggal between pg_temp.hari() - 40 and pg_temp.hari() + 60;
delete from absensi_setting;
insert into absensi_setting (tapel, semester)
  select case when extract(month from pg_temp.hari()) >= 7
              then extract(year from pg_temp.hari())::int || '/' || (extract(year from pg_temp.hari())::int + 1)
              else (extract(year from pg_temp.hari())::int - 1) || '/' || extract(year from pg_temp.hari())::int end,
         case when extract(month from pg_temp.hari()) >= 7 then 'ganjil' else 'genap' end;

create temp table kasus (n serial, waktu text, tgl date, abs text, ke text);
insert into kasus (waktu, tgl, abs, ke)
select w.waktu, w.tgl, a.abs, k.ke
from (values ('lalu', pg_temp.lalu(3)), ('ini', case when exists (select 1 from hari_sekolah_rentang(pg_temp.hari(), pg_temp.hari())) then pg_temp.hari() end), ('depan', pg_temp.depan(3))) w(waktu, tgl)
cross join (values ('none'), ('alpha'), ('hadir'), ('terlambat'), ('izin'), ('sakit')) a(abs)
cross join (values ('setujui'), ('tolak')) k(ke)
where w.tgl is not null;

insert into students (name, class, nisn) select 'MX ' || n, '5', 'MX-' || n from kasus;
create temp table hasil (waktu text, tgl date, hari_ini date, abs text, ke text, hasil_hari text, abs_akhir text, status_pengajuan text);

do $$
declare k record; v_sid bigint; v_id bigint; v_per record; v_res text; v_akhir text; v_stp text; v_hari date := (now() at time zone 'Asia/Jakarta')::date;
begin
  for k in select * from kasus order by n loop
    select id into v_sid from students where nisn = 'MX-' || k.n;
    v_id := (ajukan_pengajuan_izin(v_sid, 'izin', k.tgl, k.tgl, 'alasan uji matriks') ->> 'id')::bigint;
    if k.abs <> 'none' then   -- catatan "terjadi" SETELAH pengajuan (scan / edit manual / alpha dari cron)
      select * into v_per from absensi_periode_tanggal(k.tgl);
      insert into absensi (siswa_id, tanggal, status, keterangan, tapel, semester, scan_oleh)
      values (v_sid, k.tgl, k.abs, 'uji matriks', v_per.o_tapel, v_per.o_semester, 'admin');
    end if;
    perform putuskan_pengajuan_izin(v_id, k.ke, null, null, (select id from users order by id limit 1), 'Penguji');
    select h.hasil into v_res from pengajuan_izin_hari h where h.pengajuan_id = v_id and h.tanggal = k.tgl;
    select a.status into v_akhir from absensi a where a.siswa_id = v_sid and a.tanggal = k.tgl;
    select p.status into v_stp from pengajuan_izin p where p.id = v_id;
    insert into hasil values (k.waktu, k.tgl, v_hari, k.abs, k.ke, v_res, v_akhir, v_stp);
  end loop;
end $$;

select coalesce(json_agg(h order by waktu, abs, ke), '[]'::json) from hasil h;
rollback;
