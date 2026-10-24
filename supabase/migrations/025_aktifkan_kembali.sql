-- 025_aktifkan_kembali.sql
-- Mengaktifkan kembali siswa nonaktif TANPA menghapus informasi, dengan dua mode eksplisit.
--
-- Masalah: UPDATE students SET status='aktif' (lewat trigger sinkron_riwayat_siswa, migrasi 020)
-- mengosongkan tanggal pindah & alasan. Catatan "kapan siswa keluar" hilang, dan hari antara
-- tanggal pindah dan hari ini tidak punya catatan sehingga angka rekap tidak konsisten.
--
-- Isi migrasi (aditif, aman dijalankan ulang):
--   1. tabel riwayat_status_siswa  : satu baris per KEJADIAN aktif-kembali (tidak pernah dihapus aplikasi)
--   2. trigger sinkron_riwayat_siswa: jaring pengaman. Kalau status diubah ke 'aktif' TANPA lewat
--      aktifkan_siswa(), tanggal & alasan lama tetap disalin ke riwayat sebelum dikosongkan
--   3. hari_belum_tercatat()        : hari sekolah (bukan Minggu/libur) tanpa record absensi siswa itu
--   4. pratinjau_aktifkan_siswa()   : dampak SEBELUM admin mengonfirmasi (hanya baca)
--   5. aktifkan_siswa()             : mode 'batal_pindah' (A) atau 'kembali_setelah_jeda' (B), satu transaksi
--   6. hari_dihitung_siswa()        : SATU aturan hitung hari per siswa (pindah + jeda), untuk rekap
--   7. rekap_history_siswa()        : ikut mengecualikan hari jeda mode B
--
-- Arti mode:
--   batal_pindah         (A) tidak jadi pindah / salah input. Semua hari dihitung penuh. Hari sekolah dari
--                            tanggal pindah s.d. KEMARIN yang belum punya record diisi 'alpha' (scan_oleh='admin',
--                            tampil sebagai "otomatis") supaya angka semua rekap sama. Hari ini tidak diisi.
--   kembali_setelah_jeda (B) siswa keluar lalu kembali di tapel yang sama. Hari [tanggal pindah, tanggal kembali)
--                            TIDAK dihitung dan tidak tampil; hitungan lanjut mulai tanggal kembali.
--   lintas_tapel             (otomatis) pindah di tapel lama, diaktifkan di tapel baru: baris tapel lama
--                            dibiarkan utuh. Dipilih sendiri oleh fungsi; parameter p_mode diabaikan.
--   langsung                 (jaring pengaman) status diubah langsung tanpa fungsi ini.
-- Prasyarat: migrasi 020 dan 024. Jalankan BERSAMAAN dengan deploy kode yang memakainya.

create extension if not exists btree_gist;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'riwayat_kelas' and column_name = 'nonaktif_pada'
  ) then
    raise exception 'Prasyarat belum terpenuhi: migrasi 020 belum dijalankan.';
  end if;
end $$;

-- 1. TABEL RIWAYAT -----------------------------------------------------------------------

create table if not exists public.riwayat_status_siswa (
  id                bigint generated always as identity primary key,
  siswa_id          bigint not null references public.students (id) on delete cascade,
  tapel             text   not null,                      -- tapel baris riwayat_kelas tempat tanggal pindah tersimpan
  alasan            text   check (alasan in ('lulus', 'pindah')),
  pindah_pada       date,                                 -- tanggal pindah SEBELUM dikosongkan (null = tidak pernah punya tanggal)
  kembali_pada      date,                                 -- hanya mode kembali_setelah_jeda
  mode              text   not null check (mode in ('batal_pindah', 'kembali_setelah_jeda', 'lintas_tapel', 'langsung')),
  hari_alpha_diisi  integer not null default 0 check (hari_alpha_diisi >= 0),
  dikonfirmasi_oleh bigint references public.users (id) on delete set null,
  dikonfirmasi_pada timestamptz not null default now(),
  catatan           text,
  constraint riwayat_status_jeda_check check (
    mode <> 'kembali_setelah_jeda'
    or (pindah_pada is not null and kembali_pada is not null and kembali_pada > pindah_pada)
  ),
  -- dua jeda siswa yang sama pada tapel yang sama tidak boleh tumpang tindih
  constraint riwayat_status_jeda_tidak_tumpang exclude using gist (
    siswa_id with =, tapel with =, daterange(pindah_pada, kembali_pada) with &&
  ) where (mode = 'kembali_setelah_jeda')
);

