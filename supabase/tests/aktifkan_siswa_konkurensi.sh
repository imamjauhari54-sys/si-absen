#!/usr/bin/env bash
# Uji KONKURENSI aktifkan_siswa() dengan dua sesi psql sungguhan (data di-COMMIT, lalu dibersihkan).
#   bash supabase/tests/aktifkan_siswa_konkurensi.sh nama_db_uji
# Prasyarat: migrasi 001-025. Variabel PSQL bisa diganti, mis. PSQL="psql -h localhost -U postgres".
# JANGAN dijalankan di produksi: skrip mengubah absensi_setting sementara dan membuat siswa "UJIK-*".
set -u
DB="${1:?isi nama database uji}"
PSQL="${PSQL:-psql}"
Q() { $PSQL -X -q -At -v ON_ERROR_STOP=1 -d "$DB" "$@"; }
gagal=0
Q -c "select 1" >/dev/null 2>&1 || { echo "GAGAL : database '$DB' tidak bisa dihubungi"; exit 2; }
Q -c "select to_regproc('public.aktifkan_siswa') is not null" | grep -q t || { echo "GAGAL : migrasi 025 belum dijalankan"; exit 2; }
cek() { if [ "$2" = "1" ]; then echo "OK    : $1"; else echo "GAGAL : $1"; gagal=1; fi; }

SETTING_LAMA="$(Q -c "select tapel||'|'||semester from absensi_setting order by id limit 1")"
bersih() {
  Q -c "delete from log_aktivitas where target like 'UJIK %'" >/dev/null 2>&1
  Q -c "delete from students where nisn like 'UJIK-%'" >/dev/null 2>&1
  Q -c "delete from absensi where tapel = '2026/2027' and scan_oleh = 'ujik'" >/dev/null 2>&1
  if [ -n "$SETTING_LAMA" ]; then
    Q -c "delete from absensi_setting; insert into absensi_setting (tapel, semester) values ('${SETTING_LAMA%%|*}', '${SETTING_LAMA##*|}')" >/dev/null 2>&1
  fi
}
trap bersih EXIT
bersih

# 6 hari sekolah uji (bukan Minggu) dari 30-60 hari lalu; n=1 paling lama
Q <<'SQL'
delete from absensi_setting; insert into absensi_setting (tapel, semester) values ('2026/2027', 'ganjil');
create temp table _h as
  select row_number() over (order by t) n, t from (
    select ((now() at time zone 'Asia/Jakarta')::date - g) t from generate_series(30, 60) g
    where extract(isodow from (now() at time zone 'Asia/Jakarta')::date - g) <> 7 order by g limit 6) x;
insert into students (name, class, nisn) values ('UJIK REF','5','UJIK-R'),('UJIK 1','5','UJIK-1'),('UJIK 2','5','UJIK-2'),('UJIK 3','5','UJIK-3'),('UJIK 4','5','UJIK-4');
insert into absensi (siswa_id, tanggal, status, tapel, semester, scan_oleh)
  select (select id from students where nisn='UJIK-R'), t, 'hadir', '2026/2027', 'ganjil', 'ujik' from _h;
select nonaktifkan_siswa((select id from students where nisn=n), 'pindah', (select t from _h where n=3))
  from (values ('UJIK-1'),('UJIK-2'),('UJIK-3'),('UJIK-4')) v(n);
SQL
id() { Q -c "select id from students where nisn='$1'"; }
H3="$(Q -c "select (now() at time zone 'Asia/Jakarta')::date - g from generate_series(30,60) g where extract(isodow from (now() at time zone 'Asia/Jakarta')::date - g) <> 7 order by g limit 6 offset 0" | sort | sed -n 3p)"
H5="$(Q -c "select (now() at time zone 'Asia/Jakarta')::date - g from generate_series(30,60) g where extract(isodow from (now() at time zone 'Asia/Jakarta')::date - g) <> 7 order by g limit 6" | sort | sed -n 5p)"
H6="$(Q -c "select (now() at time zone 'Asia/Jakarta')::date - g from generate_series(30,60) g where extract(isodow from (now() at time zone 'Asia/Jakarta')::date - g) <> 7 order by g limit 6" | sort | sed -n 6p)"

# jalankan: sesi 1 menahan transaksi 2 detik; sesi 2 mulai 0.7 detik kemudian
balapan() { # $1=SQL sesi1 $2=SQL sesi2 ; hasil di /tmp/uk_s1 /tmp/uk_s2 /tmp/uk_dur
  ( echo "begin; select $1; select pg_sleep(2); commit;" | $PSQL -X -q -At -d "$DB" >/tmp/uk_s1 2>&1 ) &
  P1=$!; sleep 0.7
  T0=$(date +%s.%N)
  $PSQL -X -q -At -d "$DB" -c "select $2" >/tmp/uk_s2 2>&1
  T1=$(date +%s.%N)
  wait $P1
  awk -v a="$T0" -v b="$T1" 'BEGIN{printf "%.2f", b-a}' >/tmp/uk_dur
}
menunggu() { awk -v d="$(cat /tmp/uk_dur)" 'BEGIN{print (d >= 1.0) ? 1 : 0}'; }

