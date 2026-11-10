#!/usr/bin/env bash
# Uji KONKURENSI pengajuan izin/sakit dengan banyak sesi psql sungguhan (data di-COMMIT, lalu dibersihkan).
#   bash supabase/tests/pengajuan_izin_konkurensi.sh nama_db_uji
# Prasyarat: migrasi 001-027. JANGAN dijalankan di produksi: membuat siswa "PGK-*" dan mengganti absensi_setting sementara.
set -u
DB="${1:?isi nama database uji}"
PSQL="${PSQL:-psql}"
Q() { $PSQL -X -q -At -v ON_ERROR_STOP=1 -d "$DB" "$@"; }
gagal=0
Q -c "select 1" >/dev/null 2>&1 || { echo "GAGAL : database '$DB' tidak bisa dihubungi"; exit 2; }
Q -c "select to_regproc('public.ajukan_pengajuan_izin') is not null" | grep -q t || { echo "GAGAL : migrasi 027 belum dijalankan"; exit 2; }
cek() { if [ "$2" = "1" ]; then echo "OK    : $1"; else echo "GAGAL : $1"; gagal=1; fi; }
SETTING_LAMA="$(Q -c "select tapel||'|'||semester from absensi_setting order by id limit 1")"
bersih() {
  Q -c "delete from log_aktivitas where target like 'PGK %'" >/dev/null 2>&1
  Q -c "delete from students where nisn like 'PGK-%'" >/dev/null 2>&1
  [ -n "$SETTING_LAMA" ] && Q -c "delete from absensi_setting; insert into absensi_setting (tapel, semester) values ('${SETTING_LAMA%%|*}', '${SETTING_LAMA##*|}')" >/dev/null 2>&1
}
trap bersih EXIT
bersih
Q <<'SQL'
delete from absensi_setting;
insert into absensi_setting (tapel, semester)
  select case when extract(month from (now() at time zone 'Asia/Jakarta')::date) >= 7
              then extract(year from (now() at time zone 'Asia/Jakarta')::date)::int || '/' || (extract(year from (now() at time zone 'Asia/Jakarta')::date)::int + 1)
              else (extract(year from (now() at time zone 'Asia/Jakarta')::date)::int - 1) || '/' || extract(year from (now() at time zone 'Asia/Jakarta')::date)::int end,
         case when extract(month from (now() at time zone 'Asia/Jakarta')::date) >= 7 then 'ganjil' else 'genap' end;
insert into students (name, class, nisn) select 'PGK ' || i, '5', 'PGK-' || i from generate_series(1, 6) i;
SQL
id() { Q -c "select id from students where nisn='PGK-$1'"; }
depan() { Q -c "select d from hari_sekolah_rentang((now() at time zone 'Asia/Jakarta')::date + 1, (now() at time zone 'Asia/Jakarta')::date + 25) d order by d offset $(( $1 - 1 )) limit 1"; }
paralel() { # $1 = jumlah proses; $2.. = perintah SQL (dipakai $i bila ada); hasil di /tmp/pk_out_<i>
  local n=$1; shift
  for i in $(seq 1 $n); do ( $PSQL -X -q -At -d "$DB" -c "${1//@I@/$i}" >/tmp/pk_out_$i 2>&1 ) & done; wait
}

echo "--- 1. 8 pengajuan SERENTAK untuk siswa & tanggal yang sama"
S1=$(id 1); D1=$(depan 1)
paralel 8 "select ajukan_pengajuan_izin($S1, 'izin', '$D1', '$D1', 'serentak')"
cek "tepat 1 pengajuan tersimpan (database menolak tumpang tindih walau serentak)" "$([ "$(Q -c "select count(*) from pengajuan_izin where siswa_id=$S1")" = 1 ] && echo 1 || echo 0)"
cek "7 permintaan lain ditolak dengan pesan jelas" "$([ "$(cat $(seq -f '/tmp/pk_out_%g' 1 16) | grep -c 'Sudah ada pengajuan lain')" = 7 ] && echo 1 || echo 0)"

echo "--- 2. 8 pengajuan SERENTAK pada tanggal berbeda: batas 3 Menunggu tidak bisa dilewati"
S2=$(id 2)
for i in 1 2 3 4 5 6 7 8; do D[$i]=$(depan $((i + 1))); done
for i in $(seq 1 8); do ( $PSQL -X -q -At -d "$DB" -c "select ajukan_pengajuan_izin($S2, 'izin', '${D[$i]}', '${D[$i]}', 'serentak')" >/tmp/pk_out_$i 2>&1 ) & done; wait
cek "paling banyak 3 pengajuan Menunggu" "$([ "$(Q -c "select count(*) from pengajuan_izin where siswa_id=$S2 and status='menunggu'")" = 3 ] && echo 1 || echo 0)"