create index if not exists idx_riwayat_status_siswa on public.riwayat_status_siswa (siswa_id, tapel);

alter table public.riwayat_status_siswa enable row level security;
revoke all on public.riwayat_status_siswa from anon, authenticated;

comment on table public.riwayat_status_siswa is
  'Riwayat aktif-kembali siswa. Menyimpan tanggal pindah yang dulu hilang saat diaktifkan. Hanya fungsi aktifkan_siswa()/trigger yang menulis; jangan dihapus aplikasi.';

-- 2. TRIGGER: JARING PENGAMAN ------------------------------------------------------------
-- Sama seperti versi 020, ditambah: aktifnya kembali di luar aktifkan_siswa() menyalin tanggal & alasan
-- ke riwayat_status_siswa SEBELUM dikosongkan. aktifkan_siswa() menandai dirinya dengan app.aktifkan_siswa=1.

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
    if tg_op = 'UPDATE' and old.status <> 'aktif'
       and coalesce(current_setting('app.aktifkan_siswa', true), '') <> '1' then
      insert into public.riwayat_status_siswa (siswa_id, tapel, alasan, pindah_pada, mode, catatan)
      select new.id, r.tapel, r.alasan_nonaktif, r.nonaktif_pada, 'langsung',
             'Status diubah langsung tanpa aktifkan_siswa(); tanggal pindah disalin sebelum dikosongkan.'
      from public.riwayat_kelas r
      where r.siswa_id = new.id and r.tapel = v_tapel and r.alasan_nonaktif is not null;
    end if;

    insert into public.riwayat_kelas (siswa_id, tapel, kelas)
    values (new.id, v_tapel, new.class)
    on conflict (siswa_id, tapel) do update
      set kelas = excluded.kelas,
          nonaktif_pada = null,
          alasan_nonaktif = null;
  else
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

-- 3. HARI SEKOLAH TANPA RECORD -----------------------------------------------------------
-- "Hari sekolah" = tanggal yang punya absensi siswa mana pun di tapel itu, bukan Minggu, bukan libur
-- (definisi yang sama dengan hari_efektif, migrasi 013). Rentang [p_dari, p_sampai) eksklusif di ujung.

-- Semester tiap hari diambil dari record tapel yang SAMA pada tanggal itu (terbanyak; seri -> urut abjad),
-- cadangan kalender (Jul-Des ganjil, Jan-Jun genap). Tapel selalu = p_tapel, TIDAK ditebak dari mayoritas
-- semua record tanggal itu (absensi_periode_tanggal bisa memilih tapel lain bila ada data campuran).

drop function if exists public.hari_belum_tercatat(bigint, text, date, date);

create function public.hari_belum_tercatat(p_siswa bigint, p_tapel text, p_dari date, p_sampai date)
returns table (tanggal date, semester text)
language sql
stable
as $$
  select h.tanggal,
         coalesce(
           (select a2.semester from public.absensi a2
             where a2.tapel = p_tapel and a2.tanggal = h.tanggal and a2.semester in ('ganjil', 'genap')
             group by a2.semester order by count(*) desc, a2.semester limit 1),
           case when extract(month from h.tanggal) >= 7 then 'ganjil' else 'genap' end)
  from (
    select distinct a.tanggal
    from public.absensi a
    where a.tapel = p_tapel
      and a.tanggal >= p_dari
      and a.tanggal <  p_sampai
      and extract(isodow from a.tanggal) <> 7
      and not exists (select 1 from public.hari_libur l where l.tanggal = a.tanggal)
  ) h
  where not exists (select 1 from public.absensi x where x.siswa_id = p_siswa and x.tanggal = h.tanggal)
  order by h.tanggal;
$$;

