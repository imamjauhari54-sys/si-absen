-- 019_edit_manual_pulihkan.sql
-- Edit manual absensi yang aman + tombol "Pulihkan" (kembalikan persis seperti sebelum edit).
--
-- Ide dasarnya:
--   1. absensi.rev  : nomor versi baris, dinaikkan OTOMATIS oleh trigger pada SETIAP UPDATE (scan
--      pulang, koreksi scan offline, edit manual, dst.). Kode lain tidak perlu diubah.
--   2. absensi_edit_manual : satu baris per (siswa, tanggal) per edit manual. Menyimpan kondisi
--      SEBELUM edit (sebelum; NULL = baris absensi belum ada) dan identitas baris SESUDAH edit
--      (absensi_id + rev_sesudah). Sekaligus menjadi audit: siapa, kapan, data lama, sudah dipulihkan?
--   3. Pulihkan membawa ID edit yang DIKONFIRMASI pengguna (p_edit_id). Pulihkan hanya diterima kalau
--      (a) edit itu MASIH edit manual terakhir untuk siswa+tanggal tsb (kalau sudah ada edit yang lebih
--      baru -> ditolak, edit terbaru TIDAK ikut dipulihkan diam-diam) dan (b) baris absensi sekarang
--      MASIH sama dengan hasil edit itu (id & rev sama). Kalau ada proses lain yang mengubahnya setelah
--      itu, rev sudah naik -> ditolak.
--   4. Edit dan Pulihkan dikerjakan di dalam fungsi SQL (satu transaksi, baris dikunci FOR UPDATE),
--      jadi snapshot, perubahan, dan log tidak mungkin setengah jadi.
--
-- Aturan edit manual (di edit_manual_absensi):
--   * hadir / terlambat  : jam_masuk & jam_pulang yang sudah ada DIPERTAHANKAN (baris baru: kosong).
--                          Mengubah kembali ke hadir TIDAK membuat jam otomatis.
--   * izin / sakit / alpha: jam_masuk & jam_pulang DIKOSONGKAN.
--   * scan_oleh          : TIDAK PERNAH diubah/diisi oleh edit manual. Baris yang sudah ada
--                          mempertahankan nilainya; baris baru dari edit manual berisi NULL (bukan
--                          hasil pemindaian). Identitas pengedit ada di absensi_edit_manual dan
--                          log_aktivitas.
--   * Edit manual tidak mengirim WhatsApp (fungsi ini murni database).
--
-- Aturan PERIODE (tapel & semester):
--   * Baris absensi yang SUDAH ADA: tapel & semester-nya dipertahankan apa adanya.
--   * Baris BARU: periode ditentukan PER TANGGAL oleh absensi_periode_tanggal() (bagian 4), BUKAN
--     dari setting aktif (absensi_setting). Aturannya eksplisit di komentar fungsi itu.
--   * Baris baru hanya dibuat kalau siswa punya baris riwayat_kelas pada tapel hasil penentuan itu
--     (kalau tidak, baris tidak akan muncul di Rekap); selain itu edit DITOLAK dengan kode EM001.
--
-- Prasyarat: migrasi 016 (riwayat_kelas). Aman dijalankan ulang (idempotent).
-- Tidak menyentuh migrasi 020 dan tidak mengubah default privileges.

-- ─────────────────────────────────────────────────────────────────────
-- 0. Prasyarat
-- ─────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.riwayat_kelas') is null then
    raise exception 'Prasyarat belum terpenuhi: tabel riwayat_kelas (migrasi 016) belum ada.';
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Nomor versi baris absensi
-- ─────────────────────────────────────────────────────────────────────
alter table public.absensi add column if not exists rev integer not null default 1;

create or replace function public.absensi_naikkan_rev()
returns trigger
language plpgsql
as $$
begin
  new.rev := old.rev + 1;
  return new;
end;
$$;

drop trigger if exists trg_absensi_naikkan_rev on public.absensi;
create trigger trg_absensi_naikkan_rev
  before update on public.absensi
  for each row execute function public.absensi_naikkan_rev();

