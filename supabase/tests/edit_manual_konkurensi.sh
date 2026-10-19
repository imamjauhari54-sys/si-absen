#!/usr/bin/env bash
# Uji konkurensi nyata edit manual + Pulihkan (migrasi 019): beberapa sesi database berjalan BERSAMAAN,
# masing-masing sebagai service_role (seperti supabaseAdmin di aplikasi).
#
# Pulihkan membawa ID edit yang dikonfirmasi pengguna (p_edit_id); K7/K8 menguji perlombaan edit vs Pulihkan.
# Prasyarat: supabase/tests/edit_manual_pulihkan.test.sql sudah dijalankan di database UJI yang sama
#            (tabel, peran, dan migrasi 019 sudah ada). psql >= 15 (hasil beberapa perintah dalam satu -c).
# Pakai:     DB=nama_db_uji bash supabase/tests/edit_manual_konkurensi.sh
#            (jalankan sebagai pengguna yang boleh `set role service_role`, mis. superuser)
# JANGAN dijalankan di database produksi: skrip menambah lalu menghapus siswa uji bernama "Konkurensi ...".
set -euo pipefail
DB="${DB:-postgres}"
P="psql -X -q -t -A -v ON_ERROR_STOP=1 $DB"
T="$(mktemp -d /tmp/edit_konkurensi.XXXXXX)"
TEMUAN=0

gagal() { echo "GAGAL: $1"; exit 1; }
cek()   { if [ "$2" = "1" ]; then echo "OK    : $1"; else gagal "$1"; fi; }   # $2 = "1" kalau benar
lebih() { [ "$(echo "$1 > $2" | bc)" = "1" ] && echo 1 || echo 0; }          # $1 > $2 ?
sama()  { [ "$1" = "$2" ] && echo 1 || echo 0; }
baris1() { grep -v '^$' "$1" | head -1; }                                      # baris hasil pertama yang tidak kosong

bersih() {
  $P -c "delete from absensi_log where siswa_id in (select id from students where name like 'Konkurensi%');
         delete from log_aktivitas where target like 'Konkurensi%';
         delete from students where name like 'Konkurensi%';" >/dev/null 2>&1 || true
}
bersih
trap 'bersih; rm -rf "$T"' EXIT

buat_siswa() {  # $1 = nama; mencetak id
  local id
  id=$($P -c "insert into students (name, class) values ('$1', '5') returning id")
  $P -c "insert into riwayat_kelas (siswa_id, tapel, kelas) values ($id, '2026/2027', '5')" >/dev/null
  echo "$id"
}

buat_baris() {  # $1=siswa $2=tanggal $3=status $4=jam_masuk(opsional)
  $P -c "insert into absensi (siswa_id, tanggal, status, jam_masuk, tapel, semester, scan_oleh)
         values ($1, '$2', '$3', ${4:-null}, '2026/2027', 'ganjil', 'sistem_otomatis')" >/dev/null
}

# Perintah sebagai service_role, otomatis commit (untuk persiapan data lewat jalur aplikasi).
jalan() { $P -c "begin; set local role service_role; $1 commit;" >/dev/null; }

# Sesi A: menjalankan $1 lalu MENAHAN lock 2 detik di dalam transaksi. Hasil ke file $2. Jalan di latar belakang;
# PID ada di $! setelah fungsi kembali.
tahan() {
  $P -c "begin; set local role service_role; $1 select pg_sleep(2); commit;" > "$2" 2>&1 &
}

# Sesi B: mulai 0,5 dtk setelah A, jalankan $1 dan ukur lama menunggu (WAIT). Hasil ke file $2.
tunggu_sesi() {
  local s e
  sleep 0.5
  s=$(date +%s.%N)
  $P -c "begin; set local role service_role; $1 commit;" > "$2" 2>&1 || true
  e=$(date +%s.%N)
  WAIT=$(echo "$e - $s" | bc)
}

# ID edit manual TERAKHIR untuk siswa $1 pada tanggal $2 (yang dilihat pengguna saat menekan Pulihkan).
edit_terakhir() { $P -c "select max(id) from absensi_edit_manual where siswa_id=$1 and tanggal='$2'"; }