-- 4. PRATINJAU (hanya baca) --------------------------------------------------------------
-- Dipakai modal sebelum konfirmasi. p_kembali kosong = hanya data mode A; terisi = juga data mode B.

create or replace function public.pratinjau_aktifkan_siswa(p_id bigint, p_kembali date default null)
returns jsonb
language plpgsql
stable
as $$
declare
  v_hari          date := (now() at time zone 'Asia/Jakarta')::date;
  v_s             record;
  v_tapel_aktif   text;
  v_r             record;
  v_lintas        boolean;
  v_hari_a        integer := 0;
  v_hari_jeda     integer := null;
  v_kelas_pindah  text;
begin
  select name, class, status, nisn into v_s from public.students where id = p_id;
  if not found then raise exception 'Siswa tidak ditemukan.'; end if;
  if v_s.status = 'aktif' then raise exception 'Siswa ini sudah aktif.'; end if;

  select tapel into v_tapel_aktif from public.absensi_setting order by id limit 1;

  select tapel, kelas, nonaktif_pada, alasan_nonaktif into v_r
  from public.riwayat_kelas where siswa_id = p_id order by tapel desc limit 1;

  v_lintas := v_r.tapel is distinct from v_tapel_aktif;
  v_kelas_pindah := v_r.kelas;

  if not v_lintas and v_r.nonaktif_pada is not null then
    select count(*)::integer into v_hari_a
    from public.hari_belum_tercatat(p_id, v_tapel_aktif, v_r.nonaktif_pada, v_hari);

    if p_kembali is not null and p_kembali > v_r.nonaktif_pada and p_kembali <= v_hari then
      select count(distinct a.tanggal)::integer into v_hari_jeda
      from public.absensi a
      where a.tapel = v_tapel_aktif
        and a.tanggal >= v_r.nonaktif_pada and a.tanggal < p_kembali
        and extract(isodow from a.tanggal) <> 7
        and not exists (select 1 from public.hari_libur l where l.tanggal = a.tanggal);
    end if;
  end if;

  return jsonb_build_object(
    'nama',                 v_s.name,
    'status',               v_s.status,
    'alasan',               coalesce(v_r.alasan_nonaktif, v_s.status),
    'kelas_sekarang',       v_s.class,
    'kelas_saat_pindah',    v_kelas_pindah,
    'tapel_pindah',         v_r.tapel,
    'tapel_aktif',          v_tapel_aktif,
    'pindah_pada',          v_r.nonaktif_pada,
    'lintas_tapel',         v_lintas,
    'hari_ini',             v_hari,
    'hari_belum_tercatat',  v_hari_a,
    'hari_jeda',            v_hari_jeda,
    'nisn_bentrok',         (v_s.nisn is not null and exists (
                               select 1 from public.students x
                               where x.nisn = v_s.nisn and x.status = 'aktif' and x.id <> p_id))
  );
end;
$$;

-- 5. AKTIFKAN KEMBALI --------------------------------------------------------------------

create or replace function public.aktifkan_siswa(
  p_id       bigint,
  p_mode     text,
  p_kembali  date    default null,
  p_admin_id bigint  default null
)
returns jsonb
language plpgsql
as $$
declare
  v_hari          date := (now() at time zone 'Asia/Jakarta')::date;
  v_s             record;
  v_tapel_aktif   text;
  v_r             record;
  v_mode          text;
  v_isi           integer := 0;
  v_alasan        text;
