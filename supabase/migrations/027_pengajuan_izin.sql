-- 027_pengajuan_izin.sql
-- Pengajuan izin/sakit oleh orang tua (Portal Siswa) -> persetujuan wali kelas/admin -> pencatatan absensi.
--
-- PRINSIP
--  1. Pengajuan TIDAK PERNAH langsung mengubah absensi. Absensi baru berubah setelah disetujui.
--  2. Status pengajuan = riwayat administrasi (utuh, tidak dihapus). Status absensi harian mengikuti KEJADIAN SEBENARNYA:
--     scan selalu menang. Hasil per hari disimpan di pengajuan_izin_hari.hasil.
--  3. Hari yang sudah lewat dicatat saat disetujui. Hari ini/mendatang hanya disimpan sebagai RENCANA; cron akhir hari
--     (terapkan_rencana_pengajuan) menulis izin/sakit HANYA bila siswa tidak punya catatan hari itu. Jadi scan tidak pernah
--     terblokir oleh catatan izin/sakit yang ditulis lebih dulu.
--  4. Selama pengajuan Menunggu untuk hari ini, cron tidak menulis Alpha dan tidak mengirim WhatsApp Alpha.
--     Bila kemudian ditolak/dibatalkan/tidak disetujui, evaluasi_alpha_pengajuan menulis Alpha untuk hari yang sudah lewat
--     yang tidak punya catatan (tanpa WhatsApp).
--  5. Semua aturan validasi ada di SQL (satu sumber kebenaran, atomik, aman dari klik ganda dan permintaan bersamaan).
--
-- ATURAN (konstanta di ajukan_pengajuan_izin)
--  Izin: tepat 1 hari sekolah.  Sakit: rentang maksimal 14 hari kalender (hari Minggu/libur dilewati).
--  Paling lama 7 hari ke belakang, 30 hari ke depan. Maksimal 3 pengajuan Menunggu per siswa.
--  Lampiran wajib untuk sakit bila hari sekolahnya LEBIH DARI 2; opsional untuk izin.
--  Tidak boleh tumpang tindih dengan pengajuan aktif lain pada tanggal yang sama.
--
-- PIN orang tua: ACAK per siswa (dibuat wali kelas/admin, dibagikan pribadi), verifikasi di SQL (verifikasi_pin_ortu). Tidak ada PIN bawaan.
-- Hari berstatus MENUNGGU tidak dihitung di rekap (termasuk fungsi SQL rekap di bawah) dan tidak ditulis Alpha oleh sistem.
-- Prasyarat: migrasi 019 (edit_manual_absensi). Aman dijalankan ulang. Tidak mengubah data yang ada.

-- 1. TABEL ---------------------------------------------------------------------------------------

create table if not exists public.kunci_ortu (
  siswa_id        bigint primary key references public.students (id) on delete cascade,
  pin_hash        text,                                  -- null = PIN belum dibuat (siswa tidak bisa mengajukan sampai wali kelas/admin membuat PIN acak)
  gagal           integer not null default 0,
  terkunci_sampai timestamptz,
  diubah_pada     timestamptz not null default now()
);

create table if not exists public.pengajuan_izin (
  id                 bigint generated always as identity primary key,
  siswa_id           bigint not null references public.students (id) on delete cascade,
  jenis              text   not null check (jenis in ('izin', 'sakit')),
  tanggal_dari       date   not null,
  tanggal_sampai     date   not null,
  alasan             text   not null,
  lampiran           text,
  status             text   not null default 'menunggu'
                     check (status in ('menunggu', 'disetujui', 'disetujui_sebagian', 'ditolak', 'dibatalkan')),
  diajukan_pada      timestamptz not null default now(),
  diputuskan_oleh    bigint references public.users (id) on delete set null,
  diputuskan_nama    text,
  diputuskan_pada    timestamptz,
  catatan_keputusan  text,
  constraint pengajuan_izin_rentang check (tanggal_sampai >= tanggal_dari),
  constraint pengajuan_izin_izin_satu_hari check (jenis <> 'izin' or tanggal_dari = tanggal_sampai)
);
create index if not exists idx_pengajuan_izin_status on public.pengajuan_izin (status, siswa_id);
create index if not exists idx_pengajuan_izin_siswa  on public.pengajuan_izin (siswa_id, diajukan_pada desc);

create table if not exists public.pengajuan_izin_hari (
  pengajuan_id bigint  not null references public.pengajuan_izin (id) on delete cascade,
  siswa_id     bigint  not null references public.students (id) on delete cascade,
  tanggal      date    not null,
  disetujui    boolean,                               -- null = belum diputuskan
  aktif        boolean not null default true,         -- true = menahan tanggal ini dari pengajuan lain
  hasil        text    check (hasil in ('direncanakan', 'ditulis', 'scan_menang', 'sudah_tercatat', 'dialpha')),
  hasil_pada   timestamptz,
  primary key (pengajuan_id, tanggal)
);
-- satu tanggal hanya boleh ditahan oleh SATU pengajuan aktif per siswa (tahan banting terhadap permintaan bersamaan)
create unique index if not exists uq_pengajuan_hari_aktif on public.pengajuan_izin_hari (siswa_id, tanggal) where aktif;
create index if not exists idx_pengajuan_hari_tanggal on public.pengajuan_izin_hari (tanggal) where aktif;

