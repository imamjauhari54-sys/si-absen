# SI-ABSEN — Next.js + Supabase

Migrasi dari PHP native + MySQL ke Next.js 16 (App Router) + Supabase.
Foto tetap pakai Cloudinary (URL-nya sudah ikut termigrasi di tabel `students`/`users`, jadi tinggal ditampilkan lewat `<img>`).

## Status progres

- [x] **Step 1 — Setup project**: struktur Next.js 16 + TS + Tailwind v4, koneksi Supabase (service role, server-only), auth custom JWT cookie (login/logout), proxy.ts proteksi route, layout+sidebar+topbar.
- [x] **Step 2 — Dashboard**: full port dari `dashboard.php`, `cek_alpha.php`, `ajax_auto_alpha.php`, `ajax_logs.php`.
- [x] **Step 3 — Data Siswa**: full port dari `siswa.php` (list, filter kelas/search, auto-generate token QR, preview ID card) + `cetak_idcard.php` (halaman cetak A4 standalone, mode 1 siswa / semua siswa terfilter).
- [x] **Step 4 — History per Siswa**: full port dari `history_siswa.php` — profil siswa, filter tapel/semester/bulan, widget statistik 5 status, grafik tren 6 bulan (Chart.js), tabel riwayat, export CSV. Route: `/siswa/[id]/history`.
- [x] **Step 5 — Rekap Absensi**: full port dari `rekap.php` + `ajax_absen_guru.php` — view Harian (widget statistik, tabel + edit status inline via modal) dan Bulanan (tabel matrix sticky-column desktop + card view mobile), filter kelas/tanggal/bulan, deteksi hari libur otomatis, kelola hari libur (CRUD, admin only), export CSV harian & bulanan, cetak (print CSS portrait/landscape sesuai view). Route: `/rekap`.
- [x] **Step 6 — History Rekap**: full port dari `rekap_history.php` — akumulasi total H/T/I/S/A per siswa satu tapel+semester penuh, badge persentase kehadiran (hijau ≥85%, kuning ≥75%, merah <75%), export CSV. Route: `/rekap-history`.
- [x] **Step 7 — Scan QR**: full port dari `scan_absen.php` + `ajax_absen.php` — scanner kamera real-time pakai `jsQR` (client-side, region-of-interest crop + grayscale buat performa), mode offline penuh (antrian di `localStorage`, auto-sync tiap 30 detik atau begitu online lagi), absen manual (cari nama + konfirmasi 2-tap), toggle suara (Web Audio API), ganti kamera depan/belakang, jeda/lanjutkan scan, anti-double-tap 30 detik, validasi jam masuk/terlambat/pulang/hari libur/sistem terkunci — semuanya port 1:1 dari logic PHP-nya. Route: `/scan-absen` (admin only, standalone tanpa sidebar).
- [x] **Step 8 — Pengaturan**: full port dari `setting.php` + `get_kelas_by_periode.php` — form jadwal sekolah (jam masuk/telat/pulang, tapel, semester) dengan live preview, Zona Bahaya (hapus data absensi per periode/kelas, admin only, konfirmasi ketik "HAPUS"), info sekolah, integrasi SI-ELISA, akses cepat. Route: `/setting`.

**🎉 Migrasi 8 step selesai semua — seluruh fitur SI-ABSEN sudah ter-port ke Next.js + Supabase.**
- [x] **Bug fix**: hydration mismatch di `ThemeToggle` (server vs client beda baca status tema) — sekarang tema dialirkan sebagai prop dari cookie yang sama yang dipakai layout, bukan ditebak dari `document` saat render.
- [x] **Bug fix**: invalid HTML nesting (`<h3>`/`<div>`/`<p>` di dalam `<p>`) di header dashboard yang bikin `LogAktivitasModal` ke-render aneh — `<p>` diganti `<div>`.
- [x] **Bug fix (penting, root cause)**: class `.reveal` (dipakai di HAMPIR SEMUA card di seluruh app) meninggalkan `transform: translateY(0)` dan `filter: blur(0)` permanen setelah animasi masuk selesai. Browser tetap menghitung itu sebagai transform/filter aktif, yang bikin SEMUA modal `position: fixed` di dalam elemen `.reveal` manapun ke-"kurung" di kotak parent-nya alih-alih nutup layar penuh (gejala: "Log Aktivitas tenggelam"). Diperbaiki di `globals.css` — keyframe akhir diubah dari `translateY(0)`/`blur(0)` ke `none`.
- [x] **Bug fix (final & robust)**: fix `.reveal` di atas ternyata belum menyelesaikan semua kasus (masih ada modal lain yang "tenggelam"). Solusi definitif: semua modal sekarang dibungkus komponen `Portal` (`src/components/ui/Portal.tsx`) yang me-render lewat `createPortal` langsung ke `document.body`, lepas dari ancestor DOM manapun — kebal terhadap containing-block issue apa pun penyebabnya. Dipasang di semua modal: LogAktivitasModal, AlphaModal, HariLiburModal, HarianTable, LogoutModal, SiswaTable, SiswaFormModal.
- [x] **Fitur baru — CRUD Data Siswa (di luar scope PHP asli)**: tombol **Tambah Siswa** & **Edit** (admin only) di halaman `/siswa`, pakai modal form yang sama (`SiswaFormModal`) untuk create & edit. Route baru: `POST /api/siswa`, `PUT /api/siswa/[id]`.
- [x] **Fitur baru — Upload foto langsung ke Cloudinary**: field foto di form Tambah/Edit siswa bukan lagi input URL manual, tapi tombol upload asli (`FotoUploader.tsx`) yang langsung upload ke Cloudinary dari browser pakai *unsigned upload preset* — sama seperti pola project sekolah kakak yang lain. **Perlu 2 env var baru** — lihat bagian `.env.local` di bawah.
- [x] **Fitur baru**: kartu KPI di halaman Data Siswa sekarang punya hover effect (gradient + naik dikit) sama seperti kartu-kartu lain, pakai skema warna baru (`sk-indigo`/`sk-blue`/`sk-pink`/`sk-emerald`) di `components/siswa/kpi.css`.

