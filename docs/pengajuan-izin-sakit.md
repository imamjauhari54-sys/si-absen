# Pengajuan izin/sakit dari Portal Siswa (migrasi 027)

Orang tua mengajukan → wali kelas/admin menyetujui → absensi tercatat. **Pengajuan tidak pernah langsung mengubah absensi.**

## Aturan

| Ketentuan | Sakit | Izin |
|---|---|---|
| Durasi | maks 14 hari (rentang kalender) | 1 hari sekolah |
| Beberapa hari | ya (Minggu & libur dilewati) | tidak (buat pengajuan baru) |
| Lampiran | wajib bila > 2 hari sekolah | opsional |
| Persetujuan wali kelas/admin | wajib | wajib |
| Scan mengalahkan pengajuan | ya | ya |

Batas umum (konstanta di `ajukan_pengajuan_izin`; salinan untuk tampilan ada di `ATURAN_PENGAJUAN` pada `utils/pengajuan.ts` dan dijaga `pengajuan.kontrak.test.ts` agar tidak berbeda dari SQL): maks 7 hari ke belakang, 30 hari ke depan, 3 pengajuan Menunggu per siswa, tanggal yang sama tidak boleh dipakai dua pengajuan aktif (dijaga indeks unik).

## Siklus per hari (`pengajuan_izin_hari.hasil`)

- **hari lampau disetujui** → langsung ditulis lewat `edit_manual_absensi` (snapshot, bisa dipulihkan). Alpha lama diubah jadi izin/sakit. Hari yang sudah Hadir/Terlambat **tidak ditimpa** (`scan_menang`); hari yang sudah izin/sakit dibiarkan (`sudah_tercatat`).
- **hari ini/mendatang disetujui** → hanya **rencana** (`direncanakan`). Cron `terapkan_rencana_pengajuan(tanggal)` menulisnya pada harinya **hanya bila siswa tidak scan**. Bila siswa scan, Hadir/Terlambat menang; pengajuan tetap **Disetujui** sebagai riwayat, absensi mengikuti kejadian sebenarnya.
- **persetujuan sebagian** → hari yang tidak disetujui TIDAK otomatis izin/sakit; mengikuti aturan normal. Hari lampau tanpa catatan dievaluasi **Alpha** (`dialpha`).
- **ditolak / dibatalkan** → sama: hari lampau tanpa catatan dievaluasi Alpha; hari ini/mendatang diserahkan ke aturan normal.

## Status Menunggu di seluruh aplikasi

Hari yang pengajuannya **Menunggu** tampil **Menunggu** dan **tidak dihitung** (bukan Alpha) di: Rekap Harian & Bulanan admin, Portal Siswa (kartu bulanan, kartu ringkasan, grafik), ekspor CSV ("M"), peringatan Alpha berturut-turut, History semester (SQL), dan Alpha otomatis. Aturannya satu: `utils/rekap-siswa.ts` (baseline) + `tanggal_menunggu()` di SQL. Catatan **nyata** (Hadir/Terlambat/Izin/Sakit) pada hari itu tetap menang. Ditolak/dibatalkan → kembali ke baseline; Disetujui → catatan izin/sakit.

## Cron Alpha otomatis (`/api/absen/auto-alpha`, sudah tersambung)

1. Memanggil `terapkan_rencana_pengajuan(hari_ini)` **sebelum** membaca absensi: pengajuan disetujui untuk hari ini ditulis sebagai izin/sakit (hanya bila siswa tidak scan).
2. Siswa dengan pengajuan **Menunggu** hari ini: **tidak ditulis Alpha dan tidak dikirimi WA Alpha**.
3. **Gagal tertutup**: bila pemrosesan pengajuan error (selain fitur belum terpasang), tidak ada Alpha/WA yang dikirim dan respons 500.
Evaluasi Alpha di SQL saat ditolak/dibatalkan tidak mengirim WA; pemberitahuan keputusan dikirim aplikasi (lihat *Tahap 5*). Pembatalan oleh orang tua sendiri tidak diberi WA.

## PIN orang tua (ACAK, tanpa PIN bawaan)

Login baca Portal Siswa tetap NISN saja. **Mengajukan/membatalkan wajib PIN 6 digit acak per siswa.** Alur: wali kelas/admin membuat PIN (`buat_pin_acak_ortu`) → membagikannya **pribadi** → menandai sudah dibagikan (`tandai_pin_dibagikan`). Sistem **tidak pernah** menganggap PIN terbagikan otomatis (`dibagikan_pada` hanya terisi lewat tindakan eksplisit). Siswa tanpa PIN tidak bisa mengajukan (`PIN_BELUM_DIATUR`).