alter table public.kunci_ortu          enable row level security;
alter table public.pengajuan_izin      enable row level security;
alter table public.pengajuan_izin_hari enable row level security;
revoke all on public.kunci_ortu, public.pengajuan_izin, public.pengajuan_izin_hari from anon, authenticated;

comment on table public.pengajuan_izin is
  'Pengajuan izin/sakit dari orang tua. Riwayat administrasi (tidak dihapus aplikasi); tidak pernah langsung mengubah absensi.';
comment on column public.pengajuan_izin_hari.hasil is
  'Hasil per hari: direncanakan (hari ini/mendatang, menunggu cron), ditulis (izin/sakit dicatat), scan_menang (siswa hadir/terlambat, tidak ditimpa), sudah_tercatat (sudah ada izin/sakit lain), dialpha (tidak disetujui; Alpha dicatat).';

-- 2. HARI SEKOLAH --------------------------------------------------------------------------------

create or replace function public.hari_sekolah_rentang(p_dari date, p_sampai date)
returns setof date
language sql
stable
as $$
  -- deret bilangan bulat + penjumlahan tanggal (bukan generate_series timestamptz): hasilnya tidak bergantung pada zona waktu sesi
  select (p_dari + i) as d
  from generate_series(0, p_sampai - p_dari) as i
  where extract(isodow from (p_dari + i)) <> 7
    and not exists (select 1 from public.hari_libur l where l.tanggal = (p_dari + i))
  order by 1;
$$;

-- 3. AJUKAN --------------------------------------------------------------------------------------

create or replace function public.ajukan_pengajuan_izin(
  p_siswa_id bigint,
  p_jenis    text,
  p_dari     date,
  p_sampai   date,
  p_alasan   text,
  p_lampiran text default null
)
returns jsonb
language plpgsql
as $$
declare
  c_maks_sakit         constant integer := 14;  -- hari kalender per pengajuan sakit
  c_mundur             constant integer := 7;
  c_maju               constant integer := 30;
  c_maks_menunggu      constant integer := 3;
  c_lampiran_setelah   constant integer := 2;   -- sakit dengan hari sekolah > 2 wajib lampiran
  v_hari    date := (now() at time zone 'Asia/Jakarta')::date;
  v_s       record;
  v_alasan  text := btrim(coalesce(p_alasan, ''));
  v_lamp    text := nullif(btrim(coalesce(p_lampiran, '')), '');
  v_hari_s  date[];
  v_bentrok date[];
  v_id      bigint;
begin
  if p_jenis is null or p_jenis not in ('izin', 'sakit') then
    raise exception 'Jenis pengajuan tidak valid.';
  end if;
  if p_dari is null or p_sampai is null then
    raise exception 'Tanggal wajib diisi.';
  end if;
  if p_sampai < p_dari then
    raise exception 'Tanggal sampai tidak boleh sebelum tanggal dari.';
  end if;
  if char_length(v_alasan) < 5 then
    raise exception 'Alasan minimal 5 karakter.';
  end if;
  if char_length(v_alasan) > 300 then
    raise exception 'Alasan maksimal 300 karakter.';
  end if;

  -- kunci baris siswa: pengajuan bersamaan untuk siswa yang sama diproses bergantian (batas "maks 3 menunggu" aman)
  select s.id, s.name, s.class, s.status into v_s from public.students s where s.id = p_siswa_id for update;
  if not found then raise exception 'Siswa tidak ditemukan.'; end if;
  if v_s.status <> 'aktif' then raise exception 'Siswa tidak aktif.'; end if;

  if p_dari < v_hari - c_mundur then
    raise exception 'Pengajuan paling lama % hari ke belakang.', c_mundur;
  end if;
  if p_sampai > v_hari + c_maju then
    raise exception 'Pengajuan paling jauh % hari ke depan.', c_maju;
  end if;
  if p_jenis = 'izin' and p_dari <> p_sampai then
    raise exception 'Izin hanya untuk satu hari. Untuk hari lain, buat pengajuan baru.';
  end if;
  if p_sampai - p_dari + 1 > c_maks_sakit then
    raise exception 'Pengajuan sakit paling lama % hari.', c_maks_sakit;
  end if;

  select array_agg(x order by x) into v_hari_s from public.hari_sekolah_rentang(p_dari, p_sampai) as x;
  if v_hari_s is null then
    raise exception 'Rentang tanggal tidak memuat hari sekolah (hari Minggu atau libur).';
  end if;

  if p_jenis = 'sakit' and array_length(v_hari_s, 1) > c_lampiran_setelah and v_lamp is null then
    raise exception 'Lampiran (foto surat dokter) wajib untuk sakit lebih dari % hari.', c_lampiran_setelah;
  end if;

  if (select count(*) from public.pengajuan_izin pi where pi.siswa_id = p_siswa_id and pi.status = 'menunggu') >= c_maks_menunggu then
    raise exception 'Masih ada % pengajuan yang menunggu persetujuan. Tunggu hingga diputuskan atau batalkan salah satunya.', c_maks_menunggu;
  end if;

  select array_agg(h.tanggal order by h.tanggal) into v_bentrok
  from public.pengajuan_izin_hari h
  where h.siswa_id = p_siswa_id and h.aktif and h.tanggal = any (v_hari_s);
  if v_bentrok is not null then
    raise exception 'Sudah ada pengajuan lain untuk tanggal: %.',
      (select string_agg(to_char(t, 'DD-MM-YYYY'), ', ' order by t) from unnest(v_bentrok) t);
  end if;

  if not exists (
    select 1 from unnest(v_hari_s) as t
    where not exists (
      select 1 from public.absensi a where a.siswa_id = p_siswa_id and a.tanggal = t and a.status in ('hadir', 'terlambat')
    )
  ) then
    raise exception 'Siswa sudah tercatat hadir pada semua tanggal tersebut.';
  end if;

  insert into public.pengajuan_izin (siswa_id, jenis, tanggal_dari, tanggal_sampai, alasan, lampiran)
  values (p_siswa_id, p_jenis, p_dari, p_sampai, v_alasan, v_lamp)
  returning id into v_id;

  insert into public.pengajuan_izin_hari (pengajuan_id, siswa_id, tanggal)
  select v_id, p_siswa_id, t from unnest(v_hari_s) as t;

  insert into public.log_aktivitas (admin_id, aksi, target, keterangan)
  values (null, 'ajukan_izin', v_s.name,
          format('Orang tua mengajukan %s %s s.d. %s (%s hari sekolah), pengajuan #%s.',
                 p_jenis, to_char(p_dari, 'DD-MM-YYYY'), to_char(p_sampai, 'DD-MM-YYYY'), array_length(v_hari_s, 1), v_id));

  return jsonb_build_object('id', v_id, 'jenis', p_jenis, 'hari_sekolah', to_jsonb(v_hari_s));
