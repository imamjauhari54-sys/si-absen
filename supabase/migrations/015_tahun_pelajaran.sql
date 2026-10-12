-- 015_tahun_pelajaran.sql
-- TAHAP 1 (fitur Tambah/Ganti Tapel): master Tahun Pelajaran.
--
-- Sebelumnya tapel hanya teks bebas di absensi_setting.tapel (diketik admin di form
-- Jadwal), jadi salah ketik ("2026-2027") diam-diam memecah rekap. Sekarang tapel
-- dipilih dari tabel master ini; formatnya dijaga constraint "YYYY/YYYY" dengan tahun
-- kedua = tahun pertama + 1.
--
-- Migrasi ini ADITIF: tidak mengubah absensi / absensi_setting / students.
-- absensi.tapel dan absensi_setting.tapel tetap teks (tanpa FK) supaya kode lama tetap jalan.
-- Aman dijalankan ulang. Jalankan SEBELUM men-deploy kode Tahap 1.

create table if not exists public.tahun_pelajaran (
  nama        text primary key,
  created_at  timestamptz not null default now(),
  constraint tahun_pelajaran_format_check check (
    case
      when nama ~ '^\d{4}/\d{4}$'
        then split_part(nama, '/', 2)::int = split_part(nama, '/', 1)::int + 1
      else false
    end
  )
);

-- Isi awal dari tapel yang sudah dipakai (absensi + setting aktif).
-- CASE dipakai supaya cast ::int tidak pernah dievaluasi untuk nilai berformat salah.
insert into public.tahun_pelajaran (nama)
select distinct t
from (
  select tapel as t from public.absensi
  union
  select tapel from public.absensi_setting
) x
where t is not null
  and case
        when t ~ '^\d{4}/\d{4}$'
          then split_part(t, '/', 2)::int = split_part(t, '/', 1)::int + 1
        else false
      end
on conflict (nama) do nothing;

-- Laporkan nilai tapel lama yang formatnya tidak valid (tidak dimasukkan ke master).
-- Kalau muncul, rapikan manual (UPDATE absensi SET tapel = '...' WHERE tapel = '...').
do $$
declare
  tidak_valid text;
begin
  select string_agg(distinct t, ', ')
    into tidak_valid
  from (
    select tapel as t from public.absensi
    union
    select tapel from public.absensi_setting
  ) x
  where t is not null
    and t not in (select nama from public.tahun_pelajaran);

  if tidak_valid is not null then
    raise notice 'Tapel berformat tidak valid, TIDAK dimasukkan ke master: %', tidak_valid;
  end if;
end $$;

-- Hanya diakses server lewat service role (bypass RLS). Tutup akses anon/authenticated
-- ke tabel baru ini.
alter table public.tahun_pelajaran enable row level security;
revoke all on public.tahun_pelajaran from anon, authenticated;