## Cara jalanin

```bash
npm install
cp .env.local.example .env.local   # isi 3 variabel di bawah
npm run dev
```

Isi `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL` & `SUPABASE_SERVICE_ROLE_KEY` — dari Supabase Dashboard > Settings > API
- `SESSION_SECRET` — string acak panjang, contoh generate: `openssl rand -base64 48`
- `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` — dari Cloudinary Dashboard > Settings > Upload > Upload presets (pastikan presetnya di-set **Unsigned**). Dipakai buat fitur upload foto siswa (tanpa ini, form Tambah/Edit siswa tetap bisa dipakai tapi upload foto akan gagal dengan pesan error yang jelas)

## Keputusan teknis (kenapa begini)

1. **Supabase service role di server, bukan anon key + RLS.** SI-ABSEN aplikasi internal admin/guru, semua akses data lewat Server Component/Server Action/Route Handler — tidak ada query dari browser. Jadi otorisasi ditegakkan manual lewat sesi JWT, bukan RLS. Kalau nanti mau expose sebagian data ke client langsung (misal realtime), baru perlu setup RLS + anon key terpisah.
2. **Auth custom JWT cookie**, bukan NextAuth/Supabase Auth — sesuai pilihan kakak, dan supaya cocok dengan tabel `users` yang sudah ada (password bcrypt hasil migrasi dari PHP `password_hash()`, jadi `bcryptjs.compare()` langsung jalan tanpa re-hash).
3. **`src/proxy.ts`** menggantikan `middleware.ts` (konvensi Next.js 16, sama seperti project website sekolah kakak yang lain).
4. **`<img>` biasa, bukan `next/image`**, untuk foto Cloudinary — konsisten dengan pola project sekolah kakak yang lain (custom loader dibuat untuk hindarin kuota optimasi image Vercel).
5. **Font Awesome via CDN** dipertahankan dari versi PHP biar ikon 1:1 sama. Bisa diganti ke `lucide-react` nanti kalau mau full-React murni.
6. **`/cetak-idcard` di luar route group `(app)`** — sengaja tidak pakai sidebar/topbar, karena halaman ini murni buat print A4 (auto-print via `?print=1`, tombol Tutup manggil `window.close()`).
7. **Token QR di-generate on-the-fly** (auto-insert ke `absensi_qr_token` kalau siswa belum punya token) — port 1:1 dari logic `siswa.php`/`cetak_idcard.php`. Pakai `upsert(..., ignoreDuplicates: true)` sebagai padanan `INSERT IGNORE` MySQL.
8. **QR code image** masih dari `api.qrserver.com` (layanan eksternal gratis) — sama seperti versi PHP, bukan generate lokal.
9. **CSV export lewat Route Handler** (`/api/siswa/[id]/history-csv`, `/api/rekap/export`, `/api/rekap/history-export`), bukan query param `?export=csv` di halaman yang sama seperti versi PHP — pola Next.js yang lebih bersih buat file download dengan header `Content-Disposition`.
10. **Chart.js dipasang langsung via npm** (bukan CDN kayak versi PHP) supaya konsisten dengan pola import project Next.js lain, dirender lewat `<canvas>` client component.
11. **CSS widget di halaman History, Rekap, & History Rekap dikasih prefix `hw-`** (bukan reuse class `.widget-*` dari dashboard) karena skema warnanya beda (izin=indigo, sakit=purple terpisah, sementara dashboard menggabung izin+sakit jadi satu warna violet) — biar nggak tabrakan.
12. **Kelola Hari Libur jadi REST API** (`GET/POST /api/hari-libur`, `DELETE /api/hari-libur/[id]`) — bukan satu file `rekap.php?ajax_libur=1&act=...` seperti PHP, biar lebih idiomatik Next.js.
13. **Edit status absensi** (`/api/absen/edit`) port 1:1 dari `ajax_absen_guru.php`, termasuk pengecekan hari Minggu/libur, auto jam_masuk kalau status hadir/terlambat, dan pencatatan ke `absensi_log` (dengan kolom `tanggal_absen`) kalau status berubah.
14. **Print CSS harian vs bulanan** pakai `<style>{'@page {...}'}</style>` inline yang dirender dinamis dari Server Component (`view === 'bulanan' ? landscape : portrait'`), setara `<?= $view === 'bulanan' ? 'landscape' : 'portrait' ?>` di PHP.
15. **Tema (dark/light) dialirkan sebagai prop dari cookie yang sama yang dipakai root layout**, bukan dibaca ulang dari `document` di `ThemeToggle` — cara lama itu bikin hydration mismatch karena server & client bisa beda baca.
16. **Tambah/Edit siswa saya batasi admin only** (guru cuma bisa lihat) — asumsi saya karena data induk siswa biasanya dikelola terpusat. Kalau ternyata guru wali kelas juga perlu bisa edit siswa di kelasnya sendiri, tinggal bilang, saya longgarkan pengecekan role-nya di `/api/siswa` & `/api/siswa/[id]`.
17. **Upload foto pakai unsigned upload preset Cloudinary**, langsung dari browser tanpa lewat server kita — pola yang sama dengan project website sekolah kakak yang lain. Tidak perlu API secret sama sekali karena presetnya sudah dibatasi (folder/ukuran/format) dari sisi Cloudinary sendiri.
18. **`scanner_id` di-generate murni di client** (`crypto.randomUUID()`, disimpan permanen di `localStorage`), bukan `md5(User-Agent + IP)` seperti versi PHP — lebih stabil (nggak berubah kalau IP device berubah, misal pindah WiFi) dan nggak butuh akses IP dari server ke client. Tabel `absensi_scanner` tetap sama persis strukturnya, cuma sumber ID-nya beda.
19. **`/scan-absen` di luar route group `(app)`** — sama seperti `/cetak-idcard`, halaman ini full-screen sendiri tanpa sidebar/topbar, karena didesain buat dipasang di tablet/HP khusus scan absen, bukan dashboard admin biasa.
20. **Simpan Jadwal & Reset Data pakai Next.js Server Actions** (`useActionState`), bukan API route + fetch seperti fitur lain — pola yang sama dengan halaman Login. Cocok karena keduanya form submission klasik tanpa kebutuhan polling/realtime.
21. **Simpan Jadwal bisa diakses admin maupun guru** (bukan admin-only) — ini sengaja disamakan persis dengan `setting.php` asli, yang cuma nge-gate "Zona Bahaya" (hapus data) ke admin, bukan form jadwalnya. Kalau kakak mau ini juga admin-only, tinggal bilang, saya tambahin pengecekan role di `simpanJadwalAction`.