begin
  if p_mode is null or p_mode not in ('batal_pindah', 'kembali_setelah_jeda') then
    raise exception 'Mode tidak valid: %', p_mode;
  end if;

  select name, class, status into v_s from public.students where id = p_id for update;
  if not found then raise exception 'Siswa tidak ditemukan.'; end if;
  if v_s.status = 'aktif' then raise exception 'Siswa ini sudah aktif.'; end if;

  select tapel into v_tapel_aktif from public.absensi_setting order by id limit 1;
  if v_tapel_aktif is null or v_tapel_aktif = '' then
    raise exception 'Tapel aktif belum diatur.';
  end if;

  select tapel, nonaktif_pada, alasan_nonaktif into v_r
  from public.riwayat_kelas where siswa_id = p_id order by tapel desc limit 1;

  v_alasan := coalesce(v_r.alasan_nonaktif, v_s.status);
  v_mode   := case when v_r.tapel is distinct from v_tapel_aktif then 'lintas_tapel' else p_mode end;

  if v_mode = 'kembali_setelah_jeda' then
    if v_r.nonaktif_pada is null then
      raise exception 'Siswa ini tidak punya tanggal pindah di tapel aktif; pilih mode batal_pindah.';
    end if;
    if p_kembali is null or p_kembali <= v_r.nonaktif_pada then
      raise exception 'Tanggal kembali harus sesudah tanggal pindah (%).', v_r.nonaktif_pada;
    end if;
    if p_kembali > v_hari then
      raise exception 'Tanggal kembali tidak boleh di masa depan.';
    end if;
  end if;

  -- menandai: trigger tidak perlu membuat baris riwayat 'langsung' (fungsi ini yang mencatat)
  perform set_config('app.aktifkan_siswa', '1', true);

  update public.students set status = 'aktif' where id = p_id;   -- trigger: baris tapel aktif, tanggal dikosongkan
  perform set_config('app.aktifkan_siswa', '', true);            -- flag hanya berlaku untuk UPDATE di atas, tidak bocor ke sisa transaksi

  if v_mode = 'batal_pindah' and v_r.nonaktif_pada is not null then
    with isi as (
      insert into public.absensi (siswa_id, tanggal, status, keterangan, tapel, semester, scan_oleh)
      select p_id, d.tanggal, 'alpha',
             'Diisi sistem saat siswa diaktifkan kembali (belum ada catatan)',
             v_tapel_aktif, d.semester, 'admin'
      from public.hari_belum_tercatat(p_id, v_tapel_aktif, v_r.nonaktif_pada, v_hari) d
      on conflict (siswa_id, tanggal) do nothing
      returning 1
    )
    select count(*)::integer into v_isi from isi;
  end if;

  insert into public.riwayat_status_siswa
    (siswa_id, tapel, alasan, pindah_pada, kembali_pada, mode, hari_alpha_diisi, dikonfirmasi_oleh)
  values
    (p_id, coalesce(v_r.tapel, v_tapel_aktif), v_alasan, v_r.nonaktif_pada,
     case when v_mode = 'kembali_setelah_jeda' then p_kembali end,
     v_mode, v_isi, p_admin_id);

  insert into public.log_aktivitas (admin_id, aksi, target, keterangan)
  values (
    p_admin_id, 'aktifkan_siswa', v_s.name,
    format('Mengaktifkan kembali siswa "%s" (Kelas %s), mode %s%s%s.',
           v_s.name, v_s.class, v_mode,
           case when v_r.nonaktif_pada is not null then ', pindah sejak ' || v_r.nonaktif_pada else '' end,
           case v_mode
             when 'batal_pindah'         then ', ' || v_isi || ' hari diisi Alpha'
             when 'kembali_setelah_jeda' then ', kembali ' || p_kembali
             else ''
           end)
  );

  return jsonb_build_object(
    'mode', v_mode, 'pindah_pada', v_r.nonaktif_pada, 'kembali_pada',
    case when v_mode = 'kembali_setelah_jeda' then p_kembali end,
    'hari_alpha_diisi', v_isi, 'lintas_tapel', v_mode = 'lintas_tapel'
  );
end;
$$;

-- 5b. UBAH TANGGAL PINDAH: SERIAL DENGAN AKTIFKAN/NONAKTIFKAN -----------------------------
-- Versi 021 membaca status tanpa kunci, sehingga bisa mengubah tanggal pindah SAAT aktifkan_siswa()
-- sedang berjalan untuk siswa yang sama (alpha terisi dari tanggal lama). Sekarang baris siswa dikunci.

create or replace function public.ubah_tanggal_keluar(p_id bigint, p_tanggal date)
returns void
language plpgsql
as $$
declare
  v_status text;
  v_tapel  text;