end;
$$;

-- 4. ALPHA UNTUK HARI YANG TIDAK DISETUJUI (internal) -------------------------------------------
-- Hari LAMPAU dari pengajuan yang tidak (jadi) disetujui dan belum punya catatan -> Alpha, tanpa WhatsApp.
-- Hari ini dan mendatang tidak disentuh (cron akhir hari yang menangani).

create or replace function public.evaluasi_alpha_pengajuan(p_id bigint, p_sebab text)
returns integer
language plpgsql
as $$
declare
  v_hari date := (now() at time zone 'Asia/Jakarta')::date;
  v_p    record;
  v_n    integer := 0;
  v_c    integer;
  v_per  record;
  r      record;
begin
  select * into v_p from public.pengajuan_izin where id = p_id;
  if not found then return 0; end if;
  if not exists (select 1 from public.students s where s.id = v_p.siswa_id and s.status = 'aktif') then return 0; end if;

  for r in
    select h.tanggal from public.pengajuan_izin_hari h
    where h.pengajuan_id = p_id and coalesce(h.disetujui, false) = false and h.tanggal < v_hari
    order by h.tanggal
  loop
    -- libur yang ditetapkan belakangan tidak boleh menjadi Alpha
    continue when exists (select 1 from public.hari_libur l where l.tanggal = r.tanggal);
    select * into v_per from public.absensi_periode_tanggal(r.tanggal);
    -- tanpa riwayat kelas pada tapel itu baris absensi tidak akan muncul di Rekap (sama seperti edit_manual_absensi): lewati
    continue when not exists (select 1 from public.riwayat_kelas rk where rk.siswa_id = v_p.siswa_id and rk.tapel = v_per.o_tapel);
    insert into public.absensi (siswa_id, tanggal, status, keterangan, tapel, semester, scan_oleh)
    values (v_p.siswa_id, r.tanggal, 'alpha', format('Diisi sistem: pengajuan %s #%s %s', v_p.jenis, p_id, p_sebab),
            v_per.o_tapel, v_per.o_semester, 'admin')
    on conflict (siswa_id, tanggal) do nothing;
    get diagnostics v_c = row_count;
    if v_c > 0 then
      update public.pengajuan_izin_hari set hasil = 'dialpha', hasil_pada = now()
      where pengajuan_id = p_id and tanggal = r.tanggal;
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

-- 5. BATALKAN (orang tua) ------------------------------------------------------------------------

create or replace function public.batalkan_pengajuan_izin(p_id bigint, p_siswa_id bigint)
returns jsonb
language plpgsql
as $$
declare
  v_sid  bigint;
  v_p    record;
  v_nama text;
  v_n    integer;
begin
  select pi.siswa_id into v_sid from public.pengajuan_izin pi where pi.id = p_id;
  if not found or v_sid <> p_siswa_id then
    raise exception 'Pengajuan tidak ditemukan.';
  end if;
  select s.name into v_nama from public.students s where s.id = v_sid for update;  -- urutan kunci: siswa dulu, lalu pengajuan
  select * into v_p from public.pengajuan_izin where id = p_id for update;
  if v_p.status <> 'menunggu' then
    raise exception 'Pengajuan sudah diputuskan, tidak dapat dibatalkan.';
  end if;

  update public.pengajuan_izin set status = 'dibatalkan', diputuskan_pada = now() where id = p_id;
  update public.pengajuan_izin_hari set aktif = false, disetujui = false where pengajuan_id = p_id;
  v_n := public.evaluasi_alpha_pengajuan(p_id, 'dibatalkan');

  insert into public.log_aktivitas (admin_id, aksi, target, keterangan)
  values (null, 'batal_izin', v_nama, format('Orang tua membatalkan pengajuan #%s (%s hari lampau dicatat Alpha).', p_id, v_n));
  return jsonb_build_object('status', 'dibatalkan', 'hari_alpha', v_n);