## Yang perlu dicek pas nyambungin ke Supabase asli

- Nama tabel/kolom yang dipakai (samakan kalau ada beda nama pas migrasi):
  `users(id, username, password, name, role, foto)`,
  `students(id, name, class, foto, nisn, jenis_kelamin)`,
  `absensi_qr_token(siswa_id, token)` — unique constraint di `siswa_id` (dibutuhkan buat `upsert ignoreDuplicates`),
  `absensi(id, siswa_id, tanggal, status, jam_masuk, jam_pulang, keterangan, created_at, tapel, semester, scan_oleh, scanner_id)`,
  `absensi_setting(jam_masuk, batas_terlambat, jam_pulang_mulai, tapel, semester)`,
  `absensi_log(id, admin_id, siswa_id, tanggal_absen, status_lama, status_baru, keterangan, scanner_id, created_at)`,
  `absensi_scanner(scanner_id, device_name, ip_address, status, total_scans, offline_queue_count, last_sync, created_at, updated_at)` — tabel baru, tracking device scanner (multi-scanner support),
  `hari_libur(id, tanggal, keterangan)` — unique constraint di `tanggal` (dipakai `upsert onConflict` di tambah-libur),
  `settings(key, value)` — termasuk key `alamat_sekolah` (dipakai di ID card),
  `guru_mengajar_kelas(guru_id, class, mapel)`.
- Skema SQL siap pakai (lengkap + data sample) ada di `si-absen-supabase-schema.sql` yang saya kirim terpisah — sudah tervalidasi jalan di Postgres 16, termasuk kolom `absensi_log.tanggal_absen`, `absensi.scanner_id`, `absensi_log.scanner_id`, dan tabel baru `absensi_scanner`. Kalau kakak sudah pernah jalanin versi SQL sebelumnya, tinggal jalanin lagi file yang baru — semua perubahan pakai `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`, aman, data lama tidak hilang.
- Build production (`npm run build`) sudah dites sukses di sandbox saya (pakai dummy env), tapi **belum pernah dites nyambung ke Supabase project asli kakak** — jadi kemungkinan ada penyesuaian kecil nama kolom/tabel begitu dicoba pertama kali.
