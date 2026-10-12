-- 017_kenaikan_kelas.sql
-- TAHAP 3: kenaikan kelas + mulai tahun ajaran baru, dalam SATU transaksi database.
--
-- naik_kelas(...)              : tambah tapel tujuan, pindahkan kelas siswa, luluskan yang lulus,
--                                tulis riwayat_kelas tapel baru, lalu jadikan tapel tujuan aktif.
-- batalkan_kenaikan_kelas(...) : mengembalikan semuanya, selama tapel tujuan belum punya absensi.
--
-- Prasyarat: migrasi 015 (tahun_pelajaran) dan 016 (riwayat_kelas + trigger).
-- Aman dijalankan ulang (create or replace / if not exists).
--
-- Kenapa fungsi database dan bukan beberapa UPDATE dari aplikasi: supabase-js tidak punya
-- transaksi. Kalau gagal di tengah, sebagian siswa sudah naik dan sebagian belum. Di sini
-- semuanya berhasil atau tidak sama sekali. Pemetaan juga dihitung dari data AWAL, sehingga
-- 1→2 lalu 2→3 tidak membuat siswa kelas 1 ikut naik dua kali.

create table if not exists public.kenaikan_kelas (
  id               bigint generated always as identity primary key,
  tapel_asal       text        not null,
  semester_asal    text        not null,
  tapel_tujuan     text        not null,
  semester_tujuan  text        not null,
  dibuat_oleh      bigint,
  dibuat_pada      timestamptz not null default now(),
  jumlah_naik      integer     not null default 0,
  jumlah_tetap     integer     not null default 0,
  jumlah_lulus     integer     not null default 0,
  pemetaan         jsonb       not null,
  -- kondisi siswa SEBELUM dan SESUDAH: [{id, class, status, ke}] (dipakai untuk pembatalan)
  snapshot         jsonb       not null,
  dibatalkan_pada  timestamptz
);

create index if not exists idx_kenaikan_kelas_tujuan on public.kenaikan_kelas (tapel_tujuan);

alter table public.kenaikan_kelas enable row level security;
revoke all on public.kenaikan_kelas from anon, authenticated;

-- p_pemetaan    : [{"dari":"5","ke":"6"}, {"dari":"6","ke":"__lulus__"}]
--                 ke = nama kelas tujuan, atau '__lulus__'. "Tidak naik" = ke sama dengan dari.
-- p_pengecualian: [{"siswa_id":12,"ke":"5"}]  → menimpa pemetaan untuk siswa tertentu (tinggal kelas, dst)
-- p_jumlah_aktif: jumlah siswa aktif yang dilihat admin di pratinjau; kalau beda, ditolak
--                 (data berubah sejak pratinjau).
create or replace function public.naik_kelas(
  p_tapel_tujuan  text,
  p_semester      text,
  p_pemetaan      jsonb,
  p_pengecualian  jsonb   default '[]'::jsonb,
  p_jumlah_aktif  integer default null,
  p_user_id       bigint  default null
)
returns table (kenaikan_id bigint, jumlah_naik integer, jumlah_tetap integer, jumlah_lulus integer)
language plpgsql
as $$
declare
  c_lulus      constant text := '__lulus__';
  v_setting_id bigint;
  v_asal       text;
  v_sem_asal   text;
  v_total      integer;
  v_tidak      text;
  v_tujuan     jsonb;
  v_snapshot   jsonb;
  v_naik       integer;
  v_tetap      integer;
  v_lulus      integer;
  v_id         bigint;
