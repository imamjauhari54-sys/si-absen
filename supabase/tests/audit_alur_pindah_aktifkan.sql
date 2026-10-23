begin;
delete from absensi_setting; insert into absensi_setting (tapel, semester) values ('2026/2027','ganjil');
insert into tahun_pelajaran(nama) values ('2025/2026'),('2026/2027') on conflict do nothing;
insert into students (name, class, nisn) values ('Uji A','5','111'),('Uji B','5','222'),('Uji C','5','333');
\echo '--- S1: nonaktifkan A tgl 2026-08-15 lalu aktifkan lagi'
select nonaktifkan_siswa((select id from students where name='Uji A'),'pindah','2026-08-15');
select s.name,s.status,r.tapel,r.nonaktif_pada,r.alasan_nonaktif from students s join riwayat_kelas r on r.siswa_id=s.id where s.name='Uji A';
update students set status='aktif' where name='Uji A';
select s.name,s.status,r.tapel,r.nonaktif_pada,r.alasan_nonaktif from students s join riwayat_kelas r on r.siswa_id=s.id where s.name='Uji A';
\echo '--- S2: tanggal pindah di tapel LAIN (2024-01-10) / jauh sebelum tapel diterima?'
select nonaktifkan_siswa((select id from students where name='Uji B'),'pindah','2024-01-10');
select s.name,r.tapel,r.nonaktif_pada from students s join riwayat_kelas r on r.siswa_id=s.id where s.name='Uji B';
\echo '--- S3: baris riwayat tapel aktif tidak ada -> tanggal hilang diam-diam?'
delete from riwayat_kelas where siswa_id=(select id from students where name='Uji C');
select nonaktifkan_siswa((select id from students where name='Uji C'),'pindah','2026-09-01');
select s.name,s.status,count(r.*) as baris_riwayat from students s left join riwayat_kelas r on r.siswa_id=s.id where s.name='Uji C' group by 1,2;
\echo '--- S4: pindah di tapel LAMA lalu aktifkan di tapel aktif'
insert into riwayat_kelas(siswa_id,tapel,kelas,nonaktif_pada,alasan_nonaktif) select id,'2025/2026','5','2026-03-10','pindah' from students where name='Uji C';
select 'sebelum' k, r.tapel,r.kelas,r.nonaktif_pada from riwayat_kelas r join students s on s.id=r.siswa_id where s.name='Uji C' order by r.tapel;
update students set status='aktif' where name='Uji C';
select 'sesudah' k, r.tapel,r.kelas,r.nonaktif_pada from riwayat_kelas r join students s on s.id=r.siswa_id where s.name='Uji C' order by r.tapel;
\echo '--- S5: ubah_tanggal_keluar memilih tapel terakhir; tanggal di tapel salah?'
select ubah_tanggal_keluar((select id from students where name='Uji B'),'2026-08-20');
select s.name,r.tapel,r.nonaktif_pada from students s join riwayat_kelas r on r.siswa_id=s.id where s.name='Uji B';
rollback;