-- ─────────────────────────────────────────────────────────────────────
-- 2. Masa pemulihan (hari). Bawaan 7; ubah lewat SQL:
--      update absensi_setting set masa_pulihkan_hari = 14;
-- ─────────────────────────────────────────────────────────────────────
alter table public.absensi_setting add column if not exists masa_pulihkan_hari integer not null default 7;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'absensi_setting_masa_pulihkan_chk') then
    alter table public.absensi_setting
      add constraint absensi_setting_masa_pulihkan_chk check (masa_pulihkan_hari between 1 and 90);
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────
-- 3. Riwayat edit manual (snapshot + audit)
--    Hak akses tabel ini diatur eksplisit di bagian 8.
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.absensi_edit_manual (
  id               bigint generated always as identity primary key,
  batch_id         uuid not null default gen_random_uuid(),     -- satu kali submit (bisa banyak tanggal)
  siswa_id         bigint not null references public.students (id) on delete cascade,
  tanggal          date not null,
  editor_id        bigint references public.users (id) on delete set null,
  editor_nama      text,
  diedit_at        timestamptz not null default now(),
  sebelum          jsonb,                                        -- NULL = baris absensi belum ada sebelum edit
  sesudah          jsonb not null,                               -- kondisi tepat setelah edit (untuk audit)
  absensi_id       bigint not null,                              -- id baris absensi hasil edit
  rev_sesudah      integer not null,                             -- rev baris tepat setelah edit
  dipulihkan_at    timestamptz,
  dipulihkan_oleh  bigint references public.users (id) on delete set null,
  dipulihkan_nama  text
);

create index if not exists idx_absensi_edit_manual_siswa_tgl
  on public.absensi_edit_manual (siswa_id, tanggal, id desc);

-- RLS aktif tanpa policy = anon/authenticated tidak bisa apa-apa (service_role melewati RLS).
alter table public.absensi_edit_manual enable row level security;

-- ─────────────────────────────────────────────────────────────────────
-- 4. Helper
-- ─────────────────────────────────────────────────────────────────────

-- Semua kolom yang dipulihkan. Daftarnya eksplisit supaya kolom baru tidak ikut terbawa diam-diam.
create or replace function public.absensi_snapshot(a public.absensi)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'status',     a.status,
    'jam_masuk',  a.jam_masuk,
    'jam_pulang', a.jam_pulang,
    'keterangan', a.keterangan,
    'lampiran',   a.lampiran,
    'scan_oleh',  a.scan_oleh,
    'scanner_id', a.scanner_id,
    'tapel',      a.tapel,
    'semester',   a.semester
  );
$$;

-- Ringkasan satu baris untuk teks log, mis. "Hadir · masuk 07:15 · pulang 14:00".
create or replace function public.absensi_ringkas(j jsonb)
returns text
language sql
stable
as $$
  select case
    when j is null then 'belum ada data absensi'
    else initcap(j ->> 'status')
      || coalesce(' · masuk '  || to_char((j ->> 'jam_masuk')::time,  'HH24:MI'), '')
      || coalesce(' · pulang ' || to_char((j ->> 'jam_pulang')::time, 'HH24:MI'), '')
      || coalesce(' · ket: '   || (j ->> 'keterangan'), '')
      || case when j ->> 'lampiran' is not null then ' · ada lampiran' else '' end
  end;
$$;

-- Periode (tapel & semester) untuk baris absensi BARU pada suatu tanggal.
--
-- ATURAN (eksplisit, setting aktif TIDAK dipakai):
--   TAPEL
--     1. Ada baris absensi lain pada tanggal itu dengan tapel berformat valid ("YYYY/YYYY", tahun kedua
--        = tahun pertama + 1)? Pakai tapel yang paling banyak dipakai (seri -> tapel terbaru).
--        Ini pola yang sama dengan tapelUntukTanggal() di Rekap: tapel di record mengikuti setting
--        saat scan, jadi bisa berbeda dari kalender.                                -> sumber 'record'
--     2. Tidak ada -> dari KALENDER (Jul-Des: tahun ini/tahun depan, Jan-Jun: tahun lalu/tahun ini),
--        sama dengan tapelDariTanggal() di src/lib/utils/tapel.ts.                  -> sumber 'kalender'
--   SEMESTER (belum ada mekanisme historis khusus semester, jadi diputuskan terpisah dari tapel)
--     1. Ada baris pada tanggal itu dengan tapel yang SAMA dengan tapel terpilih dan semester 'ganjil'/
--        'genap'? Pakai yang paling banyak (seri -> urut abjad).                    -> sumber 'record'
--     2. Tidak ada (termasuk kalau tapel berasal dari kalender) -> dari KALENDER:
--        Jul-Des = 'ganjil', Jan-Jun = 'genap' (semesterDariTanggal() di utils/tapel.ts).
--                                                                                   -> sumber 'kalender'
--   Jadi semester kalender BUKAN dianggap identik dengan semester yang pernah tersimpan: kalau record
--   tanggal itu punya semester, itulah yang dipakai; kalender hanya fallback.
create or replace function public.absensi_periode_tanggal(p_tanggal date)
returns table (o_tapel text, o_semester text, o_sumber_tapel text, o_sumber_semester text)
language plpgsql
stable
as $$
declare
  v_tahun    integer := extract(year  from p_tanggal)::integer;
  v_bulan    integer := extract(month from p_tanggal)::integer;
  v_mulai    integer;
  v_tapel    text;
  v_semester text;