end;
$$;

-- 6. PUTUSKAN (wali kelas / admin) ---------------------------------------------------------------
-- p_hari: subset hari yang disetujui (null = semua). Hari yang tidak dipilih TIDAK otomatis jadi izin/sakit.

create or replace function public.putuskan_pengajuan_izin(
  p_id          bigint,
  p_keputusan   text,
  p_hari        date[]  default null,
  p_catatan     text    default null,
  p_editor_id   bigint  default null,
  p_editor_nama text    default null
)
returns jsonb
language plpgsql
as $$
declare
  v_hari   date := (now() at time zone 'Asia/Jakarta')::date;
  v_sid    bigint;
  v_nama   text;
  v_p      record;
  v_semua  date[];
  v_setuju date[];
  v_tulis  date[] := '{}';
  v_st     text;
  v_ada    boolean;
  v_status text;
  v_ket    text;
  v_alpha  integer := 0;
  r        record;
begin
  if p_keputusan is null or p_keputusan not in ('setujui', 'tolak') then
    raise exception 'Keputusan tidak valid.';
  end if;
  if p_editor_id is null then
    raise exception 'Pemutus wajib diketahui.';
  end if;

  select pi.siswa_id into v_sid from public.pengajuan_izin pi where pi.id = p_id;
  if not found then raise exception 'Pengajuan tidak ditemukan.'; end if;
  select s.name into v_nama from public.students s where s.id = v_sid for update;
  select * into v_p from public.pengajuan_izin where id = p_id for update;
  if v_p.status <> 'menunggu' then
    raise exception 'Pengajuan sudah diputuskan.';
  end if;

  select array_agg(h.tanggal order by h.tanggal) into v_semua from public.pengajuan_izin_hari h where h.pengajuan_id = p_id;

  if p_keputusan = 'tolak' then
    update public.pengajuan_izin
       set status = 'ditolak', diputuskan_oleh = p_editor_id, diputuskan_nama = p_editor_nama,
           diputuskan_pada = now(), catatan_keputusan = nullif(btrim(coalesce(p_catatan, '')), '')
     where id = p_id;
    update public.pengajuan_izin_hari set aktif = false, disetujui = false where pengajuan_id = p_id;
    v_alpha := public.evaluasi_alpha_pengajuan(p_id, 'ditolak');
    insert into public.log_aktivitas (admin_id, aksi, target, keterangan)
    values (p_editor_id, 'tolak_izin', v_nama, format('Menolak pengajuan %s #%s (%s hari lampau dicatat Alpha).', v_p.jenis, p_id, v_alpha));
    return jsonb_build_object('status', 'ditolak', 'hari_alpha', v_alpha);
  end if;

  -- SETUJUI
  v_setuju := coalesce(p_hari, v_semua);
  if exists (select 1 from unnest(v_setuju) t where not (t = any (v_semua))) then
    raise exception 'Ada tanggal yang bukan bagian dari pengajuan ini.';
  end if;
  if coalesce(array_length(v_setuju, 1), 0) = 0 then
    raise exception 'Pilih minimal satu hari untuk disetujui, atau tolak pengajuan.';
  end if;

  update public.pengajuan_izin_hari h
     set disetujui = (h.tanggal = any (v_setuju)), aktif = (h.tanggal = any (v_setuju))
   where h.pengajuan_id = p_id;
  v_status := case when array_length(v_setuju, 1) = array_length(v_semua, 1) then 'disetujui' else 'disetujui_sebagian' end;
  update public.pengajuan_izin
     set status = v_status, diputuskan_oleh = p_editor_id, diputuskan_nama = p_editor_nama,
         diputuskan_pada = now(), catatan_keputusan = nullif(btrim(coalesce(p_catatan, '')), '')
   where id = p_id;

  -- Tentukan nasib tiap hari yang disetujui: scan menang; hari lampau/yang sudah Alpha dicatat sekarang; sisanya rencana.
  for r in select h.tanggal from public.pengajuan_izin_hari h where h.pengajuan_id = p_id and h.disetujui order by h.tanggal loop
    select a.status into v_st from public.absensi a where a.siswa_id = v_p.siswa_id and a.tanggal = r.tanggal for update;
    v_ada := found;
    if v_ada and v_st in ('hadir', 'terlambat') then
      update public.pengajuan_izin_hari set hasil = 'scan_menang', hasil_pada = now() where pengajuan_id = p_id and tanggal = r.tanggal;
    elsif v_ada and v_st in ('izin', 'sakit') then
      update public.pengajuan_izin_hari set hasil = 'sudah_tercatat', hasil_pada = now() where pengajuan_id = p_id and tanggal = r.tanggal;
    elsif (not v_ada and r.tanggal < v_hari) or (v_ada and v_st = 'alpha' and r.tanggal <= v_hari) then
      v_tulis := array_append(v_tulis, r.tanggal);
    else
      update public.pengajuan_izin_hari set hasil = 'direncanakan', hasil_pada = now() where pengajuan_id = p_id and tanggal = r.tanggal;
    end if;
  end loop;

  if array_length(v_tulis, 1) > 0 then
    v_ket := format('Disetujui: %s dari orang tua (pengajuan #%s). %s', v_p.jenis, p_id, v_p.alasan);
    perform public.edit_manual_absensi(v_p.siswa_id, v_tulis, v_p.jenis, v_ket, v_p.lampiran, p_editor_id, coalesce(p_editor_nama, 'Sistem'));
    update public.pengajuan_izin_hari set hasil = 'ditulis', hasil_pada = now() where pengajuan_id = p_id and tanggal = any (v_tulis);
  end if;

  -- Hari yang TIDAK disetujui pada persetujuan sebagian mengikuti aturan normal (Alpha bila lampau & tanpa catatan)
  v_alpha := public.evaluasi_alpha_pengajuan(p_id, 'tidak disetujui');

  insert into public.log_aktivitas (admin_id, aksi, target, keterangan)
  values (p_editor_id, 'setujui_izin', v_nama,
          format('Menyetujui pengajuan %s #%s (%s dari %s hari; %s dicatat, %s Alpha).',
                 v_p.jenis, p_id, array_length(v_setuju, 1), array_length(v_semua, 1), coalesce(array_length(v_tulis, 1), 0), v_alpha));

  return jsonb_build_object(
    'status', v_status,
    'disetujui', array_length(v_setuju, 1),
    'ditulis', coalesce(array_length(v_tulis, 1), 0),
    'hari_alpha', v_alpha
  );