edit_sql() { echo "select o_diubah, o_periode_baru is not null from public.edit_manual_absensi($1, array[$2]::date[], '$3', '$4', null, $5, '$6');"; }

# ═══ K1: dua edit bersamaan pada baris yang sama -> antre, tidak ada yang hilang ═══════════════
echo "--- K1: dua edit bersamaan pada baris yang sama"
S=$(buat_siswa "Konkurensi K1")
$P -c "insert into absensi (siswa_id, tanggal, status, jam_masuk, jam_pulang, tapel, semester, scan_oleh)
       values ($S, '2026-11-02', 'hadir', '07:15', '14:00', '2026/2027', 'ganjil', 'sistem_otomatis')" >/dev/null
tahan "$(edit_sql $S "'2026-11-02'" sakit A 1 'Admin A')" "$T/k1a"; PID=$!
tunggu_sesi "$(edit_sql $S "'2026-11-02'" izin B 2 'Guru B')" "$T/k1b"
wait $PID
cek "K1 sesi B menunggu lock selama ${WAIT}s (> 1 dtk)" "$(lebih "$WAIT" 1)"
cek "K1 kedua edit berhasil dan dinyatakan berubah" "$(sama "$(baris1 $T/k1a)|$(baris1 $T/k1b)" 't|f|t|f')"
cek "K1 status akhir = edit yang masuk terakhir (izin), rev 1 -> 3" "$(sama "$($P -c "select status||'/'||rev from absensi where siswa_id=$S and tanggal='2026-11-02'")" 'izin/3')"
cek "K1 dua snapshot berurutan: sebelum edit A = hadir, sebelum edit B = sakit (tidak ada yang hilang)" \
    "$(sama "$($P -c "select string_agg(sebelum->>'status', '>' order by id) from absensi_edit_manual where siswa_id=$S")" 'hadir>sakit')"
cek "K1 dua log aktivitas, transisi hadir>sakit lalu sakit>izin" \
    "$(sama "$($P -c "select count(*) from log_aktivitas where aksi='edit_absensi' and target='Konkurensi K1'")|$($P -c "select string_agg(status_lama||'>'||status_baru, ',' order by id) from absensi_log where siswa_id=$S")" '2|hadir>sakit,sakit>izin')"
cek "K1 hanya edit terakhir yang bisa dipulihkan" \
    "$(sama "$($P -c "select count(*) from public.daftar_bisa_pulihkan('2026-11-02', array[$S]::bigint[])")" '1')"

# ═══ K2: dua edit bersamaan pada tanggal TANPA baris -> satu baris, bukan dua/duplikat/galat ══════
echo "--- K2: dua edit bersamaan yang sama-sama membuat baris baru"
S=$(buat_siswa "Konkurensi K2")
tahan "$(edit_sql $S "'2026-11-03'" hadir A 1 'Admin A')" "$T/k2a"; PID=$!
tunggu_sesi "$(edit_sql $S "'2026-11-03'" sakit B 2 'Guru B')" "$T/k2b"
wait $PID
cek "K2 sesi B menunggu pembuatan baris oleh A selama ${WAIT}s (> 1 dtk)" "$(lebih "$WAIT" 1)"
cek "K2 A membuat baris baru (periode terisi), B mengeditnya sebagai baris yang sudah ada (periode tidak berubah)" \
    "$(sama "$(baris1 $T/k2a)|$(baris1 $T/k2b)" 't|t|t|f')"
cek "K2 tepat SATU baris absensi, status akhir sakit, rev 2, scan_oleh NULL" \
    "$(sama "$($P -c "select count(*)||'/'||min(status)||'/'||min(rev)||'/'||coalesce(min(scan_oleh),'NULL') from absensi where siswa_id=$S and tanggal='2026-11-03'")" '1/sakit/2/NULL')"
cek "K2 snapshot: pertama sebelum=NULL (baris belum ada), kedua sebelum=hadir" \
    "$(sama "$($P -c "select string_agg(coalesce(sebelum->>'status','NULL'), '>' order by id) from absensi_edit_manual where siswa_id=$S")" 'NULL>hadir')"