begin
  -- TAPEL dari record. CASE dipakai supaya cast ::int tidak pernah dievaluasi untuk format salah.
  select a.tapel into v_tapel
    from public.absensi a
   where a.tanggal = p_tanggal
     and case
           when a.tapel ~ '^\d{4}/\d{4}$'
             then split_part(a.tapel, '/', 2)::integer = split_part(a.tapel, '/', 1)::integer + 1
           else false
         end
   group by a.tapel
   order by count(*) desc, a.tapel desc
   limit 1;

  if v_tapel is not null then
    o_sumber_tapel := 'record';

    select a.semester into v_semester
      from public.absensi a
     where a.tanggal = p_tanggal
       and a.tapel = v_tapel
       and a.semester in ('ganjil', 'genap')
     group by a.semester
     order by count(*) desc, a.semester
     limit 1;
  else
    v_mulai := case when v_bulan >= 7 then v_tahun else v_tahun - 1 end;
    v_tapel := v_mulai::text || '/' || (v_mulai + 1)::text;
    o_sumber_tapel := 'kalender';
  end if;

  if v_semester is not null then
    o_sumber_semester := 'record';
  else
    v_semester := case when v_bulan >= 7 then 'ganjil' else 'genap' end;
    o_sumber_semester := 'kalender';
  end if;

  o_tapel    := v_tapel;
  o_semester := v_semester;
  return next;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 5. Edit manual (satu siswa, satu atau banyak tanggal, SATU transaksi)
--    p_lampiran: NULL = jangan ubah, '' = hapus lampiran, selain itu = URL baru.
--    Periode TIDAK lagi dikirim dari aplikasi (parameter p_tapel/p_semester dihapus): ditentukan di
--    sini per tanggal lewat absensi_periode_tanggal().
--    Hasil per tanggal: o_diubah, dan o_periode_baru (jsonb: tapel, semester, sumber_tapel,
--    sumber_semester) HANYA kalau baris baru dibuat; NULL kalau baris sudah ada.
--    Galat EM001 = siswa tidak punya riwayat_kelas pada tapel hasil penentuan (tidak ada yang tersimpan).
-- ─────────────────────────────────────────────────────────────────────

-- Versi lama (9 argumen, periode dari aplikasi) dibuang supaya tidak ada dua fungsi yang bersaing.
drop function if exists public.edit_manual_absensi(bigint, date[], text, text, text, bigint, text, text, text);

create or replace function public.edit_manual_absensi(
  p_siswa_id    bigint,
  p_tanggal     date[],
  p_status      text,
  p_keterangan  text,
  p_lampiran    text,
  p_editor_id   bigint,
  p_editor_nama text
)
returns table (o_tanggal date, o_diubah boolean, o_periode_baru jsonb)
language plpgsql
as $$
declare
  v_tgl         date;
  v_a           public.absensi%rowtype;
  v_baru        public.absensi%rowtype;
  v_p           record;
  v_ada         boolean;
  v_sebelum     jsonb;
  v_status_lama text;
  v_ket         text := nullif(btrim(coalesce(p_keterangan, '')), '');
  v_lamp        text;
  v_jam_masuk   time;
  v_jam_pulang  time;
  v_batch       uuid := gen_random_uuid();
  v_nama        text;
  v_kelas       text;
  v_periode     jsonb;
  v_catatan     text;
