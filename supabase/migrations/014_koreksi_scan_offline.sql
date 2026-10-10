-- 014_koreksi_scan_offline.sql
-- "Scan paling awal menang" untuk sinkronisasi antrean offline, aman terhadap request bersamaan.
--
-- 1. absensi_log.scan_id: identitas unik satu item antrean offline (UUID dari perangkat).
--    Unique (partial) -> memproses ulang item yang sama tidak mengulang efek apa pun.
-- 2. koreksi_absen_masuk(): satu transaksi yang mengunci baris absensi (FOR UPDATE), memeriksa
--    ulang syarat koreksi, mengubah jam masuk/status, dan menulis log. Dua perangkat yang
--    sinkron bersamaan akan antre di row lock; yang kedua membaca data terbaru, sehingga tidak
--    ada yang saling menimpa secara keliru dan jam hanya bisa bergeser ke arah LEBIH AWAL.
--
-- Aturan koreksi:
--   * hadir/terlambat tercatat lebih lambat dari jam scan -> jam & status dikoreksi
--   * alpha dari sistem (keterangan = p_ket_alpha_sistem) -> hadir/terlambat sesuai jam scan
--   * izin, sakit, dan alpha manual TIDAK ditimpa
-- Aman dijalankan ulang.

alter table public.absensi_log add column if not exists scan_id text;

create unique index if not exists uq_absensi_log_scan_id
  on public.absensi_log (scan_id)
  where scan_id is not null;

create or replace function public.koreksi_absen_masuk(
  p_siswa_id         bigint,
  p_tanggal          date,
  p_jam              time,
  p_status_baru      text,
  p_ket_alpha_sistem text,
  p_scanner_id       text,
  p_scan_oleh        text,
  p_admin_id         bigint,
  p_scan_id          text
)
returns table (dikoreksi boolean, status_lama text, jam_lama time)
language plpgsql
as $$
declare
  v_id     bigint;
  v_status text;
  v_jam    time;
  v_ket    text;
  v_log    text;
begin
  if p_status_baru not in ('hadir', 'terlambat') then
    raise exception 'status_baru tidak valid: %', p_status_baru;
  end if;

  -- Kunci baris absensi: sinkronisasi bersamaan diserialkan di sini.
  select a.id, a.status, a.jam_masuk, a.keterangan
    into v_id, v_status, v_jam, v_ket
  from public.absensi a
  where a.siswa_id = p_siswa_id and a.tanggal = p_tanggal
  for update;

  if not found then
    return query select false, null::text, null::time;
    return;
  end if;

  -- Periksa ulang syarat koreksi terhadap data TERBARU (setelah lock didapat).
  if not (
       (v_status in ('hadir', 'terlambat') and v_jam is not null and v_jam > p_jam)
    or (v_status = 'alpha' and v_ket is not distinct from p_ket_alpha_sistem)
  ) then
    return query select false, v_status, v_jam;
    return;
  end if;

  v_log := case
    when v_status = 'alpha' then
      format('Koreksi scan offline: alpha otomatis → %s %s', p_status_baru, to_char(p_jam, 'HH24:MI'))
    else
      format('Koreksi scan offline: %s %s → %s %s', v_status, to_char(v_jam, 'HH24:MI'), p_status_baru, to_char(p_jam, 'HH24:MI'))
  end;

  -- Log lebih dulu: kalau scan_id ini sudah pernah diproses, berhenti tanpa mengubah apa pun.
  if p_scan_id is not null then
    insert into public.absensi_log (admin_id, siswa_id, tanggal_absen, status_lama, status_baru, keterangan, scanner_id, scan_id)
    values (p_admin_id, p_siswa_id, p_tanggal, v_status, p_status_baru, v_log, p_scanner_id, p_scan_id)
    on conflict (scan_id) where scan_id is not null do nothing;
    if not found then
      return query select false, v_status, v_jam;
      return;
    end if;
  else
    insert into public.absensi_log (admin_id, siswa_id, tanggal_absen, status_lama, status_baru, keterangan, scanner_id)
    values (p_admin_id, p_siswa_id, p_tanggal, v_status, p_status_baru, v_log, p_scanner_id);
  end if;

  update public.absensi
     set jam_masuk  = p_jam,
         status     = p_status_baru,
         keterangan = case when v_status = 'alpha' then null else keterangan end,
         scan_oleh  = p_scan_oleh,
         scanner_id = p_scanner_id
   where id = v_id;

  return query select true, v_status, v_jam;
end;
$$;

-- Dipanggil lewat service role (server) saja.
revoke all on function public.koreksi_absen_masuk(bigint, date, time, text, text, text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.koreksi_absen_masuk(bigint, date, time, text, text, text, text, bigint, text) to service_role;