# ═══ K3: dua Pulihkan bersamaan untuk edit yang sama -> tepat satu yang berhasil ═══════════════
echo "--- K3: dua Pulihkan bersamaan untuk edit yang sama"
S=$(buat_siswa "Konkurensi K3")
buat_baris $S 2026-11-04 hadir "'07:15'"
jalan "$(edit_sql $S "'2026-11-04'" sakit x 1 'Admin A')"
EID=$(edit_terakhir $S 2026-11-04)
tahan "select o_kode from public.pulihkan_edit_manual($S, '2026-11-04', $EID, 1, 'Admin A');" "$T/k3a"; PID=$!
tunggu_sesi "select o_kode from public.pulihkan_edit_manual($S, '2026-11-04', $EID, 2, 'Guru B');" "$T/k3b"
wait $PID
cek "K3 sesi B menunggu selama ${WAIT}s (> 1 dtk)" "$(lebih "$WAIT" 1)"
cek "K3 tepat satu ok (A) dan satu sudah_dipulihkan (B)" "$(sama "$(baris1 $T/k3a)|$(baris1 $T/k3b)" 'ok|sudah_dipulihkan')"
cek "K3 data kembali ke hadir, satu log pemulihan, dipulihkan oleh A" \
    "$(sama "$($P -c "select status from absensi where siswa_id=$S and tanggal='2026-11-04'")|$($P -c "select count(*) from log_aktivitas where aksi='pulihkan_absensi' and target='Konkurensi K3'")|$($P -c "select dipulihkan_nama from absensi_edit_manual where siswa_id=$S")" 'hadir|1|Admin A')"

# ═══ K4: scan/proses lain mengubah baris saat Pulihkan berjalan -> Pulihkan ditolak, data lain utuh ═
echo "--- K4: proses lain (scan pulang) bersamaan dengan Pulihkan"
S=$(buat_siswa "Konkurensi K4")
buat_baris $S 2026-11-06 hadir "'07:10'"
jalan "$(edit_sql $S "'2026-11-06'" terlambat x 1 'Admin A')"
EID=$(edit_terakhir $S 2026-11-06)
tahan "update public.absensi set jam_pulang = '14:00' where siswa_id = $S and tanggal = '2026-11-06';" "$T/k4a"; PID=$!
tunggu_sesi "select o_kode from public.pulihkan_edit_manual($S, '2026-11-06', $EID, 2, 'Guru B');" "$T/k4b"
wait $PID
cek "K4 Pulihkan menunggu proses lain selama ${WAIT}s (> 1 dtk)" "$(lebih "$WAIT" 1)"
cek "K4 Pulihkan ditolak: sudah_berubah" "$(sama "$(baris1 $T/k4b)" 'sudah_berubah')"
cek "K4 hasil proses lain TIDAK tertimpa (jam pulang 14:00, status tetap terlambat), edit tidak ditandai dipulihkan" \
    "$(sama "$($P -c "select status||'/'||jam_pulang from absensi where siswa_id=$S and tanggal='2026-11-06'")|$($P -c "select dipulihkan_at is null from absensi_edit_manual where siswa_id=$S")" 'terlambat/14:00:00|t')"

# ═══ K5: edit rentang tanggal dengan urutan berlawanan -> tidak deadlock ═════════════════════════
echo "--- K5: dua edit rentang tanggal dengan urutan tanggal berlawanan"
# Catatan: K5 membuktikan tidak ada deadlock pada contoh ini, tetapi TIDAK dapat mengunci keberadaan ORDER BY pada loop
# tanggal (planner bisa kebetulan mengurutkan himpunan kecil). Urutan pemrosesan menaik diuji deterministik di
# edit_manual_pulihkan.test.sql bagian 10 ("tanggal diproses MENAIK walau array masuk acak").
# Kontrol: harness ini BISA mendeteksi deadlock jika kunci diambil dengan urutan berlawanan.
S=$(buat_siswa "Konkurensi K5")
buat_baris $S 2026-11-09 hadir "'07:00'"; buat_baris $S 2026-11-10 hadir "'07:00'"
$P -c "begin; select 1 from absensi where siswa_id=$S and tanggal='2026-11-09' for update; select pg_sleep(1);
       select 1 from absensi where siswa_id=$S and tanggal='2026-11-10' for update; commit;" > "$T/k5ka" 2>&1 &
