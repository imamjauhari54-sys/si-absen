-- 016_riwayat_kelas.sql
-- TAHAP 2: riwayat kelas per tahun pelajaran.
--
-- Masalah: students.class hanya menyimpan kelas SAAT INI. Begitu siswa naik kelas, Rekap /
-- History tapel lama menampilkan mereka di kelas baru, dan "reset data kelas X bulan Y"
-- bisa menghapus data siswa yang salah. Tabel ini menyimpan kelas siswa PER TAPEL.
--
-- Isi migrasi (semuanya aditif — perilaku aplikasi lama tidak berubah sampai kode Tahap 2 dipakai):
--   1. tabel riwayat_kelas + backfill dari data sekarang
--   2. trigger: setiap siswa aktif otomatis punya baris di tapel aktif
--   3. fungsi baca (daftar siswa per tapel, daftar kelas per tapel/periode)
--   4. fungsi hapus_data_absensi: reset data yang benar-benar memakai riwayat, dalam 1 transaksi
--
-- WAJIB dijalankan SEBELUM kenaikan kelas pertama. Backfill mengasumsikan kelas siswa
-- belum pernah berubah sejak tapel-tapel yang ada di tabel absensi. Aman dijalankan ulang.
-- Prasyarat: migrasi 015.

-- 1. TABEL -------------------------------------------------------------------------------

create table if not exists public.riwayat_kelas (
  siswa_id  bigint not null references public.students (id) on delete cascade,
  tapel     text   not null,
  kelas     text   not null,
  primary key (siswa_id, tapel)
);

create index if not exists idx_riwayat_kelas_tapel_kelas on public.riwayat_kelas (tapel, kelas);

-- Tanpa FK ke tahun_pelajaran: trigger di bawah tidak boleh menggagalkan simpan siswa
-- hanya karena tapel di setting kebetulan belum ada di master.

alter table public.riwayat_kelas enable row level security;
revoke all on public.riwayat_kelas from anon, authenticated;

-- 2. BACKFILL ----------------------------------------------------------------------------

-- a) setiap (siswa, tapel) yang punya absensi → kelas siswa saat ini
insert into public.riwayat_kelas (siswa_id, tapel, kelas)
select distinct a.siswa_id, a.tapel, s.class
from public.absensi a
join public.students s on s.id = a.siswa_id
where a.tapel is not null and a.tapel <> ''
on conflict (siswa_id, tapel) do nothing;

-- b) siswa aktif di tapel aktif (walau belum punya absensi)
insert into public.riwayat_kelas (siswa_id, tapel, kelas)
select s.id, st.tapel, s.class
from public.students s
cross join (select tapel from public.absensi_setting order by id limit 1) st
where s.status = 'aktif' and st.tapel is not null and st.tapel <> ''
on conflict (siswa_id, tapel) do nothing;

-- 3. TRIGGER -----------------------------------------------------------------------------
-- Dua trigger menjaga invarian: "siswa aktif selalu punya baris di tapel aktif".
--
-- Untuk operasi massal yang SENGAJA mengisi riwayat sendiri (kenaikan kelas, Tahap 3), set dulu
--   select set_config('app.lewati_riwayat', '1', true);   -- berlaku sampai akhir transaksi
-- supaya trigger siswa di bawah tidak menimpa riwayat tapel aktif.

create or replace function public.sinkron_riwayat_siswa()
returns trigger
language plpgsql
as $$
declare
  v_tapel text;
begin
  if current_setting('app.lewati_riwayat', true) = '1' then
    return null;
  end if;

  select tapel into v_tapel from public.absensi_setting order by id limit 1;
  if v_tapel is null or v_tapel = '' then
    return null;
  end if;

  if new.status = 'aktif' then
    insert into public.riwayat_kelas (siswa_id, tapel, kelas)
    values (new.id, v_tapel, new.class)
    on conflict (siswa_id, tapel) do update set kelas = excluded.kelas;
  else
    -- lulus/pindah: jangan membuat baris baru, cukup jaga baris yang sudah ada
    update public.riwayat_kelas set kelas = new.class
    where siswa_id = new.id and tapel = v_tapel;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_sinkron_riwayat_siswa on public.students;
create trigger trg_sinkron_riwayat_siswa
  after insert or update of class, status on public.students
  for each row execute function public.sinkron_riwayat_siswa();

-- Saat tapel aktif berpindah ke tapel yang BELUM punya riwayat sama sekali, salin kelas siswa
-- aktif (tanpa naik kelas). Tapel yang sudah punya riwayat tidak disentuh, jadi memundurkan
-- tapel aktif tidak mencemari data tapel lama.
create or replace function public.sinkron_riwayat_periode()
returns trigger
language plpgsql
as $$
begin
  if new.tapel is null or new.tapel = '' then
    return null;
  end if;
  if exists (select 1 from public.riwayat_kelas where tapel = new.tapel) then
    return null;
  end if;

  insert into public.riwayat_kelas (siswa_id, tapel, kelas)
  select s.id, new.tapel, s.class
  from public.students s
  where s.status = 'aktif'
  on conflict (siswa_id, tapel) do nothing;
  return null;
end;
$$;

drop trigger if exists trg_sinkron_riwayat_periode on public.absensi_setting;
create trigger trg_sinkron_riwayat_periode
  after insert or update of tapel on public.absensi_setting
  for each row execute function public.sinkron_riwayat_periode();

-- 4. FUNGSI BACA -------------------------------------------------------------------------

