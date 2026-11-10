-- Uji migrasi 027 (pengajuan izin/sakit). Database LOKAL/UJI dengan migrasi 001-027; satu transaksi, di-ROLLBACK.
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/pengajuan_izin.test.sql nama_db_uji
-- Tanggal dihitung relatif terhadap hari ini (WIB), jadi tes tidak lapuk. JANGAN dijalankan di produksi.
\set ON_ERROR_STOP on
begin;

create function pg_temp.cek(label text, kondisi boolean) returns void language plpgsql as $$
begin
  if kondisi is not true then raise exception 'GAGAL: %', label; end if;
  raise notice 'OK    : %', label;
end $$;
create function pg_temp.galat(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return null; exception when others then return sqlerrm; end $$;

create function pg_temp.hari() returns date language sql as $$ select (now() at time zone 'Asia/Jakarta')::date $$;
-- n-th hari sekolah SEBELUM hari ini (1 = terakhir) / SESUDAH hari ini (1 = pertama)
create function pg_temp.lalu(n int) returns date language sql as $$
  select d from hari_sekolah_rentang(pg_temp.hari() - 25, pg_temp.hari() - 1) d order by d desc offset n - 1 limit 1 $$;
create function pg_temp.depan(n int) returns date language sql as $$
  select d from hari_sekolah_rentang(pg_temp.hari() + 1, pg_temp.hari() + 25) d order by d offset n - 1 limit 1 $$;

-- data contoh migrasi 001 (absensi tapel 2025/2026 bertanggal RELATIF terhadap hari DB dibuat) bisa jatuh di rentang tanggal uji
delete from students where nisn like '00912345%';
delete from absensi_setting;
insert into absensi_setting (tapel, semester)
  select case when extract(month from pg_temp.hari()) >= 7
              then extract(year from pg_temp.hari())::int || '/' || (extract(year from pg_temp.hari())::int + 1)
              else (extract(year from pg_temp.hari())::int - 1) || '/' || extract(year from pg_temp.hari())::int end,
         case when extract(month from pg_temp.hari()) >= 7 then 'ganjil' else 'genap' end;

insert into students (name, class, nisn)
  select 'PGJ ' || i, '5', 'PG-' || i from generate_series(1, 25) i;
create function pg_temp.sid(i int) returns bigint language sql as $$ select id from students where nisn = 'PG-' || i $$;
create function pg_temp.n_absen(i int) returns bigint language sql as $$ select count(*) from absensi where siswa_id = pg_temp.sid(i) $$;
create function pg_temp.hasil(pid bigint, t date) returns text language sql as $$
  select hasil from pengajuan_izin_hari where pengajuan_id = pid and tanggal = t $$;
create function pg_temp.st(i int, t date) returns text language sql as $$
  select status from absensi where siswa_id = pg_temp.sid(i) and tanggal = t $$;
create function pg_temp.ajukan_id(i int, jenis text, d1 date, d2 date, lamp text default null) returns bigint language sql as $$
  select (ajukan_pengajuan_izin(pg_temp.sid(i), jenis, d1, d2, 'alasan uji pengajuan', lamp) ->> 'id')::bigint $$;

-- ═══ A. MENGAJUKAN ═══════════════════════════════════════════════════════════════════════════
create temp table _a as select pg_temp.ajukan_id(1, 'sakit', pg_temp.depan(1), pg_temp.depan(2)) as id;
select pg_temp.cek('A1 sakit 2 hari sekolah (tanpa lampiran) diterima, status Menunggu',
  (select status = 'menunggu' from pengajuan_izin where id = (select id from _a))
  and (select count(*) = 2 from pengajuan_izin_hari where pengajuan_id = (select id from _a)));
select pg_temp.cek('A2 pengajuan TIDAK mengubah absensi sama sekali', pg_temp.n_absen(1) = 0);
select pg_temp.cek('A3 tumpang tindih tanggal ditolak',
  pg_temp.galat(format('select ajukan_pengajuan_izin(%s, %L, %L, %L, %L)', pg_temp.sid(1), 'izin', pg_temp.depan(2), pg_temp.depan(2), 'alasan uji')) like 'Sudah ada pengajuan lain%');
select pg_temp.ajukan_id(1, 'izin', pg_temp.depan(5), pg_temp.depan(5));
select pg_temp.ajukan_id(1, 'izin', pg_temp.depan(6), pg_temp.depan(6));
select pg_temp.cek('A4 pengajuan Menunggu keempat ditolak (maks 3)',
  pg_temp.galat(format('select ajukan_pengajuan_izin(%s, %L, %L, %L, %L)', pg_temp.sid(1), 'izin', pg_temp.depan(7), pg_temp.depan(7), 'alasan uji')) like 'Masih ada 3%');

select pg_temp.cek('A5 sakit >2 hari sekolah tanpa lampiran ditolak',
  pg_temp.galat(format('select ajukan_pengajuan_izin(%s, %L, %L, %L, %L)', pg_temp.sid(2), 'sakit', pg_temp.lalu(3), pg_temp.lalu(1), 'alasan uji')) like 'Lampiran%wajib%');
select pg_temp.cek('A6 sakit 3 hari sekolah dengan lampiran diterima',
  pg_temp.galat(format('select ajukan_pengajuan_izin(%s, %L, %L, %L, %L, %L)', pg_temp.sid(2), 'sakit', pg_temp.lalu(3), pg_temp.lalu(1), 'alasan uji', 'https://x/y.jpg')) is null);
select pg_temp.cek('A7 izin lebih dari 1 hari ditolak',
  pg_temp.galat(format('select ajukan_pengajuan_izin(%s, %L, %L, %L, %L)', pg_temp.sid(3), 'izin', pg_temp.depan(1), pg_temp.depan(2), 'alasan uji')) like 'Izin hanya untuk satu hari%');
select pg_temp.cek('A8 izin pada hari Minggu ditolak',
  pg_temp.galat(format('select ajukan_pengajuan_izin(%s, %L, %L, %L, %L)', pg_temp.sid(3), 'izin',
    (select d from generate_series(pg_temp.hari() + 1, pg_temp.hari() + 8, interval '1 day') g(d) where extract(isodow from d) = 7 limit 1)::date,
    (select d from generate_series(pg_temp.hari() + 1, pg_temp.hari() + 8, interval '1 day') g(d) where extract(isodow from d) = 7 limit 1)::date, 'alasan uji')) like '%tidak memuat hari sekolah%');
select pg_temp.cek('A9 sakit lebih dari 14 hari ditolak',
  pg_temp.galat(format('select ajukan_pengajuan_izin(%s, %L, %L, %L, %L, %L)', pg_temp.sid(3), 'sakit', pg_temp.hari(), pg_temp.hari() + 14, 'alasan uji', 'https://x/y.jpg')) like '%paling lama 14%');
select pg_temp.cek('A10 lebih dari 7 hari ke belakang ditolak',
  pg_temp.galat(format('select ajukan_pengajuan_izin(%s, %L, %L, %L, %L, %L)', pg_temp.sid(3), 'sakit', pg_temp.hari() - 8, pg_temp.hari() - 8, 'alasan uji', 'https://x/y.jpg')) like '%ke belakang%');
select pg_temp.cek('A11 lebih dari 30 hari ke depan ditolak',
  pg_temp.galat(format('select ajukan_pengajuan_izin(%s, %L, %L, %L, %L, %L)', pg_temp.sid(3), 'sakit', pg_temp.hari() + 31, pg_temp.hari() + 31, 'alasan uji', 'https://x/y.jpg')) like '%ke depan%');

-- Jumat..Selasa (melewati Minggu) = 4 hari sekolah, Minggu dilewati
create temp table _jum as select pg_temp.hari() + ((5 - extract(isodow from pg_temp.hari())::int + 7) % 7) + 7 as d;
create temp table _b as select pg_temp.ajukan_id(3, 'sakit', (select d from _jum), (select d from _jum) + 4, 'https://x/y.jpg') as id;
select pg_temp.cek('A12 rentang Jumat..Selasa: Minggu dilewati, 4 hari sekolah',
  (select count(*) = 4 from pengajuan_izin_hari where pengajuan_id = (select id from _b))
  and not exists (select 1 from pengajuan_izin_hari where pengajuan_id = (select id from _b) and extract(isodow from tanggal) = 7));

create temp table _lib as select pg_temp.depan(10) as d;   -- tanggal libur ditetapkan SEBELUM dimasukkan (depan() mengecualikan libur)
insert into hari_libur (tanggal, keterangan) select d, 'uji libur' from _lib;
select pg_temp.cek('A13 izin pada hari libur ditolak',
  pg_temp.galat(format('select ajukan_pengajuan_izin(%s, %L, %L, %L, %L)', pg_temp.sid(4), 'izin', (select d from _lib), (select d from _lib), 'alasan uji')) like '%tidak memuat hari sekolah%');
update students set status = 'pindah' where nisn = 'PG-14';
select pg_temp.cek('A14 siswa nonaktif tidak bisa mengajukan',
  pg_temp.galat(format('select ajukan_pengajuan_izin(%s, %L, %L, %L, %L)', pg_temp.sid(14), 'izin', pg_temp.depan(1), pg_temp.depan(1), 'alasan uji')) = 'Siswa tidak aktif.');

-- ═══ B. KEPUTUSAN ════════════════════════════════════════════════════════════════════════════
-- B1: setujui semua hari lampau tanpa catatan -> ditulis sebagai sakit
create temp table _p4 as select pg_temp.ajukan_id(4, 'sakit', pg_temp.lalu(3), pg_temp.lalu(1), 'https://x/lamp.jpg') as id;
select putuskan_pengajuan_izin((select id from _p4), 'setujui', null, null, 1, 'Wali Uji');
select pg_temp.cek('B1 hari lampau disetujui: ditulis sebagai sakit lengkap dengan lampiran & keterangan',
  (select count(*) = 3 and bool_and(status = 'sakit' and lampiran = 'https://x/lamp.jpg' and keterangan like 'Disetujui: sakit%') from absensi where siswa_id = pg_temp.sid(4))
  and (select status = 'disetujui' from pengajuan_izin where id = (select id from _p4))
  and (select bool_and(hasil = 'ditulis') from pengajuan_izin_hari where pengajuan_id = (select id from _p4)));

-- B2: sakit 3 hari; hari 1 sudah Alpha, hari 2 sudah scan Hadir, hari 3 kosong
create temp table _p5 as select pg_temp.ajukan_id(5, 'sakit', pg_temp.lalu(3), pg_temp.lalu(1), 'https://x/lamp.jpg') as id;
insert into absensi (siswa_id, tanggal, status, tapel, semester, jam_masuk, scan_oleh)
  select pg_temp.sid(5), pg_temp.lalu(2), 'hadir', (select tapel from absensi_setting), (select semester from absensi_setting), '07:00', 'scan';
insert into absensi (siswa_id, tanggal, status, tapel, semester, scan_oleh)
  select pg_temp.sid(5), pg_temp.lalu(3), 'alpha', (select tapel from absensi_setting), (select semester from absensi_setting), 'admin';
select putuskan_pengajuan_izin((select id from _p5), 'setujui', null, null, 1, 'Wali Uji');
select pg_temp.cek('B2 SCAN MENANG: hari yang sudah Hadir tidak ditimpa; hasil scan_menang',
  pg_temp.st(5, pg_temp.lalu(2)) = 'hadir' and pg_temp.hasil((select id from _p5), pg_temp.lalu(2)) = 'scan_menang');
select pg_temp.cek('B3 pengajuan tetap DISETUJUI untuk seluruh rentang walau satu hari tertimpa scan (riwayat administrasi utuh)',
  (select status = 'disetujui' from pengajuan_izin where id = (select id from _p5))
  and (select count(*) = 3 from pengajuan_izin_hari where pengajuan_id = (select id from _p5) and disetujui));
select pg_temp.cek('B4 Alpha lama pada hari yang disetujui diubah menjadi sakit; hari kosong ditulis sakit',
  pg_temp.st(5, pg_temp.lalu(3)) = 'sakit' and pg_temp.st(5, pg_temp.lalu(1)) = 'sakit'
  and pg_temp.hasil((select id from _p5), pg_temp.lalu(3)) = 'ditulis' and pg_temp.hasil((select id from _p5), pg_temp.lalu(1)) = 'ditulis');

-- B5: persetujuan sebagian: hari ke-3 tidak disetujui -> TIDAK otomatis sakit; hari lampau tanpa catatan dievaluasi Alpha
create temp table _p6 as select pg_temp.ajukan_id(6, 'sakit', pg_temp.lalu(3), pg_temp.lalu(1), 'https://x/lamp.jpg') as id;
select putuskan_pengajuan_izin((select id from _p6), 'setujui', array[pg_temp.lalu(3), pg_temp.lalu(2)], 'hanya 2 hari', 1, 'Wali Uji');
select pg_temp.cek('B5 persetujuan sebagian: status disetujui_sebagian, 2 hari sakit',
  (select status = 'disetujui_sebagian' from pengajuan_izin where id = (select id from _p6))
  and pg_temp.st(6, pg_temp.lalu(3)) = 'sakit' and pg_temp.st(6, pg_temp.lalu(2)) = 'sakit');
select pg_temp.cek('B6 hari yang tidak disetujui (lampau, tanpa catatan) dievaluasi ulang sebagai ALPHA, bukan sakit',
  pg_temp.st(6, pg_temp.lalu(1)) = 'alpha' and pg_temp.hasil((select id from _p6), pg_temp.lalu(1)) = 'dialpha');

-- B7/B8: tolak (lampau -> Alpha; mendatang -> tidak ada Alpha)
create temp table _p7 as select pg_temp.ajukan_id(7, 'izin', pg_temp.lalu(1), pg_temp.lalu(1)) as id;
select putuskan_pengajuan_izin((select id from _p7), 'tolak', null, 'tidak ada surat', 1, 'Wali Uji');
select pg_temp.cek('B7 ditolak: hari lampau tanpa catatan dievaluasi Alpha', pg_temp.st(7, pg_temp.lalu(1)) = 'alpha'
  and (select status = 'ditolak' and catatan_keputusan = 'tidak ada surat' from pengajuan_izin where id = (select id from _p7)));
create temp table _p8 as select pg_temp.ajukan_id(8, 'sakit', pg_temp.depan(1), pg_temp.depan(2)) as id;
select putuskan_pengajuan_izin((select id from _p8), 'tolak', null, null, 1, 'Wali Uji');
select pg_temp.cek('B8 ditolak untuk hari mendatang: tidak ada Alpha ditulis', pg_temp.n_absen(8) = 0);

-- B9: disetujui untuk hari mendatang = RENCANA, tidak menulis absensi
create temp table _p9 as select pg_temp.ajukan_id(9, 'sakit', pg_temp.depan(1), pg_temp.depan(2)) as id;
select putuskan_pengajuan_izin((select id from _p9), 'setujui', null, null, 1, 'Wali Uji');
select pg_temp.cek('B9 hari mendatang disetujui hanya sebagai rencana (tidak ada baris absensi)',
  pg_temp.n_absen(9) = 0 and (select bool_and(hasil = 'direncanakan') from pengajuan_izin_hari where pengajuan_id = (select id from _p9)));
select pg_temp.cek('B10 keputusan ganda ditolak',
  pg_temp.galat(format('select putuskan_pengajuan_izin(%s, %L, null, null, 1, %L)', (select id from _p9), 'tolak', 'x')) = 'Pengajuan sudah diputuskan.');

-- B11: hari yang sudah punya izin/sakit lain dibiarkan
create temp table _p10 as select pg_temp.ajukan_id(10, 'izin', pg_temp.lalu(1), pg_temp.lalu(1)) as id;
insert into absensi (siswa_id, tanggal, status, keterangan, tapel, semester)
  select pg_temp.sid(10), pg_temp.lalu(1), 'izin', 'dicatat guru', (select tapel from absensi_setting), (select semester from absensi_setting);
select putuskan_pengajuan_izin((select id from _p10), 'setujui', null, null, 1, 'Wali Uji');
select pg_temp.cek('B11 hari yang sudah izin/sakit dibiarkan (sudah_tercatat), keterangan guru utuh',
  pg_temp.hasil((select id from _p10), pg_temp.lalu(1)) = 'sudah_tercatat'
  and (select keterangan = 'dicatat guru' from absensi where siswa_id = pg_temp.sid(10) and tanggal = pg_temp.lalu(1)));

-- ═══ C. MEMBATALKAN ══════════════════════════════════════════════════════════════════════════
create temp table _p11 as select pg_temp.ajukan_id(11, 'izin', pg_temp.lalu(1), pg_temp.lalu(1)) as id;
select pg_temp.cek('C1 batal oleh siswa lain ditolak',
  pg_temp.galat(format('select batalkan_pengajuan_izin(%s, %s)', (select id from _p11), pg_temp.sid(12))) = 'Pengajuan tidak ditemukan.');
select batalkan_pengajuan_izin((select id from _p11), pg_temp.sid(11));
select pg_temp.cek('C2 dibatalkan: hari lampau tanpa catatan dievaluasi ALPHA; tanggal dilepas dari pengajuan aktif',
  pg_temp.st(11, pg_temp.lalu(1)) = 'alpha'
  and (select status = 'dibatalkan' from pengajuan_izin where id = (select id from _p11))
  and not exists (select 1 from pengajuan_izin_hari where pengajuan_id = (select id from _p11) and aktif));
select pg_temp.cek('C3 pengajuan yang sudah diputuskan tidak bisa dibatalkan',
  pg_temp.galat(format('select batalkan_pengajuan_izin(%s, %s)', (select id from _p9), pg_temp.sid(9))) = 'Pengajuan sudah diputuskan, tidak dapat dibatalkan.');
select pg_temp.cek('C4 setelah dibatalkan, tanggal itu bisa diajukan lagi',
  pg_temp.galat(format('select ajukan_pengajuan_izin(%s, %L, %L, %L, %L)', pg_temp.sid(11), 'izin', pg_temp.depan(3), pg_temp.depan(3), 'alasan uji')) is null);
create temp table _p12 as select pg_temp.ajukan_id(12, 'izin', pg_temp.depan(3), pg_temp.depan(3)) as id;
select batalkan_pengajuan_izin((select id from _p12), pg_temp.sid(12));
select pg_temp.cek('C5 dibatalkan untuk hari mendatang: tidak ada Alpha', pg_temp.n_absen(12) = 0);

-- ═══ D. CRON ═════════════════════════════════════════════════════════════════════════════════
-- siswa 9: rencana sakit depan(1..2). siswa 13: izin depan(3) disetujui lalu SCAN Hadir. siswa 14 -> dipakai sbg aktif lagi.
update students set status = 'aktif' where nisn = 'PG-14';
create temp table _p13 as select pg_temp.ajukan_id(13, 'izin', pg_temp.depan(4), pg_temp.depan(4)) as id;
select putuskan_pengajuan_izin((select id from _p13), 'setujui', null, null, 1, 'Wali Uji');
insert into absensi (siswa_id, tanggal, status, tapel, semester, jam_masuk, scan_oleh)
  select pg_temp.sid(13), pg_temp.depan(4), 'terlambat', (select tapel from absensi_setting), (select semester from absensi_setting), '07:40', 'scan';
create temp table _p14 as select pg_temp.ajukan_id(14, 'izin', pg_temp.depan(4), pg_temp.depan(4)) as id;
select putuskan_pengajuan_izin((select id from _p14), 'setujui', null, null, 1, 'Wali Uji');
insert into absensi (siswa_id, tanggal, status, keterangan, tapel, semester, scan_oleh)
  select pg_temp.sid(14), pg_temp.depan(4), 'alpha', 'alpha manual sebelum cron', (select tapel from absensi_setting), (select semester from absensi_setting), 'admin';
create temp table _p3b as select pg_temp.ajukan_id(2, 'izin', pg_temp.depan(4), pg_temp.depan(4)) as id;   -- MENUNGGU pada tanggal yang sama

create temp table _cron1 as select terapkan_rencana_pengajuan(pg_temp.depan(1)) as r;
select pg_temp.cek('D1 cron: rencana sakit tanpa catatan ditulis sebagai sakit (siswa 9)',
  pg_temp.st(9, pg_temp.depan(1)) = 'sakit' and pg_temp.hasil((select id from _p9), pg_temp.depan(1)) = 'ditulis');
select pg_temp.cek('D2 cron idempoten: dijalankan lagi tidak mengubah apa pun',
  (terapkan_rencana_pengajuan(pg_temp.depan(1)) ->> 'ditulis')::int = 0 and pg_temp.n_absen(9) = 1);
create temp table _cron4 as select terapkan_rencana_pengajuan(pg_temp.depan(4)) as r;
select pg_temp.cek('D3 SCAN MENANG di hari rencana: Terlambat tidak ditimpa izin; pengajuan tetap Disetujui',
  pg_temp.st(13, pg_temp.depan(4)) = 'terlambat' and pg_temp.hasil((select id from _p13), pg_temp.depan(4)) = 'scan_menang'
  and (select status = 'disetujui' from pengajuan_izin where id = (select id from _p13)));
select pg_temp.cek('D4 izin tetap berlaku bila siswa tidak scan, walau Alpha manual sudah ditulis sebelum cron (Alpha diubah jadi izin)',
  pg_temp.st(14, pg_temp.depan(4)) = 'izin' and pg_temp.hasil((select id from _p14), pg_temp.depan(4)) = 'ditulis');
select pg_temp.cek('D5 cron melaporkan siswa dengan pengajuan MENUNGGU hari itu (tidak boleh diberi Alpha/WA Alpha)',
  (select (r -> 'menunggu') @> to_jsonb(pg_temp.sid(2)) from _cron4)
  and not (select (r -> 'menunggu') @> to_jsonb(pg_temp.sid(13)) from _cron4));
select pg_temp.cek('D6 pengajuan Menunggu tidak ditulis cron (belum diputuskan)', pg_temp.n_absen(2) = 0 or pg_temp.st(2, pg_temp.depan(4)) is null);

-- ═══ E. HAK AKSES ════════════════════════════════════════════════════════════════════════════
select pg_temp.cek('E1 anon/authenticated tidak boleh menjalankan fungsi pengajuan; service_role boleh',
  not has_function_privilege('anon', 'putuskan_pengajuan_izin(bigint,text,date[],text,bigint,text)', 'execute')
  and not has_function_privilege('authenticated', 'ajukan_pengajuan_izin(bigint,text,date,date,text,text)', 'execute')
  and has_function_privilege('service_role', 'terapkan_rencana_pengajuan(date)', 'execute'));

-- ═══ F. PIN ORANG TUA (ACAK, tanpa PIN bawaan) ═══════════════════════════════════════════════
select pg_temp.cek('F1 PIN belum dibuat: ditolak PIN_BELUM_DIATUR; "123456" TIDAK diterima (tidak ada PIN bawaan) dan tak ada penghitung percobaan',
  (verifikasi_pin_ortu(pg_temp.sid(15), '123456') ->> 'kode') = 'PIN_BELUM_DIATUR'
  and (verifikasi_pin_ortu(pg_temp.sid(15), '000000') ->> 'kode') = 'PIN_BELUM_DIATUR'
  and not exists (select 1 from kunci_ortu where siswa_id = pg_temp.sid(15) and gagal > 0));
create temp table _acak as select * from buat_pin_acak_ortu(array[pg_temp.sid(15), pg_temp.sid(16), pg_temp.sid(17)]);
select pg_temp.cek('F2 PIN acak: 6 digit, tidak mudah ditebak, hanya hash bcrypt tersimpan, BELUM ditandai dibagikan',
  (select count(*) = 3 and bool_and(pin ~ '^[0-9]{6}$' and not pin_terlalu_mudah(pin) and pin <> '000000') from _acak)
  and (select bool_and(pin_hash like '$2%' and dibagikan_pada is null) from kunci_ortu where siswa_id in (pg_temp.sid(15), pg_temp.sid(16), pg_temp.sid(17))));
create function pg_temp.pin(i int) returns text language sql as $$ select pin from _acak where siswa_id = pg_temp.sid(i) $$;
create temp table _f3 as select verifikasi_pin_ortu(pg_temp.sid(15), pg_temp.pin(15)) as r;
select pg_temp.cek('F3 PIN acak yang benar diterima', (select (r ->> 'ok')::boolean from _f3));

select pg_temp.cek('F4 PIN salah: sisa percobaan menurun 4,3,2,1; ke-5 mengunci',
  (verifikasi_pin_ortu(pg_temp.sid(16), '000001') ->> 'sisa_percobaan')::int = 4
  and (verifikasi_pin_ortu(pg_temp.sid(16), '000002') ->> 'sisa_percobaan')::int = 3
  and (verifikasi_pin_ortu(pg_temp.sid(16), '000003') ->> 'sisa_percobaan')::int = 2
  and (verifikasi_pin_ortu(pg_temp.sid(16), '000004') ->> 'sisa_percobaan')::int = 1
  and (verifikasi_pin_ortu(pg_temp.sid(16), '000005') ->> 'kode') = 'TERKUNCI');
select pg_temp.cek('F5 saat terkunci, PIN yang BENAR pun ditolak',
  (verifikasi_pin_ortu(pg_temp.sid(16), pg_temp.pin(16)) ->> 'kode') = 'TERKUNCI');
update kunci_ortu set terkunci_sampai = now() - interval '1 minute' where siswa_id = pg_temp.sid(16);
create temp table _f6 as select verifikasi_pin_ortu(pg_temp.sid(16), pg_temp.pin(16)) as r;
select pg_temp.cek('F6 kunci kedaluwarsa: PIN benar diterima dan penghitung direset',
  (select (r ->> 'ok')::boolean from _f6) and (select gagal = 0 and terkunci_sampai is null from kunci_ortu where siswa_id = pg_temp.sid(16)));
update kunci_ortu set gagal = 9 where siswa_id = pg_temp.sid(16);
select pg_temp.cek('F7 penguncian bertahap: kegagalan ke-10 mengunci 30 menit (dua kali lipat)',
  (verifikasi_pin_ortu(pg_temp.sid(16), '999999') ->> 'menit')::int = 30);
update kunci_ortu set gagal = 0, terkunci_sampai = null where siswa_id = pg_temp.sid(16);

select pg_temp.cek('F8 ganti PIN sendiri: butuh PIN lama yang benar; PIN mudah/format salah ditolak',
  (atur_pin_ortu(pg_temp.sid(17), '482916', '000000') ->> 'kode') = 'PIN_SALAH'
  and (atur_pin_ortu(pg_temp.sid(17), '111111', pg_temp.pin(17)) ->> 'kode') = 'PIN_TERLALU_MUDAH'
  and (atur_pin_ortu(pg_temp.sid(17), '12ab56', pg_temp.pin(17)) ->> 'kode') = 'PIN_FORMAT');
select pg_temp.cek('F9 ganti PIN berhasil: PIN lama tidak berlaku lagi, PIN baru berlaku',
  (atur_pin_ortu(pg_temp.sid(17), '482916', pg_temp.pin(17)) ->> 'ok')::boolean
  and (verifikasi_pin_ortu(pg_temp.sid(17), pg_temp.pin(17)) ->> 'kode') = 'PIN_SALAH'
  and (verifikasi_pin_ortu(pg_temp.sid(17), '482916') ->> 'ok')::boolean);

-- "dibagikan" HANYA lewat tindakan eksplisit; membuat/mereset PIN selalu mengosongkannya
create temp table _f10 as select tandai_pin_dibagikan(array[pg_temp.sid(15)]) as pertama;
create temp table _f10b as select tandai_pin_dibagikan(array[pg_temp.sid(15)]) as kedua;
select pg_temp.cek('F10 tandai_pin_dibagikan: hanya siswa yang dipilih, sekali saja',
  (select pertama = 1 from _f10) and (select kedua = 0 from _f10b)
  and (select dibagikan_pada is not null from kunci_ortu where siswa_id = pg_temp.sid(15))
  and (select dibagikan_pada is null from kunci_ortu where siswa_id = pg_temp.sid(16)));
create temp table _reset as select pg_temp.pin(15) as lama, reset_pin_ortu(pg_temp.sid(15)) as baru;
select pg_temp.cek('F11 reset: PIN ACAK BARU (bukan yang lama), PIN lama mati, kunci dibuka, status "dibagikan" dikosongkan',
  (select baru ~ '^[0-9]{6}$' and baru <> lama from _reset)
  and (verifikasi_pin_ortu(pg_temp.sid(15), (select lama from _reset)) ->> 'kode') = 'PIN_SALAH'
  and (select dibagikan_pada is null and gagal <= 1 from kunci_ortu where siswa_id = pg_temp.sid(15)));
create temp table _f11b as select verifikasi_pin_ortu(pg_temp.sid(15), (select baru from _reset)) as r;
select pg_temp.cek('F12 PIN baru hasil reset bisa dipakai', (select (r ->> 'ok')::boolean from _f11b));
create temp table _f13 as select atur_pin_ortu(pg_temp.sid(16), '735190', null, true) as r;
select pg_temp.cek('F13 admin/wali (paksa) mengatur PIN tanpa PIN lama; dibagikan_pada dikosongkan',
  (select (r ->> 'ok')::boolean from _f13) and (select dibagikan_pada is null from kunci_ortu where siswa_id = pg_temp.sid(16)));
select pg_temp.cek('F13b tanpa paksa tetap wajib PIN lama (tanpa PIN lama ditolak)',
  (atur_pin_ortu(pg_temp.sid(16), '264810', null, false) ->> 'kode') = 'PIN_SALAH');
insert into students (name, class, nisn) values ('PGJ nonaktif', '5', 'PG-26');
update students set status = 'pindah' where nisn = 'PG-26';
select pg_temp.cek('F14 siswa nonaktif tidak bisa diverifikasi PIN-nya',
  (verifikasi_pin_ortu((select id from students where nisn = 'PG-26'), '123456') ->> 'kode') = 'SISWA_TIDAK_AKTIF');

-- ═══ G/H/I. PENGAMAN ═════════════════════════════════════════════════════════════════════════
create temp table _p20 as select pg_temp.ajukan_id(20, 'izin', pg_temp.lalu(2), pg_temp.lalu(2)) as id;
insert into hari_libur (tanggal, keterangan) values (pg_temp.lalu(2), 'libur ditetapkan belakangan');
select putuskan_pengajuan_izin((select id from _p20), 'tolak', null, null, 1, 'Wali Uji');
select pg_temp.cek('G1 libur yang ditetapkan SESUDAH pengajuan: penolakan tidak menulis Alpha di hari libur',
  pg_temp.st(20, (select tanggal_dari from pengajuan_izin where id = (select id from _p20))) is null);

create temp table _p19 as select pg_temp.ajukan_id(19, 'izin', pg_temp.lalu(1), pg_temp.lalu(1)) as id;
delete from riwayat_kelas where siswa_id = pg_temp.sid(19);
select pg_temp.cek('H1 siswa tanpa riwayat kelas: penolakan tidak menulis baris absensi yatim dan tidak error',
  pg_temp.galat(format('select putuskan_pengajuan_izin(%s, %L, null, null, 1, %L)', (select id from _p19), 'tolak', 'x')) is null
  and pg_temp.n_absen(19) = 0);

create temp table _p18 as select pg_temp.ajukan_id(18, 'izin', pg_temp.depan(8), pg_temp.depan(8)) as id;
create temp table _p17 as select pg_temp.ajukan_id(17, 'izin', pg_temp.depan(8), pg_temp.depan(8)) as id;
select putuskan_pengajuan_izin((select id from _p18), 'setujui', null, null, 1, 'Wali Uji');
select putuskan_pengajuan_izin((select id from _p17), 'setujui', null, null, 1, 'Wali Uji');
delete from riwayat_kelas where siswa_id = pg_temp.sid(18);
create temp table _cron8 as select terapkan_rencana_pengajuan(pg_temp.depan(8)) as r;
select pg_temp.cek('I1 cron: satu siswa bermasalah (tanpa riwayat kelas) tidak menggagalkan siswa lain',
  (select (r ->> 'gagal')::int = 1 and (r ->> 'ditulis')::int = 1 from _cron8) and pg_temp.st(17, pg_temp.depan(8)) = 'izin');

select pg_temp.cek('J1 SEMUA pengajuan di atas tidak pernah menulis absensi sebelum diputuskan/harinya tiba',
  (select count(*) = 0 from absensi a join pengajuan_izin p on p.siswa_id = a.siswa_id
   where p.status = 'menunggu' and a.tanggal between p.tanggal_dari and p.tanggal_sampai and a.keterangan like 'Disetujui:%'));

-- ═══ K. STATUS MENUNGGU DI REKAP SQL ═══════════════════════════════════════════════════════
-- S22 pengajuan Menunggu pada lalu(1); S23 punya catatan Hadir pada lalu(1) & lalu(2) -> mendefinisikan hari efektif.
create temp table _p22 as select pg_temp.ajukan_id(22, 'izin', pg_temp.lalu(1), pg_temp.lalu(1)) as id;
insert into absensi (siswa_id, tanggal, status, tapel, semester)
  select pg_temp.sid(23), t, 'hadir', (select tapel from absensi_setting), (select semester from absensi_setting)
  from (values (pg_temp.lalu(1)), (pg_temp.lalu(2))) v(t);
create function pg_temp.hari_dihitung(i int) returns int language sql as $$
  select coalesce((select hari from hari_dihitung_siswa((select tapel from absensi_setting), (select semester from absensi_setting), array[pg_temp.sid(i)])), 0) $$;
select pg_temp.cek('K1 tanggal_menunggu: hanya hari dari pengajuan yang MENUNGGU',
  exists (select 1 from tanggal_menunggu(array[pg_temp.sid(22)], pg_temp.lalu(3), pg_temp.hari()) where tanggal = pg_temp.lalu(1))
  and not exists (select 1 from tanggal_menunggu(array[pg_temp.sid(9)], pg_temp.lalu(10), pg_temp.hari() + 30)));   -- siswa 9: sudah disetujui
select pg_temp.cek('K2 hari_dihitung_siswa: hari Menunggu TIDAK dihitung (selisih tepat 1 hari dibanding siswa yang hadir)',
  pg_temp.hari_dihitung(23) - pg_temp.hari_dihitung(22) = 1);
select pg_temp.cek('K3 hari_belum_tercatat: hari Menunggu tidak diisi Alpha, hari kosong lain tetap',
  not exists (select 1 from hari_belum_tercatat(pg_temp.sid(22), (select tapel from absensi_setting), pg_temp.lalu(3), pg_temp.hari()) where tanggal = pg_temp.lalu(1))
  and exists (select 1 from hari_belum_tercatat(pg_temp.sid(22), (select tapel from absensi_setting), pg_temp.lalu(3), pg_temp.hari()) where tanggal = pg_temp.lalu(2)));
insert into absensi (siswa_id, tanggal, status, tapel, semester, scan_oleh)
  select pg_temp.sid(22), pg_temp.lalu(1), 'alpha', (select tapel from absensi_setting), (select semester from absensi_setting), 'admin';
select pg_temp.cek('K4 rekap_history_siswa: baris Alpha pada hari Menunggu belum dihitung',
  not exists (select 1 from rekap_history_siswa((select tapel from absensi_setting), (select semester from absensi_setting), array[pg_temp.sid(22)]) where status = 'alpha'));
select pg_temp.cek('K5 hari_dihitung_siswa: Alpha pada hari Menunggu juga tidak membuatnya dihitung',
  pg_temp.hari_dihitung(23) - pg_temp.hari_dihitung(22) = 1);
select putuskan_pengajuan_izin((select id from _p22), 'tolak', null, 'tidak ada surat', 1, 'Wali Uji');
select pg_temp.cek('K6 DITOLAK: hari kembali ke baseline (Alpha dihitung, rekap & penyebut sama dengan siswa lain)',
  (select jumlah = 1 from rekap_history_siswa((select tapel from absensi_setting), (select semester from absensi_setting), array[pg_temp.sid(22)]) where status = 'alpha')
  and pg_temp.hari_dihitung(23) = pg_temp.hari_dihitung(22)
  and not exists (select 1 from tanggal_menunggu(array[pg_temp.sid(22)], pg_temp.lalu(3), pg_temp.hari())));
-- catatan nyata menang: pengajuan Menunggu + Hadir (scan terlambat tiba) pada harinya tetap dihitung
create temp table _p24 as select pg_temp.ajukan_id(24, 'izin', pg_temp.lalu(2), pg_temp.lalu(2)) as id;
insert into absensi (siswa_id, tanggal, status, tapel, semester, jam_masuk, scan_oleh)
  select pg_temp.sid(24), pg_temp.lalu(2), 'hadir', (select tapel from absensi_setting), (select semester from absensi_setting), '07:10', 'scan';
select pg_temp.cek('K7 scan menang atas Menunggu: hari dengan catatan Hadir tetap dihitung (hadir tercatat di rekap)',
  (select jumlah = 1 from rekap_history_siswa((select tapel from absensi_setting), (select semester from absensi_setting), array[pg_temp.sid(24)]) where status = 'hadir')
  and pg_temp.hari_dihitung(24) >= 1);
create temp table _k8 as select batalkan_pengajuan_izin((select id from _p24), pg_temp.sid(24)) as r;
select pg_temp.cek('K8 dibatalkan orang tua: hari kembali ke aturan baseline (tidak lagi Menunggu)',
  (select (r ->> 'status') is not null or true from _k8)
  and not exists (select 1 from tanggal_menunggu(array[pg_temp.sid(24)], pg_temp.lalu(3), pg_temp.hari())));

rollback;