end;
$$;

-- 7. CRON AKHIR HARI -----------------------------------------------------------------------------
-- Dipanggil cron SEBELUM menulis Alpha untuk tanggal p_tanggal.
--  - Hari yang disetujui & direncanakan: tulis izin/sakit HANYA bila siswa tidak punya catatan (scan menang).
--  - Kembalikan siswa yang punya pengajuan MENUNGGU pada tanggal itu: cron tidak menulis Alpha dan tidak mengirim WA Alpha.

create or replace function public.terapkan_rencana_pengajuan(p_tanggal date)
returns jsonb
language plpgsql
as $$
declare
  v_ditulis  int := 0;
  v_scan     int := 0;
  v_ada      int := 0;
  v_gagal    int := 0;
  v_st       text;
  v_menunggu bigint[];
  r          record;
begin
  for r in
    select h.pengajuan_id, h.siswa_id, p.jenis, p.alasan, p.lampiran, p.diputuskan_oleh, p.diputuskan_nama
    from public.pengajuan_izin_hari h
    join public.pengajuan_izin p on p.id = h.pengajuan_id
    join public.students s on s.id = h.siswa_id and s.status = 'aktif'
    where h.tanggal = p_tanggal and h.aktif and h.disetujui
      and (h.hasil is null or h.hasil = 'direncanakan')
      and p.status in ('disetujui', 'disetujui_sebagian')
    order by h.siswa_id
  loop
    begin   -- satu siswa bermasalah (mis. tanpa riwayat kelas) tidak menggagalkan yang lain
      select a.status into v_st from public.absensi a where a.siswa_id = r.siswa_id and a.tanggal = p_tanggal for update;
      if found and v_st in ('hadir', 'terlambat') then
        -- SCAN MENANG: Hadir/Terlambat tidak pernah ditimpa. Pengajuan tetap Disetujui sebagai riwayat.
        update public.pengajuan_izin_hari set hasil = 'scan_menang', hasil_pada = now() where pengajuan_id = r.pengajuan_id and tanggal = p_tanggal;
        v_scan := v_scan + 1;
      elsif found and v_st in ('izin', 'sakit') then
        update public.pengajuan_izin_hari set hasil = 'sudah_tercatat', hasil_pada = now() where pengajuan_id = r.pengajuan_id and tanggal = p_tanggal;
        v_ada := v_ada + 1;
      else
        -- tidak ada catatan, ATAU Alpha (mis. penulisan Alpha manual sudah jalan lebih dulu): izin/sakit yang disetujui tetap berlaku.
        -- Lewat edit_manual_absensi: kunci baris, snapshot (bisa dipulihkan), dan pengaman riwayat kelas.
        perform public.edit_manual_absensi(
          r.siswa_id, array[p_tanggal], r.jenis,
          format('Disetujui: %s dari orang tua (pengajuan #%s). %s', r.jenis, r.pengajuan_id, r.alasan),
          r.lampiran, r.diputuskan_oleh, coalesce(r.diputuskan_nama, 'Sistem (pengajuan orang tua)'));
        update public.pengajuan_izin_hari set hasil = 'ditulis', hasil_pada = now() where pengajuan_id = r.pengajuan_id and tanggal = p_tanggal;
        v_ditulis := v_ditulis + 1;
      end if;
    exception when others then
      v_gagal := v_gagal + 1;
      raise warning 'terapkan_rencana_pengajuan: siswa % pengajuan %: %', r.siswa_id, r.pengajuan_id, sqlerrm;
    end;
  end loop;

  select array_agg(distinct h.siswa_id order by h.siswa_id) into v_menunggu
  from public.pengajuan_izin_hari h
  join public.pengajuan_izin p on p.id = h.pengajuan_id
  where h.tanggal = p_tanggal and h.aktif and p.status = 'menunggu';

  return jsonb_build_object(
    'ditulis', v_ditulis, 'scan_menang', v_scan, 'sudah_tercatat', v_ada, 'gagal', v_gagal,
    'menunggu', to_jsonb(coalesce(v_menunggu, '{}'::bigint[]))
  );