begin
  p_pengecualian := coalesce(p_pengecualian, '[]'::jsonb);

  -- 1. Validasi masukan ---------------------------------------------------------------
  if p_semester is null or p_semester not in ('ganjil', 'genap') then
    raise exception 'Semester tidak valid.';
  end if;

  if p_tapel_tujuan is null or not (case
       when p_tapel_tujuan ~ '^\d{4}/\d{4}$'
         then split_part(p_tapel_tujuan, '/', 2)::int = split_part(p_tapel_tujuan, '/', 1)::int + 1
       else false end) then
    raise exception 'Format tahun pelajaran tujuan tidak valid (contoh: 2027/2028).';
  end if;

  if p_pemetaan is null or jsonb_typeof(p_pemetaan) <> 'array' or jsonb_array_length(p_pemetaan) = 0 then
    raise exception 'Pemetaan kelas kosong.';
  end if;
  if jsonb_typeof(p_pengecualian) <> 'array' then
    raise exception 'Format pengecualian tidak valid.';
  end if;

  -- 2. Kunci baris setting: dua kenaikan bersamaan akan antre, yang kedua gagal di cek bawah ---
  select id, tapel, semester into v_setting_id, v_asal, v_sem_asal
  from public.absensi_setting order by id limit 1 for update;

  if v_setting_id is null or v_asal is null or v_asal = '' then
    raise exception 'Tahun pelajaran aktif belum diatur.';
  end if;
  if p_tapel_tujuan <= v_asal then
    raise exception 'Tahun pelajaran tujuan (%) harus lebih baru dari yang aktif (%).', p_tapel_tujuan, v_asal;
  end if;
  if exists (select 1 from public.absensi where tapel = p_tapel_tujuan) then
    raise exception 'Tahun pelajaran % sudah punya data absensi; kenaikan kelas tidak bisa dijalankan.', p_tapel_tujuan;
  end if;
  if exists (select 1 from public.kenaikan_kelas where tapel_tujuan = p_tapel_tujuan and dibatalkan_pada is null) then
    raise exception 'Kenaikan kelas ke % sudah pernah dijalankan.', p_tapel_tujuan;
  end if;

  -- 3. Cek data siswa & pemetaan ---------------------------------------------------------
  select count(*) into v_total from public.students where status = 'aktif';
  if v_total = 0 then
    raise exception 'Tidak ada siswa aktif.';
  end if;
  if p_jumlah_aktif is not null and p_jumlah_aktif <> v_total then
    raise exception 'Data siswa berubah sejak pratinjau (% → % siswa aktif). Muat ulang halaman lalu coba lagi.', p_jumlah_aktif, v_total;
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_pemetaan) as m(dari text, ke text)
    where coalesce(btrim(m.dari), '') = '' or coalesce(btrim(m.ke), '') = ''
  ) then
    raise exception 'Ada pemetaan kelas yang kosong.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_pemetaan) as m(dari text, ke text) group by m.dari having count(*) > 1
  ) then
    raise exception 'Ada kelas asal yang dipetakan lebih dari satu kali.';
  end if;

  select string_agg(distinct s.class, ', ') into v_tidak
  from public.students s
  where s.status = 'aktif'
    and not exists (
      select 1 from jsonb_to_recordset(p_pemetaan) as m(dari text, ke text) where m.dari = s.class
    );
  if v_tidak is not null then
    raise exception 'Kelas berikut belum dipetakan: %.', v_tidak;
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_pengecualian) as e(siswa_id bigint, ke text)
    where e.siswa_id is null or coalesce(btrim(e.ke), '') = ''
  ) then
    raise exception 'Ada pengecualian siswa yang tidak lengkap.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_pengecualian) as e(siswa_id bigint, ke text) group by e.siswa_id having count(*) > 1
  ) then
    raise exception 'Ada siswa yang muncul lebih dari satu kali di pengecualian.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_pengecualian) as e(siswa_id bigint, ke text)
    left join public.students s on s.id = e.siswa_id and s.status = 'aktif'
    where s.id is null
  ) then
    raise exception 'Pengecualian berisi siswa yang tidak ditemukan atau sudah tidak aktif.';
  end if;

  -- 4. Hitung tujuan tiap siswa dari data AWAL (sekali, sebelum ada yang diubah) ---------------
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'class', s.class, 'status', s.status,
           'ke', btrim(coalesce(e.ke, m.ke))
         )), '[]'::jsonb)
    into v_tujuan
  from public.students s
  left join jsonb_to_recordset(p_pemetaan)     as m(dari text, ke text)       on m.dari = s.class
  left join jsonb_to_recordset(p_pengecualian) as e(siswa_id bigint, ke text) on e.siswa_id = s.id
  where s.status = 'aktif';

  select count(*) filter (where t.ke <> c_lulus and t.ke <> t.class),
         count(*) filter (where t.ke <> c_lulus and t.ke =  t.class),
         count(*) filter (where t.ke = c_lulus)
    into v_naik, v_tetap, v_lulus
  from jsonb_to_recordset(v_tujuan) as t(id bigint, class text, status text, ke text);

  v_snapshot := v_tujuan;

  -- 5. Terapkan. Trigger sinkron_riwayat_siswa dilewati: riwayat tapel baru kita tulis sendiri
  --    di bawah, dan riwayat tapel lama TIDAK boleh tertimpa kelas baru. ---------------------------
  perform set_config('app.lewati_riwayat', '1', true);

  -- kelas tujuan yang belum ada di master → didaftarkan
  insert into public.kelas_master (nama)
  select distinct t.ke
  from jsonb_to_recordset(v_tujuan) as t(id bigint, class text, status text, ke text)
  where t.ke <> c_lulus
  on conflict (nama) do nothing;

  insert into public.tahun_pelajaran (nama) values (p_tapel_tujuan) on conflict (nama) do nothing;

  -- riwayat tapel baru: siswa yang lanjut; yang lulus tidak punya baris di tapel baru
  delete from public.riwayat_kelas r
  using jsonb_to_recordset(v_tujuan) as t(id bigint, class text, status text, ke text)
  where r.tapel = p_tapel_tujuan and r.siswa_id = t.id and t.ke = c_lulus;

  insert into public.riwayat_kelas (siswa_id, tapel, kelas)
  select t.id, p_tapel_tujuan, t.ke
  from jsonb_to_recordset(v_tujuan) as t(id bigint, class text, status text, ke text)
  where t.ke <> c_lulus
  on conflict (siswa_id, tapel) do update set kelas = excluded.kelas;

  -- satu UPDATE berbasis id → tidak ada efek berantai
  update public.students s
  set class  = case when t.ke = c_lulus then s.class else t.ke end,
      status = case when t.ke = c_lulus then 'lulus' else s.status end
  from jsonb_to_recordset(v_tujuan) as t(id bigint, class text, status text, ke text)
  where s.id = t.id and (t.ke = c_lulus or t.ke <> s.class);

  -- tapel & semester aktif berpindah
  update public.absensi_setting set tapel = p_tapel_tujuan, semester = p_semester where id = v_setting_id;

  insert into public.kenaikan_kelas (
    tapel_asal, semester_asal, tapel_tujuan, semester_tujuan, dibuat_oleh,
    jumlah_naik, jumlah_tetap, jumlah_lulus, pemetaan, snapshot
  ) values (
    v_asal, v_sem_asal, p_tapel_tujuan, p_semester, p_user_id,
    v_naik, v_tetap, v_lulus, p_pemetaan, v_snapshot
  ) returning id into v_id;

  return query select v_id, v_naik, v_tetap, v_lulus;