Verifikasi di SQL (`verifikasi_pin_ortu`) dengan kunci baris: 5 salah berturut-turut mengunci 15 menit, kelipatan 5 berikutnya menggandakan (maks 4 jam); tebakan paralel dihitung bergantian. PIN disimpan sebagai hash bcrypt. Reset (`reset_pin_ortu`) membuat PIN acak **baru**; PIN lama mati dan status "dibagikan" dikosongkan. Orang tua boleh mengganti PIN sendiri (wajib PIN lama).

## Pengujian

`supabase/tests/pengajuan_izin.test.sql` (64 pengecekan, termasuk PIN acak dan status Menunggu di fungsi rekap SQL) dan `supabase/tests/pengajuan_izin_konkurensi.sh` (pengajuan serentak, tebakan PIN paralel, keputusan vs pembatalan, cron ganda). Jalankan hanya di database uji.

## API (Tahap 2)

Semua aturan bisnis tetap di SQL; route hanya memeriksa bentuk input, otorisasi, dan PIN, lalu memanggil fungsi SQL. Respons seragam: `{ status: "ok" | "error", message?, kode? }`, selalu `Cache-Control: no-store`. Body JSON wajib `Content-Type: application/json` (sekaligus lapisan tambahan terhadap CSRF).

### Portal orang tua: `/portal-siswa/api/...`
Path sengaja di bawah `/portal-siswa` agar tidak dicegat proxy sesi admin; sesi siswa (NISN) dijaga di tiap route. **Identitas siswa selalu dari sesi, tidak pernah dari body.**

| Endpoint | Fungsi | PIN |
|---|---|---|
| `GET /portal-siswa/api/pengajuan` | Riwayat pengajuan + status PIN + aturan. **Tanpa alasan dan URL lampiran** (`adaLampiran: true/false`), karena bisa berisi info kesehatan dan login portal hanya NISN. | tidak |
| `POST /portal-siswa/api/pengajuan` | Ajukan: `{ jenis, tanggal_dari, tanggal_sampai?, alasan, lampiran_url?, pin }` → `ajukan_pengajuan_izin` | wajib |
| `POST /portal-siswa/api/pengajuan/{id}/batal` | Batalkan yang masih Menunggu: `{ pin }` → `batalkan_pengajuan_izin` | wajib |
| `POST /portal-siswa/api/pin` | Ganti PIN: `{ pin_lama, pin_baru }` → `atur_pin_ortu` | PIN lama |
| `POST /portal-siswa/api/lampiran/signature` | Tanda tangan unggah Cloudinary (folder `si-absen/pengajuan`, format jpg/jpeg/png/webp): `{ pin }` | wajib |

Urutan di tiap tindakan tulis: bentuk input → PIN (`verifikasi_pin_ortu`) → aturan bisnis SQL. Input yang salah bentuk ditolak sebelum PIN sehingga tidak membakar percobaan. Kode galat PIN: `PIN_SALAH` 403 (+`sisa_percobaan`), `TERKUNCI` 429 (+`Retry-After`, `terkunci_sampai`), `PIN_BELUM_DIATUR` 409.

### Wali kelas / admin: `/api/...` (sesi admin/guru)
Guru hanya kelas wali-nya (dibaca dari DB, bukan JWT; guru tanpa kelas ditolak, tidak pernah jatuh ke "semua kelas"). Untuk guru, "tidak ada" dan "kelas lain" dijawab sama (403) agar ID tidak bisa ditebak.

| Endpoint | Fungsi |
|---|---|
| `GET /api/pengajuan?status=menunggu\|semua&kelas=&page=` | Daftar (20 per halaman). Menunggu: terlama di atas. |
| `GET /api/pengajuan/{id}` | Detail + **pratinjau per hari**: bila disetujui (`ditulis` / `direncanakan` / `scan_menang` / `sudah_tercatat`) dan bila tidak (`dialpha` / `tidak_berubah`). Hanya membaca. |
| `POST /api/pengajuan/{id}/putuskan` | `{ keputusan: "setujui"\|"tolak", hari?: [...], catatan? }`. `hari` = persetujuan sebagian. Pemutus dari sesi. Satu transaksi di SQL. Setelah sukses: WA keputusan ke orang tua di `after()` + penanda menu disegarkan (Tahap 5). |
| `GET /api/pin-ortu?kelas=` | Status PIN per siswa (ada/dibagikan/terkunci). Hash/PIN tidak pernah dikirim. |
| `POST /api/pin-ortu` | `{ action: "buat"\|"reset"\|"tandai_dibagikan", siswa_ids: [...] }` (maks 100). `buat` hanya untuk siswa tanpa PIN (PIN yang sudah dibagikan tidak mati tanpa sengaja); `reset` menimpa. PIN polos hanya ada di respons `buat`/`reset`, sekali; tidak masuk log. |

