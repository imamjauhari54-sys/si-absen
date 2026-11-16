# Uji end-to-end halaman persetujuan & PIN (admin / wali kelas)

Sama dengan `scripts/e2e-portal`: aplikasi hasil build dijalankan terhadap PostgREST tiruan (`fake-postgrest.js`) lalu
Chromium (Playwright) mengemudikan alur: daftar, detail, setujui semua/sebagian/tolak, buat PIN, cetak slip (mode print + PDF),
tandai dibagikan, WA keputusan ke orang tua (gateway tiruan :54399), lencana penanda menu, pembatasan guru ke kelasnya, 404 untuk ID aneh, tanpa scroll horizontal di 360px.

1. `node scripts/e2e-admin/fake-postgrest.js` (port 54321; env `KELAS_GURU` = kelas wali si guru, bawaan 6)
2. Build & `next start -p 3055` dengan env yang sama seperti e2e-portal
3. Cookie sesi (`si_absen_session`, JWT HS256 dengan `SESSION_SECRET`, payload `{userId,username,nama,role,kelas,foto}`) ke `<dir>/admin.txt` dan `<dir>/guru.txt`
4. `node scripts/e2e-admin/e2e.js <dir>`