begin
  select status into v_status from public.students where id = p_id for update;
  if not found then
    raise exception 'Siswa tidak ditemukan.';
  end if;
  if v_status = 'aktif' then
    raise exception 'Siswa ini masih aktif; tanggal keluar hanya untuk siswa non-aktif.';
  end if;
  if p_tanggal is not null and p_tanggal > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Tanggal keluar tidak boleh di masa depan.';
  end if;

  select max(tapel) into v_tapel from public.riwayat_kelas where siswa_id = p_id;
  if v_tapel is null then
    raise exception 'Siswa ini tidak punya riwayat kelas.';
  end if;

  update public.riwayat_kelas
  set nonaktif_pada = p_tanggal,
      alasan_nonaktif = coalesce(alasan_nonaktif, v_status)
  where siswa_id = p_id and tapel = v_tapel;
end;
$$;

-- 6. SATU ATURAN HITUNG ------------------------------------------------------------------
-- Hari yang DIHITUNG per siswa pada satu semester = hari efektif semester
--   - hari pada/sesudah tanggal pindah yang masih berlaku (riwayat_kelas.nonaktif_pada, eksklusif)
--   - hari jeda mode B yang sudah ditutup [pindah_pada, kembali_pada)
-- Dipakai untuk penyebut persentase. Siswa tanpa baris riwayat di tapel itu tidak dikembalikan.

create or replace function public.hari_dihitung_siswa(p_tapel text, p_semester text, p_ids bigint[])
returns table (siswa_id bigint, hari integer)
language sql
stable
as $$
  with hari as (
    select distinct a.tanggal
    from public.absensi a
    where a.tapel = p_tapel
      and a.semester = p_semester
      and extract(isodow from a.tanggal) <> 7
      and not exists (select 1 from public.hari_libur l where l.tanggal = a.tanggal)
  )
  select r.siswa_id, count(h.tanggal)::integer
  from public.riwayat_kelas r
  cross join hari h
  where r.tapel = p_tapel
    and r.siswa_id = any (p_ids)
    and (r.nonaktif_pada is null or h.tanggal < r.nonaktif_pada)
    and not exists (
      select 1 from public.riwayat_status_siswa g
      where g.siswa_id = r.siswa_id and g.tapel = p_tapel
        and g.mode = 'kembali_setelah_jeda'
        and h.tanggal >= g.pindah_pada and h.tanggal < g.kembali_pada
    )
  group by r.siswa_id;
$$;

-- 7. AGREGAT SEMESTER: IKUT MENGECUALIKAN JEDA --------------------------------------------

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
    and not exists (
      select 1 from public.riwayat_status_siswa g
      where g.siswa_id = a.siswa_id and g.tapel = p_tapel
        and g.mode = 'kembali_setelah_jeda'
        and a.tanggal >= g.pindah_pada and a.tanggal < g.kembali_pada
    )
  group by a.siswa_id, a.status;
$$;

-- 8. HAK AKSES ---------------------------------------------------------------------------

revoke all on function public.hari_belum_tercatat(bigint, text, date, date)      from public, anon, authenticated;
revoke all on function public.ubah_tanggal_keluar(bigint, date)                  from public, anon, authenticated;
grant execute on function public.ubah_tanggal_keluar(bigint, date)               to service_role;
revoke all on function public.pratinjau_aktifkan_siswa(bigint, date)             from public, anon, authenticated;
revoke all on function public.aktifkan_siswa(bigint, text, date, bigint)         from public, anon, authenticated;
revoke all on function public.hari_dihitung_siswa(text, text, bigint[])          from public, anon, authenticated;
revoke all on function public.rekap_history_siswa(text, text, bigint[])          from public, anon, authenticated;
grant execute on function public.hari_belum_tercatat(bigint, text, date, date)   to service_role;
grant execute on function public.pratinjau_aktifkan_siswa(bigint, date)          to service_role;
grant execute on function public.aktifkan_siswa(bigint, text, date, bigint)      to service_role;
grant execute on function public.hari_dihitung_siswa(text, text, bigint[])       to service_role;
grant execute on function public.rekap_history_siswa(text, text, bigint[])       to service_role;
