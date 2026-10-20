-- 020_nonaktif_riwayat.sql
-- Tanggal & alasan siswa keluar (lulus/pindah) PER TAPEL, disimpan di riwayat_kelas.
--
-- Masalah: siswa yang dinonaktifkan di tengah tapel tetap punya baris riwayat_kelas, sehingga
-- Rekap menampilkannya sebagai "alpha" pada hari-hari setelah ia keluar dan jumlahnya tidak cocok
-- dengan Data Siswa. students.status hanya menyimpan kondisi SEKARANG, tanpa tanggal.
--
-- Isi migrasi (aditif, aman dijalankan ulang):
--   1. kolom nonaktif_pada (tanggal keluar = hari pertama siswa TIDAK lagi dihitung) dan
--      alasan_nonaktif ('lulus' | 'pindah') di riwayat_kelas, + constraint
--   2. trigger sinkron_riwayat_siswa: saat status aktif -> lulus/pindah, isi tanggal (hari ini WIB)
--      dan alasan; saat diaktifkan lagi, kosongkan keduanya
--   3. siswa_tapel() ikut mengembalikan kedua kolom
--   4. nonaktifkan_siswa(): nonaktifkan + tanggal keluar pilihan admin dalam satu transaksi
--   5. backfill siswa yang sudah non-aktif
-- Prasyarat: migrasi 016 (dan 017 untuk kenaikan kelas).
--
-- Kenaikan kelas (017) tidak diubah: siswa yang lulus lewat wizard tidak punya baris di tapel baru,
-- dan baris tapel lamanya memang berarti "penuh sepanjang tapel" (nonaktif_pada kosong).

-- 1. KOLOM -------------------------------------------------------------------------------

alter table public.riwayat_kelas
  add column if not exists nonaktif_pada   date,
  add column if not exists alasan_nonaktif text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'riwayat_kelas_alasan_check') then
    alter table public.riwayat_kelas
      add constraint riwayat_kelas_alasan_check
      check (alasan_nonaktif is null or alasan_nonaktif in ('lulus', 'pindah'));
  end if;
  -- tanggal keluar tanpa alasan tidak boleh ada (kebalikannya boleh: lulus lewat kenaikan kelas)
  if not exists (select 1 from pg_constraint where conname = 'riwayat_kelas_tanggal_alasan_check') then
    alter table public.riwayat_kelas
      add constraint riwayat_kelas_tanggal_alasan_check
      check (nonaktif_pada is null or alasan_nonaktif is not null);
  end if;
end $$;

-- 2. TRIGGER -----------------------------------------------------------------------------
-- Sama seperti versi 016, ditambah pengisian/pengosongan tanggal & alasan keluar.
-- Operasi massal yang set app.lewati_riwayat (kenaikan kelas) tetap dilewati.

create or replace function public.sinkron_riwayat_siswa()
returns trigger
language plpgsql
as $$
declare
  v_tapel text;
  v_hari  date := (now() at time zone 'Asia/Jakarta')::date;
begin
  if current_setting('app.lewati_riwayat', true) = '1' then
    return null;
  end if;

  select tapel into v_tapel from public.absensi_setting order by id limit 1;
  if v_tapel is null or v_tapel = '' then
    return null;
  end if;

  if new.status = 'aktif' then
    -- aktif (termasuk diaktifkan kembali): selalu punya baris di tapel aktif, tanpa tanggal keluar
    insert into public.riwayat_kelas (siswa_id, tapel, kelas)
    values (new.id, v_tapel, new.class)
    on conflict (siswa_id, tapel) do update
      set kelas = excluded.kelas,
          nonaktif_pada = null,
          alasan_nonaktif = null;
  else
    -- lulus/pindah: jangan membuat baris baru, cukup jaga baris yang sudah ada.
    -- Tanggal diisi hanya saat benar-benar berubah dari aktif; alasan mengikuti perubahan status.
    update public.riwayat_kelas
    set kelas = new.class,
        nonaktif_pada = case
          when tg_op = 'UPDATE' and old.status = 'aktif' then v_hari
          else nonaktif_pada
        end,
        alasan_nonaktif = case
          when tg_op = 'UPDATE' and old.status is distinct from new.status then new.status
          else alasan_nonaktif
        end
    where siswa_id = new.id and tapel = v_tapel;
  end if;
  return null;