begin
  if p_status is null or p_status not in ('hadir', 'terlambat', 'izin', 'sakit', 'alpha') then
    raise exception 'status tidak valid: %', p_status;
  end if;
  if p_tanggal is null or coalesce(array_length(p_tanggal, 1), 0) = 0 then
    raise exception 'daftar tanggal kosong';
  end if;

  select s.name, s.class into v_nama, v_kelas from public.students s where s.id = p_siswa_id;
  if not found then
    raise exception 'siswa tidak ditemukan';
  end if;

  -- Tanggal diurutkan: urutan kunci baris selalu sama, jadi dua edit bersamaan tidak saling buntu.
  for v_tgl in select distinct d from unnest(p_tanggal) as d order by d loop
    v_sebelum     := null;
    v_status_lama := 'Belum Absen';
    v_periode     := null;
    v_catatan     := '';

    select * into v_a from public.absensi a where a.siswa_id = p_siswa_id and a.tanggal = v_tgl for update;
    v_ada := found;

    if not v_ada then
      -- Baris belum ada: periode ditentukan PER TANGGAL (bukan setting aktif), lalu pastikan siswa
      -- punya riwayat kelas pada tapel itu supaya baris baru pasti muncul di Rekap.
      select * into v_p from public.absensi_periode_tanggal(v_tgl);

      if not exists (
        select 1 from public.riwayat_kelas r where r.siswa_id = p_siswa_id and r.tapel = v_p.o_tapel
      ) then
        raise exception using
          errcode = 'EM001',
          message = format(
            'Siswa %s tidak memiliki riwayat kelas pada tapel %s (periode untuk tanggal %s, ditentukan %s). '
            'Absensi baru tidak dibuat karena tidak akan muncul di Rekap. Tidak ada perubahan yang disimpan.',
            v_nama, v_p.o_tapel, to_char(v_tgl, 'DD-MM-YYYY'),
            case when v_p.o_sumber_tapel = 'record'
                 then 'dari data absensi lain pada tanggal itu'
                 else 'dari kalender' end),
          hint = 'Periksa riwayat kelas siswa pada tapel tersebut, atau pilih tanggal di tapel yang sesuai.';
      end if;

      -- Jam SENGAJA kosong (jam hanya berasal dari scan). scan_oleh SENGAJA tidak diisi: baris ini
      -- bukan hasil pemindaian.
      insert into public.absensi (siswa_id, tanggal, status, keterangan, lampiran, tapel, semester)
      values (
        p_siswa_id, v_tgl, p_status, v_ket,
        case when p_lampiran is null or p_lampiran = '' then null else p_lampiran end,
        v_p.o_tapel, v_p.o_semester
      )
      on conflict (siswa_id, tanggal) do nothing
      returning * into v_baru;

      if not found then
        -- Scan/proses lain baru saja membuat baris itu: edit sebagai baris yang sudah ada
        -- (periodenya dipertahankan, v_periode tetap NULL).
        select * into v_a from public.absensi a where a.siswa_id = p_siswa_id and a.tanggal = v_tgl for update;
        v_ada := found;
        if not v_ada then
          raise exception 'konflik penulisan absensi, silakan coba lagi';
        end if;
      else
        v_periode := jsonb_build_object(
          'tapel',           v_p.o_tapel,
          'semester',        v_p.o_semester,
          'sumber_tapel',    v_p.o_sumber_tapel,
          'sumber_semester', v_p.o_sumber_semester
        );
        v_catatan := format(' Baris baru dibuat dengan periode %s %s (tapel %s; semester %s).',
          v_p.o_tapel, v_p.o_semester,
          case when v_p.o_sumber_tapel = 'record' then 'dari data absensi tanggal itu' else 'dari kalender' end,
          case when v_p.o_sumber_semester = 'record' then 'dari data absensi tanggal itu' else 'dari kalender' end);
      end if;
    end if;

    if v_ada then
      v_sebelum     := public.absensi_snapshot(v_a);
      v_status_lama := v_a.status;

      -- hadir/terlambat: jam yang ada dipertahankan. izin/sakit/alpha: jam dikosongkan.
      v_jam_masuk  := case when p_status in ('hadir', 'terlambat') then v_a.jam_masuk  else null end;
      v_jam_pulang := case when p_status in ('hadir', 'terlambat') then v_a.jam_pulang else null end;
      v_lamp := case
        when p_lampiran is null then v_a.lampiran
        when p_lampiran = ''    then null
        else p_lampiran
      end;

      -- Tidak ada yang berubah: jangan membuat riwayat/rev baru (tombol Pulihkan tidak perlu muncul).
      if v_a.status = p_status
         and v_a.jam_masuk  is not distinct from v_jam_masuk
         and v_a.jam_pulang is not distinct from v_jam_pulang
         and v_a.keterangan is not distinct from v_ket
         and v_a.lampiran   is not distinct from v_lamp then
        o_tanggal       := v_tgl;
        o_diubah        := false;
        o_periode_baru  := null;
        return next;
        continue;
      end if;

      -- scan_oleh, tapel, semester, scanner_id TIDAK diubah: baris yang sudah ada tetap apa adanya.
      update public.absensi a
         set status     = p_status,
             jam_masuk  = v_jam_masuk,
             jam_pulang = v_jam_pulang,
             keterangan = v_ket,
             lampiran   = v_lamp
       where a.id = v_a.id
      returning * into v_baru;
    end if;

    insert into public.absensi_edit_manual
      (batch_id, siswa_id, tanggal, editor_id, editor_nama, sebelum, sesudah, absensi_id, rev_sesudah)
    values
      (v_batch, p_siswa_id, v_tgl, p_editor_id, p_editor_nama, v_sebelum, public.absensi_snapshot(v_baru), v_baru.id, v_baru.rev);

    -- Riwayat transisi status (dipakai feed dashboard), seperti perilaku sebelumnya.
    if v_status_lama is distinct from p_status then
      insert into public.absensi_log (admin_id, siswa_id, tanggal_absen, status_lama, status_baru, keterangan)
      values (p_editor_id, p_siswa_id, v_tgl, v_status_lama, p_status, v_ket);
    end if;

    -- Log Aktivitas: SETIAP edit tercatat (juga kalau yang berubah hanya keterangan/lampiran).
    insert into public.log_aktivitas (admin_id, aksi, target, keterangan)
    values (
      p_editor_id, 'edit_absensi', v_nama,
      format('Edit manual absensi %s (Kelas %s), tanggal %s. Sebelum: %s. Sesudah: %s.%s',
             v_nama, v_kelas, to_char(v_tgl, 'DD-MM-YYYY'),
             public.absensi_ringkas(v_sebelum),
             public.absensi_ringkas(public.absensi_snapshot(v_baru)),
             v_catatan)
    );

    o_tanggal       := v_tgl;
    o_diubah        := true;
    o_periode_baru  := v_periode;
    return next;
  end loop;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 6. Pulihkan edit manual yang DIKONFIRMASI pengguna (satu siswa + satu tanggal)