PID=$!
sleep 0.2
$P -c "begin; select 1 from absensi where siswa_id=$S and tanggal='2026-11-10' for update; select pg_sleep(1);
       select 1 from absensi where siswa_id=$S and tanggal='2026-11-09' for update; commit;" > "$T/k5kb" 2>&1 || true
wait $PID || true
cek "K5 kontrol: kunci berlawanan manual MEMANG menghasilkan deadlock (alat uji valid)" "$(grep -qi 'deadlock detected' "$T/k5ka" "$T/k5kb" && echo 1 || echo 0)"

tahan "select o_tanggal, o_diubah from public.edit_manual_absensi($S, array['2026-11-09','2026-11-10']::date[], 'sakit', 'A', null, 1, 'Admin A');" "$T/k5a"; PID=$!
tunggu_sesi "select o_tanggal, o_diubah from public.edit_manual_absensi($S, array['2026-11-10','2026-11-09']::date[], 'izin', 'B', null, 2, 'Guru B');" "$T/k5b"
wait $PID
cek "K5 tidak ada deadlock/galat pada kedua sesi" "$(grep -qiE 'deadlock|error' "$T/k5a" "$T/k5b" && echo 0 || echo 1)"
cek "K5 sesi B menunggu A selama ${WAIT}s (> 1 dtk), lalu selesai" "$(lebih "$WAIT" 1)"
cek "K5 kedua tanggal akhirnya izin (B), masing-masing 2 snapshot berurutan, rev 3" \
    "$(sama "$($P -c "select string_agg(status||'/'||rev, ',' order by tanggal) from absensi where siswa_id=$S")|$($P -c "select count(*) from absensi_edit_manual where siswa_id=$S")" 'izin/3,izin/3|4')"

# ═══ K6: edit pada siswa berbeda tidak saling menunggu (tidak ada lock global) ═════════════════
echo "--- K6: edit siswa berbeda bersamaan"
S1=$(buat_siswa "Konkurensi K6a"); S2=$(buat_siswa "Konkurensi K6b")
buat_baris $S1 2026-11-11 hadir "'07:00'"; buat_baris $S2 2026-11-11 hadir "'07:00'"
tahan "$(edit_sql $S1 "'2026-11-11'" sakit A 1 'Admin A')" "$T/k6a"; PID=$!
tunggu_sesi "$(edit_sql $S2 "'2026-11-11'" sakit B 2 'Guru B')" "$T/k6b"
wait $PID
cek "K6 sesi B (siswa lain) selesai tanpa menunggu: ${WAIT}s (< 1 dtk)" "$(lebih 1 "$WAIT")"
cek "K6 kedua edit berhasil" "$(sama "$(baris1 $T/k6a)|$(baris1 $T/k6b)" 't|f|t|f')"

# ═══ K7: Pulihkan (edit E1 yang dikonfirmasi) bersamaan dengan edit BARU E2 -> HARUS ditolak ════════
echo "--- K7: Pulihkan E1 bersamaan dengan edit baru E2 pada baris yang sama"
S=$(buat_siswa "Konkurensi K7")
buat_baris $S 2026-11-12 hadir "'07:15'"
jalan "$(edit_sql $S "'2026-11-12'" sakit E1 1 'Admin A')"       # E1: hadir -> sakit (yang terlihat oleh pengguna B)
E1=$(edit_terakhir $S 2026-11-12)
tahan "$(edit_sql $S "'2026-11-12'" izin E2 1 'Admin A')" "$T/k7a"; PID=$!   # E2: sakit -> izin, belum commit
tunggu_sesi "select o_kode from public.pulihkan_edit_manual($S, '2026-11-12', $E1, 2, 'Guru B');" "$T/k7b"   # B mengonfirmasi E1
wait $PID
KODE=$(baris1 $T/k7b)
cek "K7 tanpa deadlock/galat; B menunggu A selama ${WAIT}s (> 1 dtk)" "$(sama "$(grep -qiE 'deadlock|error' "$T/k7a" "$T/k7b" && echo 0 || echo 1)|$(lebih "$WAIT" 1)" '1|1')"
cek "K7 KRITERIA UTAMA: Pulihkan E1 ditolak -> sudah_berubah (bukan ok)" "$(sama "$KODE" 'sudah_berubah')"
cek "K7 E2 tidak dipulihkan diam-diam: status tetap izin (hasil E2), rev 3" \
    "$(sama "$($P -c "select status||'/'||rev from absensi where siswa_id=$S and tanggal='2026-11-12'")" 'izin/3')"
