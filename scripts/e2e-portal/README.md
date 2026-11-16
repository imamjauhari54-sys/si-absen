# Uji end-to-end form pengajuan portal (browser sungguhan)

Menjalankan aplikasi hasil build terhadap **PostgREST tiruan** (`fake-postgrest.js`, data di memori, PIN dengan penguncian)
lalu mengemudikan Chromium (Playwright) lewat seluruh alur orang tua: validasi, PIN salah/benar, unggah lampiran,
batas 3 menunggu, batal, ganti PIN, terkunci, PIN belum dibuat, sesi habis, tanpa scroll horizontal di 360px.
Tidak menyentuh database sungguhan.

1. `node scripts/e2e-portal/fake-postgrest.js` (port 54321)
2. Build & jalankan app dengan env: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=x SESSION_SECRET=<rahasia> NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=demo-cloud CLOUDINARY_CLOUD_NAME=demo-cloud CLOUDINARY_API_KEY=k CLOUDINARY_API_SECRET=s`, lalu `next start -p 3055`
3. Buat cookie sesi siswa (JWT HS256, kunci `SESSION_SECRET + ":siswa"`, payload `{siswaId:42,nama,kelas,nisn}`) ke `<dir>/cookie.txt`
4. `node scripts/e2e-portal/e2e.js <dir>` (screenshot ditulis ke `<dir>`). Mulai ulang fake-postgrest sebelum tiap putaran.