### Pengujian tambahan
- `pengajuan.test.ts` / `pengajuan.kontrak.test.ts`: validasi, pemetaan galat, dan kontrak TS↔SQL (nama parameter RPC dibaca dari file migrasi; setiap tes route otomatis gagal bila salah nama/kurang parameter wajib).
- `portal-api.test.ts`, `pengajuan-api.test.ts`: route (sesi, PIN sebelum aturan bisnis, pembatasan kelas guru, PIN tidak bocor ke log/respons).
- `supabase/tests/pengajuan_pratinjau_matriks.sql` + `pengajuan.matriks.test.ts`: pratinjau TypeScript dicocokkan dengan perilaku SQL sungguhan (lihat petunjuk di berkas SQL).

## Form pengajuan di portal (Tahap 3)

Bagian **Pengajuan Izin / Sakit** ada di dashboard portal (`/portal-siswa/dashboard`), di bawah kartu profil.
- **Aman bila migrasi 027 belum dijalankan** atau database bermasalah: `muatPengajuanPortal` tidak pernah melempar; bagian itu disembunyikan (migrasi belum ada) atau diganti catatan singkat, halaman absensi tetap tampil.
- **Form**: jenis (izin satu hari / sakit rentang), tanggal (kalender dibatasi 7 hari ke belakang s.d. 30 hari ke depan), alasan (5-300 karakter, penghitung), foto surat (JPG/PNG/WebP maks 5 MB; ditandai *wajib* otomatis bila sakit > 2 hari sekolah, dihitung dengan hari libur), PIN. Pemeriksaan di klien hanya bantuan tampilan; pesan galat server selalu ditampilkan apa adanya.
- **Unggah**: PIN -> tanda tangan server -> langsung ke Cloudinary -> kirim pengajuan. Foto yang sudah terunggah tidak diunggah ulang bila pengiriman gagal (mis. PIN salah) lalu dicoba lagi. Klik ganda dicegah.
- **PIN salah/terkunci**: pesan sisa percobaan / jam WIB; kolom PIN dikosongkan dan difokuskan; isian lain dipertahankan.
- **Penjelasan status Menunggu** (lipat) menerangkan: tidak langsung mengubah absensi, tidak dihitung Alpha, hasil bila disetujui/ditolak/dibatalkan.
- **Riwayat**: kartu per pengajuan dengan keterangan per hari, catatan wali kelas, tombol Batalkan (PIN) selama Menunggu, dan Ganti PIN.
- Tombol Ajukan nonaktif beserta alasannya bila PIN belum dibuat, terkunci, atau sudah ada 3 pengajuan Menunggu.
- Uji: `pengajuan-form.test.ts`, `pengajuan-klien.test.ts`, dan `scripts/e2e-portal/` (browser sungguhan, 38 pengecekan).

## Halaman persetujuan dan PIN (Tahap 4)

**Menu baru** (admin dan wali kelas): *Pengajuan Izin* (`/pengajuan`). Halaman *PIN Orang Tua* (`/pin-ortu`) tidak punya menu sendiri; dibuka lewat tombol "PIN Orang Tua" di halaman Pengajuan Izin (menu Pengajuan Izin tetap menyala di sana).

### /pengajuan
- Daftar: filter **Menunggu** (terlama di atas) atau **Semua**; admin dapat memfilter kelas. Guru SELALU dibatasi ke kelas walinya dari DB (query `?kelas=` diabaikan).
- Detail `/pengajuan/[id]`: alasan (ditampilkan sebagai teks), lampiran (hanya `https`, tab baru, `noopener`), dan **pratinjau per hari**: catatan absensi yang sudah ada serta akibat bila disetujui / tidak disetujui.
- Keputusan: **Setujui semua**, **Setujui sebagian** (centang hari; yang tidak dicentang tidak otomatis jadi izin/sakit), **Tolak**; catatan opsional (maks. 300). Memilih semua hari pada "sebagian" dikirim sebagai setujui penuh (status *Disetujui*).
- Pratinjau dan ringkasan akibat hanya penjelasan; yang memutuskan tetap `putuskan_pengajuan_izin` (SQL). Hasil dihitung dari `pratinjauHariDisetujui/TidakDisetujui`, yang dijaga kesamaannya dengan SQL oleh matriks 36 kasus.
- Akses: guru yang membuka pengajuan kelas lain melihat halaman "tidak ditemukan" yang sama dengan ID tidak ada. Catatan: karena `loading.tsx`, status HTTP sudah 200 saat halaman dialirkan; isi halaman tetap "tidak ditemukan" tanpa data.