--    p_edit_id = ID edit (o_edit_id dari daftar_bisa_pulihkan) yang dilihat pengguna saat menekan Pulihkan.
--    Kode hasil: ok | tidak_ada_edit | sudah_berubah | sudah_dipulihkan | kedaluwarsa
--      tidak_ada_edit   : tidak ada edit manual sama sekali untuk siswa+tanggal itu
--      sudah_berubah    : p_edit_id BUKAN edit terakhir lagi (sudah ada edit yang lebih baru, atau ID tidak
--                         cocok), ATAU baris absensi diubah proses lain sejak edit itu. Data TIDAK diubah.
--      sudah_dipulihkan : edit itu memang yang terakhir tetapi sudah pernah dipulihkan
--      kedaluwarsa      : lewat masa pemulihan
--    Pemeriksaan p_edit_id dilakukan SETELAH baris dikunci, sehingga kalau edit lain sedang berjalan
--    bersamaan, hasilnya ditentukan dari kondisi yang sudah ter-commit (edit baru -> sudah_berubah).
-- ─────────────────────────────────────────────────────────────────────

-- Versi lama (4 argumen, tanpa ID edit) dibuang supaya tidak ada dua fungsi yang bersaing.
drop function if exists public.pulihkan_edit_manual(bigint, date, bigint, text);

create or replace function public.pulihkan_edit_manual(
  p_siswa_id     bigint,
  p_tanggal      date,
  p_edit_id      bigint,
  p_pemulih_id   bigint,
  p_pemulih_nama text
)
returns table (o_kode text)
language plpgsql
as $$
declare
  v_a      public.absensi%rowtype;
  v_ada    boolean;
  v_e      public.absensi_edit_manual%rowtype;
  v_hari   integer;
  v_nama   text;
  v_kelas  text;
  v_status_pulih text;