echo "--- 1. dua admin mengaktifkan siswa yang sama (mode A)"
balapan "aktifkan_siswa($(id UJIK-1), 'batal_pindah', null, 1)" "aktifkan_siswa($(id UJIK-1), 'batal_pindah', null, 1)"
cek "sesi 2 MENUNGGU sesi 1 (dikunci), lalu ditolak 'sudah aktif'" "$([ "$(menunggu)" = 1 ] && grep -q 'sudah aktif' /tmp/uk_s2 && echo 1 || echo 0)"
cek "tepat 1 riwayat, 1 log, 4 alpha (hari 3..6)" "$(Q -c "select (select count(*) from riwayat_status_siswa where siswa_id=$(id UJIK-1))=1 and (select count(*) from log_aktivitas where aksi='aktifkan_siswa' and target='UJIK 1')=1 and (select count(*) from absensi where siswa_id=$(id UJIK-1) and status='alpha')=4" | sed 's/t/1/;s/f/0/')"

echo "--- 2. dua admin mengaktifkan mode B dengan tanggal kembali berbeda"
balapan "aktifkan_siswa($(id UJIK-2), 'kembali_setelah_jeda', '$H6', 1)" "aktifkan_siswa($(id UJIK-2), 'kembali_setelah_jeda', '$H3'::date + 1, 2)"
cek "sesi 2 ditolak; hanya kejadian sesi 1 tersimpan (kembali=$H6)" "$(Q -c "select count(*)=1 and bool_and(kembali_pada='$H6') from riwayat_status_siswa where siswa_id=$(id UJIK-2)" | sed 's/t/1/;s/f/0/')"

echo "--- 3. aktifkan vs ubah tanggal pindah bersamaan"
balapan "aktifkan_siswa($(id UJIK-3), 'batal_pindah', null, 1)" "ubah_tanggal_keluar($(id UJIK-3), '$H6')"
cek "ubah_tanggal_keluar menunggu lalu ditolak 'masih aktif' (tanggal pindah tidak berubah di tengah pengisian)" "$([ "$(menunggu)" = 1 ] && grep -q 'masih aktif' /tmp/uk_s2 && echo 1 || echo 0)"
cek "alpha terisi dari tanggal pindah ASLI (4 hari), riwayat menyimpan tanggal asli" "$(Q -c "select (select count(*) from absensi where siswa_id=$(id UJIK-3) and status='alpha')=4 and (select pindah_pada='$H3' from riwayat_status_siswa where siswa_id=$(id UJIK-3))" | sed 's/t/1/;s/f/0/')"

echo "--- 4. URUTAN DIBALIK: ubah tanggal pindah menahan kunci dulu, aktifkan menyusul"
balapan "ubah_tanggal_keluar($(id UJIK-4), '$H5')" "aktifkan_siswa($(id UJIK-4), 'batal_pindah', null, 1)"
cek "aktifkan MENUNGGU ubah tanggal, lalu sukses" "$([ "$(menunggu)" = 1 ] && grep -q 'batal_pindah' /tmp/uk_s2 && echo 1 || echo 0)"
cek "tanggal pindah yang dipakai = tanggal BARU ($H5): riwayat menyimpannya, alpha 2 hari (hari 5..6)" "$(Q -c "select (select pindah_pada='$H5' from riwayat_status_siswa where siswa_id=$(id UJIK-4)) and (select count(*) from absensi where siswa_id=$(id UJIK-4) and status='alpha')=2" | sed 's/t/1/;s/f/0/')"

echo "--- 5. uji tekanan: ubah tanggal & aktifkan dimulai BERSAMAAN, 15 kali, urutan acak"
deadlock=0; tidakkonsisten=0
for i in $(seq 1 15); do
  Q -c "insert into students (name, class, nisn) values ('UJIK S$i','5','UJIK-S$i'); select nonaktifkan_siswa((select id from students where nisn='UJIK-S$i'), 'pindah', '$H3')" >/dev/null
  SID="$(id UJIK-S$i)"
  A="select ubah_tanggal_keluar($SID, '$H5')"; B="select aktifkan_siswa($SID, 'batal_pindah', null, 1)"
  if [ $((RANDOM % 2)) = 0 ]; then X="$A"; Y="$B"; else X="$B"; Y="$A"; fi
  $PSQL -X -q -At -d "$DB" -c "$X" >/tmp/uk_a 2>&1 &  P1=$!
  $PSQL -X -q -At -d "$DB" -c "$Y" >/tmp/uk_b 2>&1 &  P2=$!
  wait $P1 $P2
  cat /tmp/uk_a /tmp/uk_b | grep -qi deadlock && deadlock=$((deadlock+1))
  # hasil sah hanya dua: (a) ubah dulu -> pindah=H5, alpha=2 ; (b) aktifkan dulu -> pindah=H3, alpha=4, ubah ditolak
  OK="$(Q -c "select (select count(*) from riwayat_status_siswa where siswa_id=$SID)=1
              and (select status from students where id=$SID)='aktif'
              and ( ((select pindah_pada from riwayat_status_siswa where siswa_id=$SID)='$H5' and (select count(*) from absensi where siswa_id=$SID and status='alpha')=2)
                 or ((select pindah_pada from riwayat_status_siswa where siswa_id=$SID)='$H3' and (select count(*) from absensi where siswa_id=$SID and status='alpha')=4) )" | sed 's/t/1/;s/f/0/')"
  [ "$OK" = 1 ] || tidakkonsisten=$((tidakkonsisten+1))
done
cek "tidak ada deadlock dalam 15 putaran" "$([ $deadlock = 0 ] && echo 1 || echo 0)"
cek "setiap putaran berakhir pada salah satu dari dua hasil sah (tanggal pindah, jumlah alpha, riwayat selaras)" "$([ $tidakkonsisten = 0 ] && echo 1 || echo 0)"

[ "$gagal" = 0 ] && echo "SEMUA LOLOS" || { echo "ADA YANG GAGAL"; exit 1; }