end;
$$;

-- 8. PIN ORANG TUA --------------------------------------------------------------------------------
-- Login baca Portal Siswa tetap NISN saja. MENGAJUKAN/MEMBATALKAN wajib PIN 6 digit ACAK per siswa. Tidak ada PIN bawaan:
-- siswa yang PIN-nya belum dibuat tidak bisa mengajukan (PIN_BELUM_DIATUR). Alur: wali kelas/admin membuat PIN acak
-- (buat_pin_acak_ortu) -> membagikannya SECARA PRIBADI -> menandai sudah dibagikan (tandai_pin_dibagikan). Sistem TIDAK pernah
-- menganggap PIN terbagikan otomatis: dibagikan_pada hanya terisi lewat tindakan eksplisit wali kelas/admin.
-- Verifikasi di SQL dengan kunci baris (percobaan paralel dihitung bergantian). 5 salah berturut-turut mengunci 15 menit,
-- kelipatan 5 berikutnya menggandakan (maks 4 jam). PIN disimpan sebagai hash bcrypt. Reset membuat PIN acak BARU; PIN lama mati.

create extension if not exists pgcrypto;
alter table public.kunci_ortu add column if not exists dibagikan_pada timestamptz;
drop function if exists public.pin_bawaan_ortu();
drop function if exists public.reset_pin_ortu(bigint);

create or replace function public.pin_terlalu_mudah(p_pin text)
returns boolean
language sql
immutable
as $$
  select p_pin ~ '^(\d)\1{5}$'
      or p_pin in ('123456', '234567', '345678', '456789', '012345', '654321', '543210', '987654', '123123', '121212');
$$;

create or replace function public.verifikasi_pin_ortu(p_siswa_id bigint, p_pin text)
returns jsonb
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  v       public.kunci_ortu%rowtype;
  v_gagal integer;
  v_menit integer;
begin
  if not exists (select 1 from public.students where id = p_siswa_id and status = 'aktif') then
    return jsonb_build_object('ok', false, 'kode', 'SISWA_TIDAK_AKTIF');
  end if;
  select * into v from public.kunci_ortu where siswa_id = p_siswa_id for update;
  if not found or v.pin_hash is null then
    return jsonb_build_object('ok', false, 'kode', 'PIN_BELUM_DIATUR');   -- tanpa PIN bawaan: tidak ada yang bisa ditebak
  end if;

  if v.terkunci_sampai is not null and v.terkunci_sampai > now() then
    return jsonb_build_object('ok', false, 'kode', 'TERKUNCI', 'terkunci_sampai', v.terkunci_sampai);
  end if;

  if p_pin is not null and v.pin_hash = crypt(p_pin, v.pin_hash) then
    update public.kunci_ortu set gagal = 0, terkunci_sampai = null where siswa_id = p_siswa_id;
    return jsonb_build_object('ok', true);
  end if;

  v_gagal := v.gagal + 1;
  if v_gagal % 5 = 0 then
    v_menit := least(240, 15 * (2 ^ ((v_gagal / 5) - 1))::integer);
    update public.kunci_ortu set gagal = v_gagal, terkunci_sampai = now() + make_interval(mins => v_menit) where siswa_id = p_siswa_id;
    return jsonb_build_object('ok', false, 'kode', 'TERKUNCI', 'menit', v_menit);
  end if;
  update public.kunci_ortu set gagal = v_gagal where siswa_id = p_siswa_id;
  return jsonb_build_object('ok', false, 'kode', 'PIN_SALAH', 'sisa_percobaan', 5 - (v_gagal % 5));
end;
$$;

-- Orang tua mengganti PIN sendiri: wajib PIN lama yang benar, PIN baru 6 digit dan tidak mudah ditebak.
-- p_paksa = true (admin/wali kelas lewat API): tanpa PIN lama; PIN dianggap BELUM dibagikan lagi.
create or replace function public.atur_pin_ortu(p_siswa_id bigint, p_pin_baru text, p_pin_lama text default null, p_paksa boolean default false)
returns jsonb
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  v_cek jsonb;
begin
  if p_pin_baru is null or p_pin_baru !~ '^[0-9]{6}$' then
    return jsonb_build_object('ok', false, 'kode', 'PIN_FORMAT');
  end if;
  if not p_paksa then
    if public.pin_terlalu_mudah(p_pin_baru) then
      return jsonb_build_object('ok', false, 'kode', 'PIN_TERLALU_MUDAH');
    end if;
    v_cek := public.verifikasi_pin_ortu(p_siswa_id, p_pin_lama);
    if not (v_cek ->> 'ok')::boolean then return v_cek; end if;
    insert into public.kunci_ortu (siswa_id, pin_hash, diubah_pada) values (p_siswa_id, crypt(p_pin_baru, gen_salt('bf', 10)), now())
    on conflict (siswa_id) do update set pin_hash = excluded.pin_hash, gagal = 0, terkunci_sampai = null, diubah_pada = now();   -- dibagikan_pada tetap: orang tua sendiri yang mengganti
    return jsonb_build_object('ok', true);
  end if;
  if not exists (select 1 from public.students where id = p_siswa_id and status = 'aktif') then
    return jsonb_build_object('ok', false, 'kode', 'SISWA_TIDAK_AKTIF');
  end if;
  insert into public.kunci_ortu (siswa_id, pin_hash, diubah_pada, dibagikan_pada) values (p_siswa_id, crypt(p_pin_baru, gen_salt('bf', 10)), now(), null)
  on conflict (siswa_id) do update set pin_hash = excluded.pin_hash, gagal = 0, terkunci_sampai = null, diubah_pada = now(), dibagikan_pada = null;
  return jsonb_build_object('ok', true);