begin
  if p_edit_id is null then
    raise exception 'p_edit_id wajib diisi (ID edit yang dikonfirmasi pengguna)';
  end if;

  -- Kunci baris absensi (kalau ada) lebih dulu, lalu baris edit: urutan sama dengan edit_manual_absensi.
  select * into v_a from public.absensi a where a.siswa_id = p_siswa_id and a.tanggal = p_tanggal for update;
  v_ada := found;

  -- Hanya edit manual TERAKHIR yang dipertimbangkan.
  select * into v_e
    from public.absensi_edit_manual e
   where e.siswa_id = p_siswa_id and e.tanggal = p_tanggal
   order by e.id desc
   limit 1
   for update;
  if not found then
    o_kode := 'tidak_ada_edit'; return next; return;
  end if;

  -- Yang dikonfirmasi pengguna harus tepat edit terakhir. Kalau sudah ada edit yang lebih baru (atau ID
  -- itu bukan milik siswa+tanggal ini), JANGAN memulihkan edit lain secara diam-diam.
  if v_e.id <> p_edit_id then
    o_kode := 'sudah_berubah'; return next; return;
  end if;

  if v_e.dipulihkan_at is not null then
    o_kode := 'sudah_dipulihkan'; return next; return;
  end if;

  select s.masa_pulihkan_hari into v_hari from public.absensi_setting s order by s.id limit 1;
  v_hari := coalesce(v_hari, 7);
  if now() > v_e.diedit_at + make_interval(days => v_hari) then
    o_kode := 'kedaluwarsa'; return next; return;
  end if;

  -- Baris sekarang harus MASIH hasil edit itu: id sama dan rev tidak naik sejak edit.
  -- (scan pulang, koreksi scan offline, atau edit lain menaikkan rev; baris dihapus/dibuat ulang mengubah id.)
  if not v_ada or v_a.id <> v_e.absensi_id or v_a.rev <> v_e.rev_sesudah then
    o_kode := 'sudah_berubah'; return next; return;
  end if;

  if v_e.sebelum is null then
    -- Edit itu yang membuat baris: pemulihan = hapus baris.
    delete from public.absensi where id = v_a.id;
    v_status_pulih := 'Belum Absen';
  else
    update public.absensi a
       set status     = v_e.sebelum ->> 'status',
           jam_masuk  = (v_e.sebelum ->> 'jam_masuk')::time,
           jam_pulang = (v_e.sebelum ->> 'jam_pulang')::time,
           keterangan = v_e.sebelum ->> 'keterangan',
           lampiran   = v_e.sebelum ->> 'lampiran',
           scan_oleh  = v_e.sebelum ->> 'scan_oleh',
           scanner_id = v_e.sebelum ->> 'scanner_id',
           tapel      = v_e.sebelum ->> 'tapel',
           semester   = v_e.sebelum ->> 'semester'
     where a.id = v_a.id;
    v_status_pulih := v_e.sebelum ->> 'status';
  end if;

  update public.absensi_edit_manual
     set dipulihkan_at = now(), dipulihkan_oleh = p_pemulih_id, dipulihkan_nama = p_pemulih_nama
   where id = v_e.id;

  select s.name, s.class into v_nama, v_kelas from public.students s where s.id = p_siswa_id;

  if v_a.status is distinct from v_status_pulih then
    insert into public.absensi_log (admin_id, siswa_id, tanggal_absen, status_lama, status_baru, keterangan)
    values (p_pemulih_id, p_siswa_id, p_tanggal, v_a.status, v_status_pulih, 'Pulihkan edit manual');
  end if;

  insert into public.log_aktivitas (admin_id, aksi, target, keterangan)
  values (
    p_pemulih_id, 'pulihkan_absensi', v_nama,
    format('Pulihkan edit manual absensi %s (Kelas %s), tanggal %s. Dikembalikan ke: %s. (Edit asli oleh %s, %s WIB)',
           v_nama, v_kelas, to_char(p_tanggal, 'DD-MM-YYYY'),
           public.absensi_ringkas(v_e.sebelum),
           coalesce(v_e.editor_nama, '-'),
           to_char(v_e.diedit_at at time zone 'Asia/Jakarta', 'DD-MM-YYYY HH24:MI'))
  );

  o_kode := 'ok';
  return next;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 7. Daftar baris yang SAAT INI boleh dipulihkan (untuk menampilkan tombol di Rekap Harian)