end;
$$;

-- Batalkan kenaikan kelas TERAKHIR yang belum dibatalkan. Hanya bisa selama tapel tujuan masih
-- aktif dan belum punya absensi (belum ada yang terlanjur tercatat di tapel baru).
-- Siswa yang kelas/statusnya sudah diubah manual sesudah kenaikan TIDAK dikembalikan.
create or replace function public.batalkan_kenaikan_kelas(p_id bigint default null)
returns table (tapel_dikembalikan text, siswa_dikembalikan integer)
language plpgsql
as $$
declare
  c_lulus      constant text := '__lulus__';
  v_setting_id bigint;
  v_tapel      text;
  v_terakhir   bigint;
  k            public.kenaikan_kelas%rowtype;
  n            integer;
begin
  select max(id) into v_terakhir from public.kenaikan_kelas where dibatalkan_pada is null;
  if v_terakhir is null then
    raise exception 'Tidak ada kenaikan kelas yang bisa dibatalkan.';
  end if;
  if p_id is not null and p_id <> v_terakhir then
    raise exception 'Hanya kenaikan kelas terakhir yang bisa dibatalkan.';
  end if;

  select * into k from public.kenaikan_kelas where id = v_terakhir for update;

  select id, tapel into v_setting_id, v_tapel from public.absensi_setting order by id limit 1 for update;
  if v_tapel is distinct from k.tapel_tujuan then
    raise exception 'Tahun pelajaran aktif sudah berubah dari % ; kenaikan kelas tidak bisa dibatalkan.', k.tapel_tujuan;
  end if;
  if exists (select 1 from public.absensi where tapel = k.tapel_tujuan) then
    raise exception 'Tahun pelajaran % sudah punya data absensi; kenaikan kelas tidak bisa dibatalkan.', k.tapel_tujuan;
  end if;

  perform set_config('app.lewati_riwayat', '1', true);

  update public.students s
  set class = x.class, status = x.status
  from jsonb_to_recordset(k.snapshot) as x(id bigint, class text, status text, ke text)
  where s.id = x.id
    and (
      (x.ke = c_lulus and s.status = 'lulus')
      or (x.ke <> c_lulus and s.status = 'aktif' and s.class = x.ke)
    )
    and (s.class is distinct from x.class or s.status is distinct from x.status);
  get diagnostics n = row_count;

  delete from public.riwayat_kelas where tapel = k.tapel_tujuan;

  update public.absensi_setting set tapel = k.tapel_asal, semester = k.semester_asal where id = v_setting_id;

  -- siswa aktif yang belum punya baris di tapel asal (mis. siswa baru yang masuk sesudah kenaikan)
  insert into public.riwayat_kelas (siswa_id, tapel, kelas)
  select s.id, k.tapel_asal, s.class from public.students s where s.status = 'aktif'
  on conflict (siswa_id, tapel) do nothing;

  update public.kenaikan_kelas set dibatalkan_pada = now() where id = k.id;

  return query select k.tapel_asal, n;
end;
$$;

revoke all on function public.naik_kelas(text, text, jsonb, jsonb, integer, bigint) from public, anon, authenticated;
revoke all on function public.batalkan_kenaikan_kelas(bigint)                       from public, anon, authenticated;
grant execute on function public.naik_kelas(text, text, jsonb, jsonb, integer, bigint) to service_role;
grant execute on function public.batalkan_kenaikan_kelas(bigint)                       to service_role;
