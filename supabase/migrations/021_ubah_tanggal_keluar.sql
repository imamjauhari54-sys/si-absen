-- 021_ubah_tanggal_keluar.sql
-- Mengubah (atau menghapus) tanggal keluar siswa non-aktif dari halaman Siswa Nonaktif.
-- Prasyarat: migrasi 020 (kolom nonaktif_pada & alasan_nonaktif di riwayat_kelas).
--
-- Yang diubah adalah baris riwayat_kelas pada tapel TERAKHIR siswa itu (tapel saat ia keluar).
-- p_tanggal kosong = hapus tanggal keluar (siswa dihitung penuh sepanjang tapel itu di rekap).
-- Kalau baris itu belum punya alasan (mis. lulus lewat wizard kenaikan kelas), alasan diisi dari
-- students.status supaya constraint "tanggal harus punya alasan" terpenuhi.

create or replace function public.ubah_tanggal_keluar(p_id bigint, p_tanggal date)
returns void
language plpgsql
as $$
declare
  v_status text;
  v_tapel  text;
begin
  select status into v_status from public.students where id = p_id;
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

revoke all on function public.ubah_tanggal_keluar(bigint, date) from public, anon, authenticated;
grant execute on function public.ubah_tanggal_keluar(bigint, date) to service_role;