end;
$$;

-- 3. FUNGSI BACA -------------------------------------------------------------------------
-- Tipe kembalian berubah, jadi fungsi lama harus di-drop dulu.

drop function if exists public.siswa_tapel(text, text);

create function public.siswa_tapel(p_tapel text, p_kelas text default null)
returns table (siswa_id bigint, nama text, kelas text, nisn text, nonaktif_pada date, alasan_nonaktif text)
language sql
stable
as $$
  select s.id, s.name, r.kelas, s.nisn, r.nonaktif_pada, r.alasan_nonaktif
  from public.riwayat_kelas r
  join public.students s on s.id = r.siswa_id
  where r.tapel = p_tapel
    and (coalesce(p_kelas, '') = '' or r.kelas = p_kelas)
  order by r.kelas, s.name, s.id;
$$;

revoke all on function public.siswa_tapel(text, text) from public, anon, authenticated;
grant execute on function public.siswa_tapel(text, text) to service_role;

-- 4. NONAKTIFKAN DENGAN TANGGAL ----------------------------------------------------------
-- p_tanggal kosong = hari ini (WIB, diisi trigger). Dua statement dalam satu transaksi.

create or replace function public.nonaktifkan_siswa(p_id bigint, p_alasan text, p_tanggal date default null)
returns void
language plpgsql
as $$
declare
  v_status text;
  v_tapel  text;
begin
  if p_alasan is null or p_alasan not in ('lulus', 'pindah') then
    raise exception 'Alasan tidak valid: %', p_alasan;
  end if;

  select status into v_status from public.students where id = p_id for update;
  if not found then
    raise exception 'Siswa tidak ditemukan.';
  end if;
  if v_status <> 'aktif' then
    raise exception 'Siswa ini sudah berstatus non-aktif.';
  end if;

  update public.students set status = p_alasan where id = p_id;  -- trigger mengisi tanggal & alasan

  if p_tanggal is not null then
    select tapel into v_tapel from public.absensi_setting order by id limit 1;
    update public.riwayat_kelas set nonaktif_pada = p_tanggal
    where siswa_id = p_id and tapel = v_tapel;
  end if;
end;
$$;

revoke all on function public.nonaktifkan_siswa(bigint, text, date) from public, anon, authenticated;
grant execute on function public.nonaktifkan_siswa(bigint, text, date) to service_role;

-- 5. BACKFILL ----------------------------------------------------------------------------

-- a) alasan: dari students.status, pada baris tapel TERAKHIR siswa itu
update public.riwayat_kelas r
set alasan_nonaktif = s.status
from public.students s
where s.id = r.siswa_id
  and s.status in ('lulus', 'pindah')
  and r.alasan_nonaktif is null
  and r.tapel = (select max(r2.tapel) from public.riwayat_kelas r2 where r2.siswa_id = r.siswa_id);

-- b) tanggal keluar: HANYA untuk yang non-aktif di tapel aktif, diperkirakan = sehari setelah absensi
--    terakhirnya di tapel itu. Yang tidak punya absensi dibiarkan kosong (Rekap memakai aturan lama:
--    tampil hanya kalau ada data). Admin bisa mengoreksi manual bila perlu.
--    Siswa lulus lewat kenaikan kelas (baris tapel lama) sengaja dibiarkan kosong = penuh satu tapel.
update public.riwayat_kelas r
set nonaktif_pada = x.terakhir + 1
from (
  select a.siswa_id, a.tapel, max(a.tanggal) as terakhir
  from public.absensi a
  group by a.siswa_id, a.tapel
) x,
(select tapel from public.absensi_setting order by id limit 1) st
where x.siswa_id = r.siswa_id
  and x.tapel = r.tapel
  and r.tapel = st.tapel
  and r.nonaktif_pada is null
  and r.alasan_nonaktif is not null;