end;
$$;

-- PIN ACAK untuk banyak siswa (wali kelas/admin). PIN polos HANYA dikembalikan di sini, sekali; yang tersimpan hanya hash.
-- Memakai ulang fungsi ini = PIN lama mati. dibagikan_pada dikosongkan: PIN baru belum dibagikan.
create or replace function public.buat_pin_acak_ortu(p_siswa_ids bigint[])
returns table (siswa_id bigint, pin text)
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  v_id  bigint;
  v_pin text;
begin
  for v_id in select s.id from public.students s where s.id = any (p_siswa_ids) and s.status = 'aktif' order by s.id loop
    loop
      v_pin := lpad(((('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
      exit when not public.pin_terlalu_mudah(v_pin) and v_pin <> '000000';
    end loop;
    -- ON CONFLICT ON CONSTRAINT: kolom keluaran fungsi bernama siswa_id akan ambigu bila ditulis on conflict (siswa_id)
    insert into public.kunci_ortu (siswa_id, pin_hash, dibagikan_pada) values (v_id, crypt(v_pin, gen_salt('bf', 10)), null)
    on conflict on constraint kunci_ortu_pkey do update
      set pin_hash = excluded.pin_hash, gagal = 0, terkunci_sampai = null, diubah_pada = now(), dibagikan_pada = null;
    siswa_id := v_id;
    pin := v_pin;
    return next;
  end loop;
end;
$$;

-- Reset (orang tua lupa PIN): buat PIN acak BARU untuk satu siswa dan kembalikan sekali. PIN lama tidak berlaku lagi, kunci dibuka.
create or replace function public.reset_pin_ortu(p_siswa_id bigint)
returns text
language sql
as $$
  select pin from public.buat_pin_acak_ortu(array[p_siswa_id]);
$$;

-- Wali kelas/admin menandai PIN sudah DIBERIKAN ke orang tua (tindakan eksplisit; tidak pernah otomatis).
create or replace function public.tandai_pin_dibagikan(p_siswa_ids bigint[])
returns integer
language sql
as $$
  with u as (
    update public.kunci_ortu set dibagikan_pada = now()
    where siswa_id = any (p_siswa_ids) and pin_hash is not null and dibagikan_pada is null
    returning 1
  ) select count(*)::integer from u;
$$;

-- 9. HARI MENUNGGU DI REKAP (SQL) -----------------------------------------------------------------
-- Pengajuan yang masih MENUNGGU membuat harinya tampil "Menunggu" dan TIDAK dihitung (bukan Alpha) sampai diputuskan.
-- Catatan nyata menang: Hadir/Terlambat/Izin/Sakit pada hari itu tetap dihitung; hanya baris Alpha / hari tanpa catatan yang tertunda.
-- Aturan yang sama dipakai TypeScript (utils/rekap-siswa.ts). Ditolak/dibatalkan -> hari kembali ke aturan baseline.

create or replace function public.tanggal_menunggu(p_siswa_ids bigint[], p_dari date, p_sampai date)
returns table (siswa_id bigint, tanggal date)
language sql
stable
as $$
  select h.siswa_id, h.tanggal
  from public.pengajuan_izin_hari h
  join public.pengajuan_izin p on p.id = h.pengajuan_id
  where p.status = 'menunggu' and h.aktif
    and h.siswa_id = any (p_siswa_ids)
    and h.tanggal between p_dari and p_sampai;
$$;

-- Hari sekolah tanpa catatan siswa (dipakai mode A "Aktifkan Kembali" untuk mengisi Alpha): hari MENUNGGU tidak ditulis Alpha.
create or replace function public.hari_belum_tercatat(p_siswa bigint, p_tapel text, p_dari date, p_sampai date)
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
    and not exists (select 1 from public.tanggal_menunggu(array[p_siswa], h.tanggal, h.tanggal))
  order by h.tanggal;
$$;

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
  ),
  menunggu as (select m.siswa_id, m.tanggal from public.tanggal_menunggu(p_ids, '0001-01-01', '9999-12-31') m)
  select r.siswa_id, count(h.tanggal)::integer
  from public.riwayat_kelas r
  cross join hari h
  left join menunggu mg on mg.siswa_id = r.siswa_id and mg.tanggal = h.tanggal
  where r.tapel = p_tapel
    and r.siswa_id = any (p_ids)
    and (r.nonaktif_pada is null or h.tanggal < r.nonaktif_pada)
    and not exists (
      select 1 from public.riwayat_status_siswa g
      where g.siswa_id = r.siswa_id and g.tapel = p_tapel
        and g.mode = 'kembali_setelah_jeda'
        and h.tanggal >= g.pindah_pada and h.tanggal < g.kembali_pada
    )
    -- hari MENUNGGU tidak dihitung, kecuali siswa punya catatan nyata (selain Alpha) pada hari itu (scan menang)
    and (mg.tanggal is null
         or exists (select 1 from public.absensi x where x.siswa_id = r.siswa_id and x.tanggal = h.tanggal and x.status <> 'alpha'))
  group by r.siswa_id;
$$;

create or replace function public.rekap_history_siswa(p_tapel text, p_semester text, p_ids bigint[])
returns table (siswa_id bigint, status text, jumlah integer)
language sql
stable
as $$
  with menunggu as (select m.siswa_id, m.tanggal from public.tanggal_menunggu(p_ids, '0001-01-01', '9999-12-31') m)
  select a.siswa_id, a.status, count(*)::integer as jumlah
  from public.absensi a
  left join public.riwayat_kelas r on r.siswa_id = a.siswa_id and r.tapel = p_tapel
  left join public.riwayat_status_siswa g
         on g.siswa_id = a.siswa_id and g.tapel = p_tapel and g.mode = 'kembali_setelah_jeda'
        and a.tanggal >= g.pindah_pada and a.tanggal < g.kembali_pada
  left join menunggu mg on mg.siswa_id = a.siswa_id and mg.tanggal = a.tanggal
  where a.tapel = p_tapel
    and a.semester = p_semester
    and a.siswa_id = any (p_ids)
    and extract(isodow from a.tanggal) <> 7
    and not exists (select 1 from public.hari_libur h where h.tanggal = a.tanggal)
    and (r.nonaktif_pada is null or a.tanggal < r.nonaktif_pada)
    and g.id is null
    and not (a.status = 'alpha' and mg.tanggal is not null)   -- Alpha pada hari MENUNGGU belum dihitung
  group by a.siswa_id, a.status;
$$;

-- 10. HAK AKSES -----------------------------------------------------------------------------------

revoke all on function public.hari_sekolah_rentang(date, date)                                          from public, anon, authenticated;
revoke all on function public.ajukan_pengajuan_izin(bigint, text, date, date, text, text)              from public, anon, authenticated;
revoke all on function public.evaluasi_alpha_pengajuan(bigint, text)                                    from public, anon, authenticated;
revoke all on function public.batalkan_pengajuan_izin(bigint, bigint)                                   from public, anon, authenticated;
revoke all on function public.putuskan_pengajuan_izin(bigint, text, date[], text, bigint, text)         from public, anon, authenticated;
revoke all on function public.terapkan_rencana_pengajuan(date)                                          from public, anon, authenticated;
revoke all on function public.pin_terlalu_mudah(text)                                                   from public, anon, authenticated;
revoke all on function public.verifikasi_pin_ortu(bigint, text)                                         from public, anon, authenticated;
revoke all on function public.atur_pin_ortu(bigint, text, text, boolean)                                from public, anon, authenticated;
revoke all on function public.reset_pin_ortu(bigint)                                                    from public, anon, authenticated;
revoke all on function public.buat_pin_acak_ortu(bigint[])                                              from public, anon, authenticated;
revoke all on function public.tandai_pin_dibagikan(bigint[])                                            from public, anon, authenticated;
revoke all on function public.tanggal_menunggu(bigint[], date, date)                                    from public, anon, authenticated;
revoke all on function public.hari_belum_tercatat(bigint, text, date, date)                             from public, anon, authenticated;
revoke all on function public.hari_dihitung_siswa(text, text, bigint[])                                 from public, anon, authenticated;
revoke all on function public.rekap_history_siswa(text, text, bigint[])                                 from public, anon, authenticated;
grant execute on function public.hari_sekolah_rentang(date, date)                                       to service_role;
grant execute on function public.ajukan_pengajuan_izin(bigint, text, date, date, text, text)           to service_role;
grant execute on function public.evaluasi_alpha_pengajuan(bigint, text)                                 to service_role;
grant execute on function public.batalkan_pengajuan_izin(bigint, bigint)                                to service_role;
grant execute on function public.putuskan_pengajuan_izin(bigint, text, date[], text, bigint, text)      to service_role;
grant execute on function public.terapkan_rencana_pengajuan(date)                                       to service_role;
grant execute on function public.pin_terlalu_mudah(text)                                                to service_role;
grant execute on function public.verifikasi_pin_ortu(bigint, text)                                      to service_role;
grant execute on function public.atur_pin_ortu(bigint, text, text, boolean)                             to service_role;
grant execute on function public.reset_pin_ortu(bigint)                                                 to service_role;
grant execute on function public.buat_pin_acak_ortu(bigint[])                                           to service_role;
grant execute on function public.tandai_pin_dibagikan(bigint[])                                         to service_role;
grant execute on function public.tanggal_menunggu(bigint[], date, date)                                 to service_role;
grant execute on function public.hari_belum_tercatat(bigint, text, date, date)                          to service_role;
grant execute on function public.hari_dihitung_siswa(text, text, bigint[])                              to service_role;
grant execute on function public.rekap_history_siswa(text, text, bigint[])                              to service_role;