-- Siswa (beserta kelasnya PADA tapel itu), urut kelas lalu nama. p_kelas kosong = semua kelas.
-- Dipanggil dari server dengan .range() untuk paginasi.
create or replace function public.siswa_tapel(p_tapel text, p_kelas text default null)
returns table (siswa_id bigint, nama text, kelas text, nisn text)
language sql
stable
as $$
  select s.id, s.name, r.kelas, s.nisn
  from public.riwayat_kelas r
  join public.students s on s.id = r.siswa_id
  where r.tapel = p_tapel
    and (coalesce(p_kelas, '') = '' or r.kelas = p_kelas)
  order by r.kelas, s.name, s.id;
$$;

create or replace function public.kelas_tapel(p_tapel text)
returns table (kelas text)
language sql
stable
as $$
  select distinct r.kelas from public.riwayat_kelas r where r.tapel = p_tapel order by r.kelas;
$$;

-- Kelas yang punya data absensi pada periode ('YYYY-MM' atau 'all'), menurut kelas SAAT ITU.
create or replace function public.kelas_by_periode(p_bulan text)
returns table (kelas text)
language plpgsql
stable
as $$
declare
  v_semua boolean := (p_bulan is null or p_bulan = 'all');
  v_awal  date;
begin
  if not v_semua then
    if p_bulan !~ '^\d{4}-(0[1-9]|1[0-2])$' then
      raise exception 'Format bulan tidak valid: %', p_bulan;
    end if;
    v_awal := (p_bulan || '-01')::date;
  end if;

  return query
  select distinct r.kelas
  from public.absensi a
  join public.riwayat_kelas r on r.siswa_id = a.siswa_id and r.tapel = a.tapel
  where v_semua or (a.tanggal >= v_awal and a.tanggal < (v_awal + interval '1 month')::date)
  order by r.kelas;
end;
$$;

-- 5. RESET DATA ABSENSI ------------------------------------------------------------------
-- Pengganti logika di resetDataAction yang memilih siswa lewat students.class (kelas SEKARANG).
-- Di sini filter kelas memakai riwayat: yang dihapus adalah absensi siswa yang PADA SAAT ITU
-- (tapel pada baris absensinya) berada di kelas tsb. Satu statement = satu transaksi (atomik).
-- Catatan: baris absensi dengan tapel NULL tidak ikut terhapus kalau filter kelas diisi.
-- p_bulan: 'YYYY-MM' atau 'all'. p_kelas: kosong = semua kelas.
create or replace function public.hapus_data_absensi(p_bulan text, p_kelas text default null)
returns table (absensi_dihapus integer, log_dihapus integer)
language plpgsql
as $$
declare
  v_semua boolean := (p_bulan is null or p_bulan = 'all');
  v_kelas text    := nullif(btrim(coalesce(p_kelas, '')), '');
  v_awal  date;
  v_akhir date;
  n_abs   integer;
  n_log   integer;
begin
  if not v_semua then
    if p_bulan !~ '^\d{4}-(0[1-9]|1[0-2])$' then
      raise exception 'Format bulan tidak valid: %', p_bulan;
    end if;
    v_awal  := (p_bulan || '-01')::date;
    v_akhir := (v_awal + interval '1 month')::date;
  end if;

  with target as (
    select a.id, a.siswa_id, a.tanggal
    from public.absensi a
    where (v_semua or (a.tanggal >= v_awal and a.tanggal < v_akhir))
      and (
        v_kelas is null
        or exists (
          select 1 from public.riwayat_kelas r
          where r.siswa_id = a.siswa_id and r.tapel = a.tapel and r.kelas = v_kelas
        )
      )
  ),
  del_log as (
    delete from public.absensi_log l
    where exists (select 1 from target t where t.siswa_id = l.siswa_id and t.tanggal = l.tanggal_absen)
       or (v_semua and v_kelas is null and l.siswa_id in (select siswa_id from target))
    returning 1
  ),
  del_abs as (
    delete from public.absensi a using target t where a.id = t.id returning 1
  )
  select (select count(*) from del_abs)::integer, (select count(*) from del_log)::integer
  into n_abs, n_log;

  return query select n_abs, n_log;
end;
$$;

-- Hanya dipanggil dari server (service role), sama seperti fungsi di migrasi 013.
revoke all on function public.siswa_tapel(text, text)        from public, anon, authenticated;
revoke all on function public.kelas_tapel(text)              from public, anon, authenticated;
revoke all on function public.kelas_by_periode(text)         from public, anon, authenticated;
revoke all on function public.hapus_data_absensi(text, text) from public, anon, authenticated;
grant execute on function public.siswa_tapel(text, text)        to service_role;
grant execute on function public.kelas_tapel(text)              to service_role;
grant execute on function public.kelas_by_periode(text)         to service_role;
grant execute on function public.hapus_data_absensi(text, text) to service_role;

-- CEK SETELAH MENJALANKAN (harus 0 baris untuk kedua query):
--   -- siswa aktif yang tidak punya baris di tapel aktif
--   select s.id, s.name from students s
--    where s.status = 'aktif'
--      and not exists (select 1 from riwayat_kelas r, absensi_setting st
--                       where r.siswa_id = s.id and r.tapel = st.tapel);
--   -- absensi yang (siswa, tapel)-nya tidak punya riwayat
--   select distinct a.siswa_id, a.tapel from absensi a
--    where a.tapel is not null
--      and not exists (select 1 from riwayat_kelas r where r.siswa_id = a.siswa_id and r.tapel = a.tapel);
