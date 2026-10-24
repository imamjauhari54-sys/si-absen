-- Uji migrasi 025 (aktifkan_siswa, riwayat_status_siswa, hari_dihitung_siswa, rekap_history_siswa).
--
-- Jalankan di database LOKAL/UJI yang sudah menjalankan migrasi 001-025 (superuser, mis. `postgres`):
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/aktifkan_siswa.test.sql nama_db_uji
--
-- Satu transaksi, di-ROLLBACK di akhir. JANGAN dijalankan di produksi: skrip mengganti absensi_setting
-- sementara dan menambah siswa uji (NISN "UJI-...") serta absensi 10 hari sekolah uji.
\set ON_ERROR_STOP on

begin;

create function pg_temp.cek(label text, kondisi boolean) returns void language plpgsql as $$
begin
  if kondisi is not true then raise exception 'GAGAL: %', label; end if;
  raise notice 'OK    : %', label;
end $$;

create function pg_temp.galat(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return null; exception when others then return sqlerrm; end $$;

create function pg_temp.sid(p_nisn text) returns bigint language sql as $$
  select id from students where nisn = p_nisn $$;

-- tapel aktif uji + 10 hari sekolah (bukan Minggu) dari 30-60 hari lalu; n=1 paling lama.
-- Rentang itu dipilih supaya tidak bertabrakan dengan data contoh migrasi 001; semua tanggal < hari ini.
delete from absensi_setting;
insert into absensi_setting (tapel, semester) values ('2026/2027', 'ganjil');
create temp table _h as
  select row_number() over (order by tanggal) as n, tanggal
  from (select ((now() at time zone 'Asia/Jakarta')::date - g) as tanggal
        from generate_series(30, 60) g
        where extract(isodow from (now() at time zone 'Asia/Jakarta')::date - g) <> 7
        order by g limit 10) x;   -- 30-60 hari lalu: menghindari data contoh migrasi 001 (14 hari terakhir)
create function pg_temp.h(p_n int) returns date language sql as $$ select tanggal from _h where n = p_n $$;
create function pg_temp.hari_ini() returns date language sql as $$ select (now() at time zone 'Asia/Jakarta')::date $$;

insert into students (name, class, nisn) values
  ('UJI REF', '5', 'UJI-R'), ('UJI X', '5', 'UJI-X'), ('UJI Y', '5', 'UJI-Y'),
  ('UJI Z', '5', 'UJI-Z'), ('UJI W', '5', 'UJI-W'), ('UJI N', '5', 'UJI-N');

-- siswa acuan hadir 10 hari -> menentukan "hari sekolah"
insert into absensi (siswa_id, tanggal, status, tapel, semester)
select pg_temp.sid('UJI-R'), tanggal, 'hadir', '2026/2027', 'ganjil' from _h;

-- ─── MODE A: batal pindah ───────────────────────────────────────────────────────────────
insert into absensi (siswa_id, tanggal, status, tapel, semester)
values (pg_temp.sid('UJI-X'), pg_temp.h(1), 'hadir', '2026/2027', 'ganjil'),
       (pg_temp.sid('UJI-X'), pg_temp.h(2), 'hadir', '2026/2027', 'ganjil'),
       (pg_temp.sid('UJI-X'), pg_temp.h(5), 'sakit', '2026/2027', 'ganjil');   -- sudah punya catatan di dalam jeda
select nonaktifkan_siswa(pg_temp.sid('UJI-X'), 'pindah', pg_temp.h(3));

select pg_temp.cek('pratinjau mode A: 7 hari belum tercatat (8 hari sejak pindah - 1 yang sudah ada)',
  (pratinjau_aktifkan_siswa(pg_temp.sid('UJI-X'))->>'hari_belum_tercatat')::int = 7);
select pg_temp.cek('pratinjau memuat tanggal pindah dan bukan lintas tapel',
  (pratinjau_aktifkan_siswa(pg_temp.sid('UJI-X'))->>'pindah_pada')::date = pg_temp.h(3)
  and (pratinjau_aktifkan_siswa(pg_temp.sid('UJI-X'))->>'lintas_tapel')::boolean = false);

select aktifkan_siswa(pg_temp.sid('UJI-X'), 'batal_pindah', null, 1);

select pg_temp.cek('A: status aktif dan tanggal pindah di riwayat_kelas dikosongkan',
  (select status = 'aktif' from students where nisn = 'UJI-X')
  and (select nonaktif_pada is null and alasan_nonaktif is null from riwayat_kelas where siswa_id = pg_temp.sid('UJI-X') and tapel = '2026/2027'));
select pg_temp.cek('A: 7 baris alpha diisi (scan_oleh=admin), hari ini tidak diisi',
  (select count(*) = 7 from absensi where siswa_id = pg_temp.sid('UJI-X') and status = 'alpha' and scan_oleh = 'admin' and tapel = '2026/2027' and semester = 'ganjil')
  and not exists (select 1 from absensi where siswa_id = pg_temp.sid('UJI-X') and tanggal >= pg_temp.hari_ini()));
select pg_temp.cek('A: record "sakit" yang sudah ada tidak ditimpa',
  (select status = 'sakit' from absensi where siswa_id = pg_temp.sid('UJI-X') and tanggal = pg_temp.h(5)));
select pg_temp.cek('A: 10 hari sekolah semuanya punya record (angka rekap sama di semua tampilan)',
  (select count(*) = 10 from absensi where siswa_id = pg_temp.sid('UJI-X')));
select pg_temp.cek('A: riwayat menyimpan tanggal pindah, alasan, mode, jumlah alpha, pelaku',
  (select count(*) = 1 and bool_and(pindah_pada = pg_temp.h(3) and alasan = 'pindah' and mode = 'batal_pindah'
                                     and hari_alpha_diisi = 7 and dikonfirmasi_oleh = 1)
   from riwayat_status_siswa where siswa_id = pg_temp.sid('UJI-X')));
select pg_temp.cek('A: tepat satu baris Log Aktivitas',
  (select count(*) = 1 from log_aktivitas where aksi = 'aktifkan_siswa' and target = 'UJI X'));
select pg_temp.cek('A: hari_dihitung_siswa = 10 hari penuh',
  (select hari = 10 from hari_dihitung_siswa('2026/2027', 'ganjil', array[pg_temp.sid('UJI-X')])));

-- ─── MODE B: kembali setelah jeda ────────────────────────────────────────────────────────
insert into absensi (siswa_id, tanggal, status, tapel, semester)
values (pg_temp.sid('UJI-Y'), pg_temp.h(1), 'hadir', '2026/2027', 'ganjil'),
       (pg_temp.sid('UJI-Y'), pg_temp.h(2), 'hadir', '2026/2027', 'ganjil'),
       (pg_temp.sid('UJI-Y'), pg_temp.h(5), 'hadir', '2026/2027', 'ganjil');   -- di dalam jeda: tidak boleh dihitung
select nonaktifkan_siswa(pg_temp.sid('UJI-Y'), 'pindah', pg_temp.h(3));

select pg_temp.cek('pratinjau mode B: 5 hari jeda (hari 3..7)',
  (pratinjau_aktifkan_siswa(pg_temp.sid('UJI-Y'), pg_temp.h(8))->>'hari_jeda')::int = 5);

select pg_temp.cek('B: tanggal kembali <= tanggal pindah ditolak',
  pg_temp.galat(format('select aktifkan_siswa(%s, %L, %L, 1)', pg_temp.sid('UJI-Y'), 'kembali_setelah_jeda', pg_temp.h(3))) like 'Tanggal kembali harus sesudah%');
select pg_temp.cek('B: tanggal kembali kosong ditolak',
  pg_temp.galat(format('select aktifkan_siswa(%s, %L, null, 1)', pg_temp.sid('UJI-Y'), 'kembali_setelah_jeda')) like 'Tanggal kembali harus sesudah%');
select pg_temp.cek('B: tanggal kembali di masa depan ditolak',
  pg_temp.galat(format('select aktifkan_siswa(%s, %L, %L, 1)', pg_temp.sid('UJI-Y'), 'kembali_setelah_jeda', pg_temp.hari_ini() + 1)) like '%masa depan%');
select pg_temp.cek('mode tidak dikenal ditolak',
  pg_temp.galat(format('select aktifkan_siswa(%s, %L, null, 1)', pg_temp.sid('UJI-Y'), 'asal')) like 'Mode tidak valid%');
select pg_temp.cek('penolakan tidak mengubah apa pun (status masih pindah, belum ada riwayat)',
  (select status = 'pindah' from students where nisn = 'UJI-Y')
  and (select count(*) = 0 from riwayat_status_siswa where siswa_id = pg_temp.sid('UJI-Y')));

select aktifkan_siswa(pg_temp.sid('UJI-Y'), 'kembali_setelah_jeda', pg_temp.h(8), 1);

select pg_temp.cek('B: aktif lagi, tanggal pindah dikosongkan, TIDAK ada alpha yang diisi',
  (select status = 'aktif' from students where nisn = 'UJI-Y')
  and (select nonaktif_pada is null from riwayat_kelas where siswa_id = pg_temp.sid('UJI-Y') and tapel = '2026/2027')
  and (select count(*) = 3 from absensi where siswa_id = pg_temp.sid('UJI-Y')));
select pg_temp.cek('B: riwayat menyimpan jeda [pindah, kembali)',
  (select count(*) = 1 and bool_and(pindah_pada = pg_temp.h(3) and kembali_pada = pg_temp.h(8) and mode = 'kembali_setelah_jeda' and hari_alpha_diisi = 0)
   from riwayat_status_siswa where siswa_id = pg_temp.sid('UJI-Y')));
select pg_temp.cek('B: hari_dihitung_siswa = 5 (hari 1,2,8,9,10)',
  (select hari = 5 from hari_dihitung_siswa('2026/2027', 'ganjil', array[pg_temp.sid('UJI-Y')])));
select pg_temp.cek('B: rekap_history_siswa mengabaikan record di dalam jeda (hadir 2, bukan 3)',
  (select jumlah = 2 from rekap_history_siswa('2026/2027', 'ganjil', array[pg_temp.sid('UJI-Y')]) where status = 'hadir'));

-- pindah lagi di tapel yang sama: aturan pindah + jeda bekerja bersamaan
select nonaktifkan_siswa(pg_temp.sid('UJI-Y'), 'pindah', pg_temp.h(10));
select pg_temp.cek('pindah kedua (hari 10) + jeda lama: dihitung hari 1,2,8,9 = 4',
  (select hari = 4 from hari_dihitung_siswa('2026/2027', 'ganjil', array[pg_temp.sid('UJI-Y')])));

-- jeda yang tumpang tindih ditolak oleh database
select pg_temp.cek('jeda tumpang tindih ditolak constraint (23P01)',
  pg_temp.galat(format($q$insert into riwayat_status_siswa (siswa_id, tapel, mode, pindah_pada, kembali_pada)
                          values (%s, '2026/2027', 'kembali_setelah_jeda', %L, %L)$q$,
                        pg_temp.sid('UJI-Y'), pg_temp.h(6), pg_temp.h(9))) like '%riwayat_status_jeda_tidak_tumpang%');

-- ─── LINTAS TAPEL ───────────────────────────────────────────────────────────────────────
select nonaktifkan_siswa(pg_temp.sid('UJI-Z'), 'pindah', pg_temp.h(2));
update riwayat_kelas set tapel = '2025/2026' where siswa_id = pg_temp.sid('UJI-Z');   -- seolah pindahnya di tapel lama
select pg_temp.cek('pratinjau lintas tapel',
  (pratinjau_aktifkan_siswa(pg_temp.sid('UJI-Z'))->>'lintas_tapel')::boolean);
select aktifkan_siswa(pg_temp.sid('UJI-Z'), 'batal_pindah', null, 1);   -- mode diabaikan
select pg_temp.cek('lintas tapel: tapel lama utuh (tanggal pindah tetap), baris tapel aktif dibuat tanpa tanggal',
  (select nonaktif_pada = pg_temp.h(2) and alasan_nonaktif = 'pindah' from riwayat_kelas where siswa_id = pg_temp.sid('UJI-Z') and tapel = '2025/2026')
  and (select nonaktif_pada is null from riwayat_kelas where siswa_id = pg_temp.sid('UJI-Z') and tapel = '2026/2027'));
select pg_temp.cek('lintas tapel: tidak ada alpha diisi, riwayat bermode lintas_tapel',
  (select count(*) = 0 from absensi where siswa_id = pg_temp.sid('UJI-Z'))
  and (select mode = 'lintas_tapel' and tapel = '2025/2026' from riwayat_status_siswa where siswa_id = pg_temp.sid('UJI-Z')));

-- ─── JARING PENGAMAN: ubah status langsung ───────────────────────────────────────────────
select nonaktifkan_siswa(pg_temp.sid('UJI-W'), 'pindah', pg_temp.h(4));
update students set status = 'aktif' where nisn = 'UJI-W';
select pg_temp.cek('langsung: tanggal pindah disalin ke riwayat sebelum dikosongkan',
  (select count(*) = 1 and bool_and(mode = 'langsung' and pindah_pada = pg_temp.h(4) and alasan = 'pindah')
   from riwayat_status_siswa where siswa_id = pg_temp.sid('UJI-W')));
select pg_temp.cek('aktifkan_siswa() tidak membuat baris "langsung" ganda (X, Y, Z masing-masing 1 baris kejadian)',
  (select count(*) = 1 from riwayat_status_siswa where siswa_id = pg_temp.sid('UJI-X'))
  and (select count(*) = 1 from riwayat_status_siswa where siswa_id = pg_temp.sid('UJI-Z')));
select pg_temp.cek('siswa yang sudah aktif ditolak',
  pg_temp.galat(format('select aktifkan_siswa(%s, %L, null, 1)', pg_temp.sid('UJI-W'), 'batal_pindah')) like 'Siswa ini sudah aktif%');

-- ─── ATOMIK: bentrok NISN membatalkan semuanya ───────────────────────────────────────────
update students set nisn = 'UJI-DUP' where nisn = 'UJI-N';
select nonaktifkan_siswa(pg_temp.sid('UJI-DUP'), 'pindah', pg_temp.h(3));
insert into students (name, class, nisn) values ('UJI N2', '5', 'UJI-DUP');   -- siswa aktif lain, NISN sama
select pg_temp.cek('pratinjau mendeteksi NISN bentrok',
  (pratinjau_aktifkan_siswa((select id from students where name = 'UJI N'))->>'nisn_bentrok')::boolean);
select pg_temp.cek('bentrok NISN: gagal',
  pg_temp.galat(format('select aktifkan_siswa(%s, %L, null, 1)', (select id from students where name = 'UJI N'), 'batal_pindah')) like '%idx_students_nisn_aktif%');
select pg_temp.cek('bentrok NISN: tidak ada efek samping (status, alpha, riwayat, log)',
  (select status = 'pindah' from students where name = 'UJI N')
  and (select count(*) = 0 from absensi where siswa_id = (select id from students where name = 'UJI N'))
  and (select count(*) = 0 from riwayat_status_siswa where siswa_id = (select id from students where name = 'UJI N'))
  and (select count(*) = 0 from log_aktivitas where aksi = 'aktifkan_siswa' and target = 'UJI N'));

-- ─── IDEMPOTEN: permintaan terkirim dua kali ────────────────────────────────────────────────
select pg_temp.cek('idempoten: panggilan ulang untuk X ditolak, tanpa alpha/riwayat/log ganda',
  pg_temp.galat(format('select aktifkan_siswa(%s, %L, null, 1)', pg_temp.sid('UJI-X'), 'batal_pindah')) like 'Siswa ini sudah aktif%'
  and (select count(*) = 7  from absensi where siswa_id = pg_temp.sid('UJI-X') and status = 'alpha')
  and (select count(*) = 1  from riwayat_status_siswa where siswa_id = pg_temp.sid('UJI-X'))
  and (select count(*) = 1  from log_aktivitas where aksi = 'aktifkan_siswa' and target = 'UJI X'));

-- ─── ROLLBACK: gagal SETELAH status berubah dan alpha terisi ────────────────────────────────
insert into students (name, class, nisn) values ('UJI V', '5', 'UJI-V');
select nonaktifkan_siswa(pg_temp.sid('UJI-V'), 'pindah', pg_temp.h(3));
select pg_temp.cek('rollback: admin tidak ada (gagal di langkah riwayat, setelah alpha terisi) -> galat FK',
  pg_temp.galat(format('select aktifkan_siswa(%s, %L, null, 999999)', pg_temp.sid('UJI-V'), 'batal_pindah')) like '%violates foreign key%');
select pg_temp.cek('rollback: status, tanggal pindah, alpha, riwayat, log kembali seperti semula',
  (select status = 'pindah' from students where nisn = 'UJI-V')
  and (select nonaktif_pada = pg_temp.h(3) and alasan_nonaktif = 'pindah' from riwayat_kelas where siswa_id = pg_temp.sid('UJI-V') and tapel = '2026/2027')
  and (select count(*) = 0 from absensi where siswa_id = pg_temp.sid('UJI-V'))
  and (select count(*) = 0 from riwayat_status_siswa where siswa_id = pg_temp.sid('UJI-V'))
  and (select count(*) = 0 from log_aktivitas where target = 'UJI V'));

-- ─── ZONA WAKTU: tidak bergantung pada timezone sesi ─────────────────────────────────────────
set local timezone = 'Pacific/Kiritimati';   -- UTC+14: tanggal kalender bisa beda sehari dari WIB
select pg_temp.cek('zona waktu: "hari ini" selalu tanggal WIB walau timezone sesi UTC+14',
  (pratinjau_aktifkan_siswa(pg_temp.sid('UJI-V'))->>'hari_ini')::date = (now() at time zone 'Asia/Jakarta')::date);
reset timezone;

-- ─── TAPEL/SEMESTER: data campuran pada tanggal yang sama tidak membelokkan alpha ────────────
insert into students (name, class, nisn) values ('UJI O1', '5', 'UJI-O1'), ('UJI O2', '5', 'UJI-O2'), ('UJI M', '5', 'UJI-M');
insert into absensi (siswa_id, tanggal, status, tapel, semester)   -- 2 record tapel lama > 1 record tapel aktif pada h(4)
select pg_temp.sid(n), pg_temp.h(4), 'hadir', '2025/2026', 'genap' from (values ('UJI-O1'), ('UJI-O2')) v(n);
select nonaktifkan_siswa(pg_temp.sid('UJI-M'), 'pindah', pg_temp.h(3));
select aktifkan_siswa(pg_temp.sid('UJI-M'), 'batal_pindah', null, 1);
select pg_temp.cek('tapel/semester: semua alpha M bertapel 2026/2027 ganjil (termasuk hari dengan data campuran)',
  (select count(*) = 8 and bool_and(tapel = '2026/2027' and semester = 'ganjil') from absensi where siswa_id = pg_temp.sid('UJI-M') and status = 'alpha'));

-- ─── SATU ATURAN HITUNG: hari_dihitung_siswa konsisten dengan fungsi lama untuk siswa tanpa jeda ───────
-- Skenario UJI Y di atas (hari 1,2,8,9 = 4 hari) punya kembaran di src/lib/utils/siswa-harian.test.ts
-- ("satu aturan hitung"); ubah keduanya bersama.
insert into students (name, class, nisn) values ('UJI P', '5', 'UJI-P');
select nonaktifkan_siswa(pg_temp.sid('UJI-P'), 'pindah', pg_temp.h(6));
select pg_temp.cek('siswa penuh (tanpa pindah/jeda): hari_dihitung_siswa = hari_efektif',
  (select hari = hari_efektif('2026/2027', 'ganjil') and hari = 10
   from hari_dihitung_siswa('2026/2027', 'ganjil', array[pg_temp.sid('UJI-R')])));
select pg_temp.cek('siswa pindah (tanpa jeda): hari_dihitung_siswa = hari_efektif_sebelum(tanggal pindah)',
  (select hari = hari_efektif_sebelum('2026/2027', 'ganjil', pg_temp.h(6)) and hari = 5
   from hari_dihitung_siswa('2026/2027', 'ganjil', array[pg_temp.sid('UJI-P')])));
select pg_temp.cek('siswa tanpa hari terhitung tidak muncul di hasil (0 hari)',
  (select count(*) = 0 from hari_dihitung_siswa('2026/2027', 'genap', array[pg_temp.sid('UJI-R')])));

rollback;