--    Syarat sama dengan pulihkan_edit_manual: edit terakhir, belum dipulihkan, masih dalam masa
--    pemulihan, dan baris absensi belum diubah proses lain.
--    o_edit_id = ID edit yang harus dikirim kembali ke pulihkan_edit_manual (p_edit_id).
--    (tidak berubah dari versi sebelumnya)
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.daftar_bisa_pulihkan(p_tanggal date, p_siswa_ids bigint[])
returns table (
  o_siswa_id    bigint,
  o_edit_id     bigint,
  o_diedit_at   timestamptz,
  o_editor_nama text,
  o_batas       timestamptz,
  o_sebelum     jsonb
)
language plpgsql
stable
as $$
declare
  v_hari integer;
begin
  select s.masa_pulihkan_hari into v_hari from public.absensi_setting s order by s.id limit 1;
  v_hari := coalesce(v_hari, 7);

  return query
  select e.siswa_id, e.id, e.diedit_at, e.editor_nama,
         e.diedit_at + make_interval(days => v_hari), e.sebelum
    from public.absensi_edit_manual e
    join public.absensi a on a.siswa_id = e.siswa_id and a.tanggal = e.tanggal
   where e.tanggal = p_tanggal
     and e.siswa_id = any (p_siswa_ids)
     and e.dipulihkan_at is null
     and e.id = (select max(e2.id) from public.absensi_edit_manual e2
                  where e2.siswa_id = e.siswa_id and e2.tanggal = e.tanggal)
     and a.id  = e.absensi_id
     and a.rev = e.rev_sesudah
     and now() <= e.diedit_at + make_interval(days => v_hari);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 8. Hak akses (semua EKSPLISIT; default privileges TIDAK diubah)
--
--    Di Supabase, fungsi baru di schema public otomatis bisa dieksekusi anon/authenticated lewat
--    default privileges, jadi "revoke from public" saja tidak cukup: anon & authenticated disebut
--    eksplisit di bawah. Fungsi-fungsi ini berjalan sebagai pemanggilnya (SECURITY INVOKER), jadi
--    service_role HARUS diberi EXECUTE pada helper juga, kalau tidak RPC utama gagal.
-- ─────────────────────────────────────────────────────────────────────

-- Tabel snapshot: hanya server (service_role) dengan hak seperlunya. Fungsi hanya membaca, menambah,
-- dan mengubah baris (kolom dipulihkan_*); tidak ada DELETE/TRUNCATE. Aksi cascade dari students/users
-- dijalankan sebagai pemilik tabel sehingga tidak butuh hak DELETE di service_role.
revoke all on table public.absensi_edit_manual from public, anon, authenticated, service_role;
grant select, insert, update on table public.absensi_edit_manual to service_role;

-- Fungsi trigger: tidak perlu bisa dipanggil siapa pun (trigger tetap berjalan tanpa hak EXECUTE).
revoke all on function public.absensi_naikkan_rev() from public, anon, authenticated;

-- Helper: hanya service_role (dipanggil dari dalam RPC utama).
revoke all on function public.absensi_snapshot(public.absensi) from public, anon, authenticated;
revoke all on function public.absensi_ringkas(jsonb)           from public, anon, authenticated;
revoke all on function public.absensi_periode_tanggal(date)    from public, anon, authenticated;
grant execute on function public.absensi_snapshot(public.absensi) to service_role;
grant execute on function public.absensi_ringkas(jsonb)           to service_role;
grant execute on function public.absensi_periode_tanggal(date)    to service_role;

-- RPC utama: dipanggil lewat service role (server) saja.
revoke all on function public.edit_manual_absensi(bigint, date[], text, text, text, bigint, text) from public, anon, authenticated;
revoke all on function public.pulihkan_edit_manual(bigint, date, bigint, bigint, text)           from public, anon, authenticated;
revoke all on function public.daftar_bisa_pulihkan(date, bigint[])                               from public, anon, authenticated;
grant execute on function public.edit_manual_absensi(bigint, date[], text, text, text, bigint, text) to service_role;
grant execute on function public.pulihkan_edit_manual(bigint, date, bigint, bigint, text)           to service_role;
grant execute on function public.daftar_bisa_pulihkan(date, bigint[])                               to service_role;