echo "--- 3. 16 tebakan PIN salah serentak (transaksi ditahan 0,5 dtk agar TUMPANG TINDIH sungguhan)"
S3=$(id 3)
for i in $(seq 1 16); do ( printf "begin; select verifikasi_pin_ortu($S3, '9000%02d'); select pg_sleep(0.5); commit;" $i | $PSQL -X -q -At -d "$DB" >/tmp/pk_out_$i 2>&1 ) & done; wait
# tebakan yang BENAR-BENAR dievaluasi = jawaban PIN_SALAH + jawaban yang memicu kunci ("menit"). Penghitung harus SAMA dengan itu
# (tanpa kunci baris, pembaruan hilang: penghitung < jumlah tebakan) dan jumlahnya tepat 5 (sisanya ditolak TERKUNCI).
EVAL=$(( $(cat $(seq -f '/tmp/pk_out_%g' 1 16) | grep -c '"kode": "PIN_SALAH"') + $(cat $(seq -f '/tmp/pk_out_%g' 1 16) | grep -c '"menit"') ))
GAGALDB=$(Q -c "select gagal from kunci_ortu where siswa_id=$S3")
cek "penghitung ($GAGALDB) == jumlah tebakan yang dievaluasi ($EVAL), tidak ada pembaruan hilang" "$([ "$GAGALDB" = "$EVAL" ] && echo 1 || echo 0)"
cek "tepat 5 tebakan dievaluasi lalu terkunci (percobaan paralel tidak menyelinap)" "$([ "$EVAL" = 5 ] && echo 1 || echo 0)"
cek "siswa terkunci" "$([ "$(Q -c "select (terkunci_sampai > now()) from kunci_ortu where siswa_id=$S3")" = t ] && echo 1 || echo 0)"
LOCKED=$(( $(cat $(seq -f '/tmp/pk_out_%g' 1 16) | grep -c '"kode": "TERKUNCI"') - $(cat $(seq -f '/tmp/pk_out_%g' 1 16) | grep -c '"menit"') ))
cek "11 sesi lain (16 - 5 yang dievaluasi) mendapat TERKUNCI (terhitung: $LOCKED)" "$([ "$LOCKED" = 11 ] && echo 1 || echo 0)"
cek "PIN yang benar pun ditolak selama terkunci" "$(Q -c "select (verifikasi_pin_ortu($S3,'123456') ->> 'kode') = 'TERKUNCI'" | sed 's/t/1/;s/f/0/')"

echo "--- 4. keputusan dan pembatalan SERENTAK pada pengajuan yang sama"
S4=$(id 4); D4=$(depan 3)
P4=$(Q -c "select (ajukan_pengajuan_izin($S4, 'izin', '$D4', '$D4', 'balapan') ->> 'id')")
( $PSQL -X -q -At -d "$DB" -c "select putuskan_pengajuan_izin($P4, 'setujui', null, null, 1, 'Wali')" >/tmp/pk_out_a 2>&1 ) &
( $PSQL -X -q -At -d "$DB" -c "select batalkan_pengajuan_izin($P4, $S4)" >/tmp/pk_out_b 2>&1 ) &
wait
STAT=$(Q -c "select status from pengajuan_izin where id=$P4")
cek "tepat satu pihak menang (status akhir disetujui ATAU dibatalkan, bukan campuran): $STAT" "$([ "$STAT" = disetujui ] || [ "$STAT" = dibatalkan ] && echo 1 || echo 0)"
cek "pihak yang kalah mendapat 'sudah diputuskan'" "$([ "$(cat /tmp/pk_out_a /tmp/pk_out_b | grep -c 'sudah diputuskan')" = 1 ] && echo 1 || echo 0)"
cek "hari pengajuan konsisten dengan status akhir" "$([ "$(Q -c "select count(*) from pengajuan_izin_hari h join pengajuan_izin p on p.id=h.pengajuan_id where p.id=$P4 and ((p.status='disetujui' and h.disetujui) or (p.status='dibatalkan' and not h.aktif))")" = 1 ] && echo 1 || echo 0)"

echo "--- 5. cron DOBEL serentak untuk hari rencana yang sama"
S5=$(id 5); D5=$(depan 4)
P5=$(Q -c "select (ajukan_pengajuan_izin($S5, 'izin', '$D5', '$D5', 'rencana') ->> 'id')")
Q -c "select putuskan_pengajuan_izin($P5, 'setujui', null, null, 1, 'Wali')" >/dev/null
paralel 6 "select terapkan_rencana_pengajuan('$D5')"
cek "tepat 1 baris absensi izin (tidak ganda, tidak galat)" "$([ "$(Q -c "select count(*) from absensi where siswa_id=$S5 and tanggal='$D5' and status='izin'")" = 1 ] && echo 1 || echo 0)"
cek "hari pengajuan berstatus ditulis tepat sekali" "$([ "$(Q -c "select count(*) from pengajuan_izin_hari where pengajuan_id=$P5 and hasil='ditulis'")" = 1 ] && echo 1 || echo 0)"

[ "$gagal" = 0 ] && echo "SEMUA LOLOS" || { echo "ADA YANG GAGAL"; exit 1; }