cek "K7 tidak ada edit yang ditandai dipulihkan dan tidak ada log pemulihan" \
    "$(sama "$($P -c "select count(*) from absensi_edit_manual where siswa_id=$S and dipulihkan_at is not null")|$($P -c "select count(*) from log_aktivitas where aksi='pulihkan_absensi' and target='Konkurensi K7'")" '0|0')"
E2=$(edit_terakhir $S 2026-11-12)
cek "K7 E2 memang edit terakhir (id lebih besar dari E1) dan tombol Pulihkan untuk E2 tersedia" \
    "$(sama "$(lebih "$E2" "$E1")|$($P -c "select o_edit_id from public.daftar_bisa_pulihkan('2026-11-12', array[$S]::bigint[])")" "1|$E2")"
jalan "select o_kode from public.pulihkan_edit_manual($S, '2026-11-12', $E2, 2, 'Guru B');"
cek "K7 setelah pengguna mengonfirmasi ulang E2 (yang benar-benar terakhir): pulih ke sakit" \
    "$(sama "$($P -c "select status from absensi where siswa_id=$S and tanggal='2026-11-12'")" 'sakit')"

# ═══ K8: urutan sebaliknya -> Pulihkan lebih dulu memegang lock, edit baru menunggu lalu berlaku ════
echo "--- K8: Pulihkan E1 memegang lock, edit baru E3 menunggu"
S=$(buat_siswa "Konkurensi K8")
buat_baris $S 2026-11-13 hadir "'07:15'"
jalan "$(edit_sql $S "'2026-11-13'" sakit E1 1 'Admin A')"
E1=$(edit_terakhir $S 2026-11-13)
tahan "select o_kode from public.pulihkan_edit_manual($S, '2026-11-13', $E1, 1, 'Admin A');" "$T/k8a"; PID=$!
tunggu_sesi "$(edit_sql $S "'2026-11-13'" izin E3 2 'Guru B')" "$T/k8b"
wait $PID
cek "K8 edit baru menunggu Pulihkan selama ${WAIT}s (> 1 dtk), tanpa galat" "$(sama "$(grep -qiE 'deadlock|error' "$T/k8a" "$T/k8b" && echo 0 || echo 1)|$(lebih "$WAIT" 1)" '1|1')"
cek "K8 Pulihkan E1 berhasil (ok) dan edit baru berlaku sesudahnya" "$(sama "$(baris1 $T/k8a)|$(baris1 $T/k8b)" 'ok|t|f')"
cek "K8 status akhir izin; sebelum E3 = hadir (kondisi hasil pemulihan); E1 ditandai dipulihkan" \
    "$(sama "$($P -c "select status from absensi where siswa_id=$S and tanggal='2026-11-13'")|$($P -c "select sebelum->>'status' from absensi_edit_manual where siswa_id=$S order by id desc limit 1")|$($P -c "select dipulihkan_at is not null from absensi_edit_manual where id=$E1")" 'izin|hadir|t')"
cek "K8 log transisi berurutan: hadir>sakit, sakit>hadir, hadir>izin" \
    "$(sama "$($P -c "select string_agg(status_lama||'>'||status_baru, ',' order by id) from absensi_log where siswa_id=$S")" 'hadir>sakit,sakit>hadir,hadir>izin')"

if [ "$TEMUAN" = "0" ]; then echo "=== UJI KONKURENSI LULUS ==="; else echo "=== UJI KONKURENSI LULUS ($TEMUAN temuan terbuka) ==="; fi