### /pin-ortu
- Pilih kelas (admin) atau otomatis kelas wali (guru). Tabel status PIN per siswa: belum ada, belum dibagikan, sudah dibagikan, terkunci.
- **Buat PIN** hanya untuk yang belum punya; **Reset** (dengan konfirmasi) untuk siswa terpilih; **Tandai sudah dibagikan** manual.
- PIN polos hanya hidup di memori halaman sesudah dibuat/direset: tidak masuk URL, storage, atau log, dan hilang saat halaman dimuat ulang atau pindah kelas.
- **Cetak slip PIN**: `window.print()` dengan CSS khusus cetak, 8 slip per lembar A4 (2 kolom), garis potong putus-putus.

### Uji
- `keputusan-pengajuan.test.ts`, `cetak-pin.test.ts` (logika murni, termasuk kontrak body klien ↔ `parsePutuskan`).
- `scripts/e2e-admin` (Chromium + PostgREST tiruan): 36 pemeriksaan, lihat README-nya.

## Notifikasi WA keputusan + penanda wali kelas (Tahap 5)

**Migrasi `028_wa_log_keputusan.sql`** melonggarkan CHECK `wa_log.tipe` menjadi `absen | alpha | keputusan` (idempoten, data lama tidak berubah; diuji di Postgres 16). Bila belum dijalankan, pesan tetap terkirim dan hanya baris lognya yang gagal dicatat (`console.error`).

### WA keputusan
- Dikirim dari `POST /api/pengajuan/{id}/putuskan` **hanya setelah** SQL sukses, lewat `after()` (`kirimNotifKeputusan(id)`). Keputusan yang ditolak SQL, 403, atau input salah **tidak** mengirim apa pun. Karena SQL hanya mengizinkan satu keputusan per pengajuan, satu pengajuan paling banyak satu pesan.
- Isi pesan dibangun dari data **tersimpan** di database (bukan dari body permintaan): jenis, nama, kelas, tanggal disetujui / tidak disetujui, dan **catatan wali kelas**. Tanggal yang sudah lewat dan dicatat Alpha disebut bila ada. Lebih dari 5 tanggal diringkas ("6 hari (… s.d. …)").
- **Privasi:** alasan dan lampiran pengajuan (bisa berisi info kesehatan) **tidak pernah** masuk pesan; dijaga tes.
- Dapat dimatikan admin di **Pengaturan WA → Jenis notifikasi → "Keputusan izin/sakit"** (`wa_notif_keputusan`). **Bawaan: aktif**, karena orang tua yang mengajukan menunggu jawabannya. Perlu WA aktif dan URL/API key terisi; bila tidak, tidak ada pesan dan tidak ada log (bukan kegagalan).
- Setiap percobaan tercatat di *Log Notifikasi WA* sebagai "Keputusan izin" (terkirim/gagal, termasuk nomor HP kosong dan gateway menolak). Gagal kirim **tidak pernah** membatalkan keputusan.

### Penanda wali kelas
- Menu *Pengajuan Izin* menampilkan lencana jumlah pengajuan **Menunggu** (admin: semua kelas; wali kelas: kelasnya dari DB; guru tanpa kelas: tidak ada). Maks "99+".
- Dihitung di layout dengan cache 30 detik (`hitungPenandaPengajuan`) dan dibuang segera saat ada pengajuan baru, dibatalkan, atau diputuskan (`segarkanPenandaPengajuan`). Tidak pernah melempar: bila migrasi 027 belum ada, lencana tidak tampil dan halaman tetap normal.

### Uji
`pesan-keputusan.test.ts`, `notifikasi-keputusan.test.ts` (termasuk privasi dan tiap jalur gagal), `penanda-pengajuan.test.ts`, pembaruan `pengajuan-api.test.ts`; `scripts/e2e-admin` kini 45 pemeriksaan (gateway WA tiruan di port 54399 menangkap pesan sungguhan dari aplikasi).
