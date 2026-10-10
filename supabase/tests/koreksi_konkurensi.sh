#!/usr/bin/env bash
# Uji konkurensi nyata: dua sesi database mengoreksi baris yang sama bersamaan.
# Prasyarat: koreksi_absen_masuk.test.sql sudah dijalankan di database yang sama.
# Pakai:  DB=nama_db bash supabase/tests/koreksi_konkurensi.sh
set -euo pipefail
DB="${DB:-postgres}"
P="psql -X -q -t -A -v ON_ERROR_STOP=1 $DB"

$P -c "delete from absensi where siswa_id = 50; delete from absensi_log where siswa_id = 50;
       insert into absensi (siswa_id, tanggal, status, jam_masuk) values (50, '2026-10-08', 'terlambat', '07:30');"

# Sesi A (HP admin, scan 07.10) menahan lock 2 detik di dalam transaksi.
$P -c "begin;
       select dikoreksi from public.koreksi_absen_masuk(50, date '2026-10-08', time '07:10', 'hadir', 'Tanpa Keterangan (Sistem)', 'HP-A', 'sistem_otomatis', 1, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
       select pg_sleep(2);
       commit;" > /tmp/konkurensi_a.txt &
PID_A=$!
sleep 0.5
# Sesi B (HP lain, scan 07.05 -> LEBIH AWAL) masuk saat A masih memegang lock: harus MENUNGGU lalu membaca data terbaru.
START=$(date +%s.%N)
$P -c "select dikoreksi, status_lama, jam_lama from public.koreksi_absen_masuk(50, date '2026-10-08', time '07:05', 'hadir', 'Tanpa Keterangan (Sistem)', 'HP-B', 'sistem_otomatis', 1, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');" > /tmp/konkurensi_b.txt
END=$(date +%s.%N)
wait $PID_A

WAIT=$(echo "$END - $START" | bc)
echo "sesi B menunggu lock selama ${WAIT}s (diharapkan > 1s)"
echo "A: $(head -1 /tmp/konkurensi_a.txt)  | B: $(cat /tmp/konkurensi_b.txt)"
FINAL=$($P -c "select jam_masuk || '/' || status from absensi where siswa_id = 50 and tanggal = '2026-10-08'")
LOGS=$($P -c "select count(*) from absensi_log where siswa_id = 50")
echo "akhir: $FINAL, jumlah log: $LOGS"
[ "$FINAL" = "07:05:00/hadir" ] || { echo "GAGAL: harus 07:05 (scan paling awal menang)"; exit 1; }
[ "$LOGS" = "2" ] || { echo "GAGAL: harus 2 log (A lalu B, tidak ada yang hilang/ganda)"; exit 1; }
[ "$(echo "$WAIT > 1" | bc)" = "1" ] || { echo "GAGAL: sesi B tidak menunggu row lock"; exit 1; }

# Kebalikan: A (07.10) dan B (07.20, lebih lambat) bersamaan -> B tidak boleh menimpa A.
$P -c "delete from absensi where siswa_id = 51; delete from absensi_log where siswa_id = 51;
       insert into absensi (siswa_id, tanggal, status, jam_masuk) values (51, '2026-10-08', 'terlambat', '07:40');"
$P -c "begin; select dikoreksi from public.koreksi_absen_masuk(51, date '2026-10-08', time '07:10', 'hadir', 'x', 'HP-A', 'sistem_otomatis', 1, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'); select pg_sleep(2); commit;" > /dev/null &
PID_C=$!
sleep 0.5
RES_D=$($P -c "select dikoreksi from public.koreksi_absen_masuk(51, date '2026-10-08', time '07:20', 'terlambat', 'x', 'HP-B', 'sistem_otomatis', 1, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');")
wait $PID_C
FINAL2=$($P -c "select jam_masuk || '/' || status from absensi where siswa_id = 51 and tanggal = '2026-10-08'")
echo "scan lebih lambat yang datang bersamaan: dikoreksi=$RES_D, akhir: $FINAL2"
[ "$RES_D" = "f" ] && [ "$FINAL2" = "07:10:00/hadir" ] || { echo "GAGAL: scan lebih lambat tidak boleh menimpa"; exit 1; }
echo "=== UJI KONKURENSI LULUS ==="
