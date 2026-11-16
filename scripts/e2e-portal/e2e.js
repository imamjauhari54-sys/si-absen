const { chromium } = require("playwright");
const fs = require("fs");
const SP = process.argv[2];
const B = "http://127.0.0.1:3055", FAKE = "http://127.0.0.1:54321/rest/v1/__state";
const cookie = fs.readFileSync(SP + "/cookie.txt", "utf8").trim();
const hasil = [];
const cek = (nama, ok, info = "") => { hasil.push(ok); console.log((ok ? "OK    : " : "GAGAL : ") + nama + (ok ? "" : "   -> " + info)); };
const state = async () => (await fetch(FAKE)).json();
const setState = (o) => fetch(FAKE, { method: "POST", body: JSON.stringify(o) });
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await ctx.addCookies([{ name: "si_absen_siswa_session", value: cookie, url: B }]);
  const cloud = [];
  await ctx.route("https://api.cloudinary.com/**", (route) => { cloud.push(route.request().postData() || ""); route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ secure_url: "https://res.cloudinary.com/demo-cloud/image/upload/v1/si-absen/pengajuan/surat.png" }) }); });
  const page = await ctx.newPage();
  const errs = [], api = [];
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|fonts|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  page.on("pageerror", (e) => errs.push("PAGEERROR " + e.message));
  page.on("request", (r) => { if (r.url().includes("/portal-siswa/api/")) api.push(r.method() + " " + new URL(r.url()).pathname + " " + (r.postData() || "")); });
  const form = page.locator('form[aria-label="Form pengajuan izin atau sakit"]');
  const kartu = page.locator('[data-testid="kartu-pengajuan"]');
  const kirim = form.locator('button[type=submit]');
  const buka = async () => { await page.getByRole("button", { name: /Ajukan/ }).click(); await form.waitFor(); };
  const isi = async ({ jenis, dari, sampai, alasan, pin }) => {
    if (jenis) await form.locator(`label:has(input[value="${jenis}"])`).click();
    if (dari) await page.fill("#aj-dari", dari);
    if (sampai) await page.fill("#aj-sampai", sampai);
    if (alasan !== undefined) await page.fill("#aj-alasan", alasan);
    if (pin !== undefined) await page.fill("#aj-pin", pin);
  };
  const muat = async () => { await page.goto(B + "/portal-siswa/dashboard"); await page.locator('[data-testid="bagian-pengajuan"]').waitFor(); };

  // 1. tampilan awal
  await muat();
  cek("1a bagian pengajuan tampil dengan 2 riwayat (disetujui, ditolak)", (await kartu.count()) === 2);
  const html = await page.content();
  cek("1b alasan & lampiran TIDAK ada di halaman (privasi, login hanya NISN)", !html.includes("Demam") && !html.includes("Keperluan"));
  cek("1c catatan wali kelas tampil", await page.getByText("Mohon lampirkan surat").isVisible());
  await page.locator("details summary").click();
  cek("1d penjelasan status Menunggu bisa dibuka", await page.getByText(/tidak dihitung Alpha/).isVisible());
  await page.locator("details summary").click();
  await page.screenshot({ path: SP + "/s1-awal.png", fullPage: false });

  // 2. kirim kosong
  await buka();
  const n0 = api.length;
  await kirim.click();
  cek("2a form kosong: galat per kolom tampil", await page.getByText("Pilih izin atau sakit.").isVisible() && await page.getByText("Pilih tanggal.").isVisible() && await page.getByText(/Alasan minimal 5/).isVisible() && await page.getByText("PIN 6 digit angka.").isVisible());
  cek("2b tidak ada panggilan API", api.length === n0);
  cek("2c fokus pindah ke kolom pertama yang salah", await page.evaluate(() => document.activeElement && document.activeElement.id) === "aj-jenis");
  await page.screenshot({ path: SP + "/s2-galat.png", fullPage: true });

  // 3. PIN salah
  await isi({ jenis: "izin", dari: "2026-11-16", alasan: "Acara keluarga", pin: "000000" });
  cek("3a tanggal_sampai tidak muncul untuk izin", (await page.locator("#aj-sampai").count()) === 0);
  await kirim.click();
  await page.getByRole("alert").filter({ hasText: "PIN salah" }).waitFor();
  cek("3b PIN salah: pesan dengan sisa percobaan", await page.getByText("PIN salah. Sisa percobaan: 4.").isVisible());
  cek("3c PIN dikosongkan & difokuskan, isian lain dipertahankan", (await page.inputValue("#aj-pin")) === "" && (await page.inputValue("#aj-alasan")) === "Acara keluarga" && (await page.evaluate(() => document.activeElement.id)) === "aj-pin");
  cek("3d belum ada pengajuan baru", (await state()).store.length === 2);

  // 4. izin berhasil
  await page.fill("#aj-pin", "483920");
  await kirim.click();
  await page.getByRole("status").filter({ hasText: "Pengajuan terkirim" }).waitFor();
  await kartu.nth(2).waitFor();
  cek("4a sukses: banner, form tertutup, kartu baru (3) lewat refresh server", (await kartu.count()) === 3 && (await form.count()) === 0);
  cek("4b kartu baru berstatus Menunggu & tanggal benar", (await kartu.first().getAttribute("data-status")) === "menunggu" && await kartu.first().getByText("Izin · Sen, 16 Nov 2026").isVisible());
  cek("4c body POST memuat tanggal_sampai = tanggal_dari & PIN", api.some((a) => a.startsWith("POST /portal-siswa/api/pengajuan ") && a.includes('"tanggal_sampai":"2026-11-16"') && a.includes('"pin":"483920"')));
  await page.screenshot({ path: SP + "/s4-sukses.png", fullPage: true });

  // 5. sakit 3 hari: lampiran wajib
  await buka();
  await isi({ jenis: "sakit", dari: "2026-11-17", sampai: "2026-11-19", alasan: "Sakit demam", pin: "483920" });
  cek("5a label foto menandai (wajib)", await form.getByText("(wajib)").isVisible());
  const n1 = api.length;
  await kirim.click();
  cek("5b tanpa foto: ditolak di klien, tanpa API", await page.getByText(/Foto surat dokter wajib/).isVisible() && api.length === n1);
  await page.setInputFiles("#aj-lampiran", { name: "surat.png", mimeType: "image/png", buffer: PNG });
  cek("5c pratinjau foto tampil", await form.locator('img[alt="Pratinjau foto surat"]').isVisible());
  await page.setInputFiles("#aj-lampiran", { name: "doc.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF") });
  await kirim.click();
  cek("5d PDF ditolak", await page.getByText("Hanya foto JPG, PNG, atau WebP.").isVisible());
  await page.setInputFiles("#aj-lampiran", { name: "surat.png", mimeType: "image/png", buffer: PNG });
  await kirim.click();
  await page.getByRole("status").filter({ hasText: "Pengajuan terkirim" }).waitFor();
  const urutan = api.slice(n1).map((a) => a.split(" ").slice(0, 2).join(" "));
  cek("5e urutan: tanda tangan -> pengajuan; Cloudinary dipanggil sekali", urutan[0] === "POST /portal-siswa/api/lampiran/signature" && urutan.includes("POST /portal-siswa/api/pengajuan") && cloud.length === 1, JSON.stringify(urutan));
  cek("5f unggahan memuat signature, folder, allowed_formats", ["signature", "folder", "allowed_formats", "api_key", "timestamp"].every((k) => cloud[0].includes(`name="${k}"`)) && cloud[0].includes("si-absen/pengajuan"));
  const st = await state();
  cek("5g pengajuan tersimpan dengan URL lampiran folder pengajuan", st.store[0].lampiran === "https://res.cloudinary.com/demo-cloud/image/upload/v1/si-absen/pengajuan/surat.png" && st.store[0].jenis === "sakit");

  // 6. batas 3 menunggu
  await buka();
  await isi({ jenis: "izin", dari: "2026-11-20", alasan: "Keperluan keluarga", pin: "483920" });
  await kirim.click();
  await page.getByRole("status").filter({ hasText: "Pengajuan terkirim" }).waitFor();
  await page.getByText(/Masih ada 3 pengajuan menunggu/).waitFor();
  cek("6a tiga menunggu: tombol Ajukan nonaktif + penjelasan", await page.getByRole("button", { name: /Ajukan/ }).isDisabled());

  // 7. batal
  await page.getByRole("button", { name: "Batalkan pengajuan" }).first().click();
  await page.fill('input[id^="bt-pin-"]', "111111");
  await page.getByRole("button", { name: "Ya, batalkan" }).click();
  await page.getByText(/PIN salah/).first().waitFor();
  cek("7a0 batal dengan PIN salah: kolom PIN dikosongkan dan difokuskan", (await page.inputValue('input[id^="bt-pin-"]')) === "" && (await page.evaluate(() => document.activeElement.id.startsWith("bt-pin-"))));
  cek("7a batal dengan PIN salah ditolak, pengajuan tetap menunggu", (await state()).store.filter((x) => x.status === "menunggu").length === 3);
  await page.fill('input[id^="bt-pin-"]', "483920");
  await page.getByRole("button", { name: "Ya, batalkan" }).click();
  await page.getByRole("status").filter({ hasText: "Pengajuan dibatalkan" }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll('[data-status="dibatalkan"]').length === 1);
  cek("7b batal berhasil: kartu Dibatalkan, tombol Ajukan aktif lagi", await page.getByRole("button", { name: /Ajukan/ }).isEnabled());
  cek("7c hari pada pengajuan dibatalkan berlabel Dibatalkan", await page.locator('[data-status="dibatalkan"]').getByText("Dibatalkan").nth(1).isVisible().catch(() => false));

  // 8. ganti PIN
  await page.getByRole("button", { name: /Ganti PIN/ }).click();
  const gp = page.locator('form[aria-label="Ganti PIN"]');
  await page.fill("#gp-lama", "483920"); await page.fill("#gp-baru", "715204"); await page.fill("#gp-ulang", "715205");
  await gp.getByRole("button", { name: "Simpan PIN" }).click();
  cek("8a ulangi PIN tidak sama ditolak di klien", await page.getByText(/kedua isian tidak sama/).isVisible());
  await page.fill("#gp-baru", "111111"); await page.fill("#gp-ulang", "111111");
  await gp.getByRole("button", { name: "Simpan PIN" }).click();
  await page.getByText(/terlalu mudah/).waitFor();
  cek("8b PIN terlalu mudah ditolak server", true);
  await page.fill("#gp-baru", "715204"); await page.fill("#gp-ulang", "715204");
  await gp.getByRole("button", { name: "Simpan PIN" }).click();
  await page.getByRole("status").filter({ hasText: "PIN berhasil diganti" }).waitFor();
  cek("8c PIN diganti, form tertutup", (await page.locator('form[aria-label="Ganti PIN"]').count()) === 0);
  await buka();
  await isi({ jenis: "izin", dari: "2026-11-21", alasan: "Keperluan lain", pin: "483920" });
  await kirim.click();
  await page.getByText("PIN salah. Sisa percobaan: 4.").waitFor();
  cek("8d PIN lama tidak berlaku lagi", true);
  await page.fill("#aj-pin", "715204");
  await kirim.click();
  await page.getByRole("status").filter({ hasText: "Pengajuan terkirim" }).waitFor();
  cek("8e PIN baru berlaku", true);

  // 9. penguncian setelah 5 salah
  await setState({ gagal: 0, kunciSampai: null });
  await muat();
  while ((await state()).store.filter((x) => x.status === "menunggu").length >= 3) { // beri ruang untuk satu pengajuan lagi
    await page.getByRole("button", { name: "Batalkan pengajuan" }).first().click();
    await page.fill('input[id^="bt-pin-"]', "715204");
    await page.getByRole("button", { name: "Ya, batalkan" }).click();
    await page.waitForFunction((n) => document.querySelectorAll('[data-status="menunggu"]').length < n, 3);
  }
  await buka();
  await isi({ jenis: "izin", dari: "2026-11-24", alasan: "Keperluan lain", pin: "000000" });
  for (let i = 0; i < 5; i++) { await kirim.click(); await page.getByRole("alert").filter({ hasText: /PIN salah|Terlalu banyak/ }).waitFor(); await page.fill("#aj-pin", "000000"); }
  cek("9a percobaan ke-5: pesan terkunci dengan jam WIB", await page.getByText(/Terlalu banyak PIN salah\. Coba lagi setelah pukul \d\d:\d\d WIB/).isVisible());
  await muat();
  cek("9b setelah muat ulang: tombol Ajukan nonaktif + alasan terkunci", await page.getByRole("button", { name: /Ajukan/ }).isDisabled() && await page.getByText(/bisa dicoba lagi setelah pukul/i).isVisible());
  cek("9c membatalkan juga tidak ditawarkan saat terkunci", (await page.getByRole("button", { name: "Batalkan pengajuan" }).count()) === 0);

  // 10. PIN belum dibuat
  await setState({ pinAda: false, kunciSampai: null });
  await muat();
  cek("10a PIN belum dibuat: Ajukan nonaktif, petunjuk ke wali kelas, tanpa Ganti PIN", await page.getByRole("button", { name: /Ajukan/ }).isDisabled() && await page.getByText(/PIN belum dibuat/).isVisible() && (await page.getByRole("button", { name: /Ganti PIN/ }).count()) === 0);
  await page.screenshot({ path: SP + "/s10-pin-belum.png", fullPage: true });
  await setState({ pinAda: true });

  // 11. responsif: tanpa scroll horizontal pada 360px dengan form terbuka
  await page.setViewportSize({ width: 360, height: 740 });
  await muat();
  await setState({ gagal: 0, kunciSampai: null });
  const adaRuang = await page.getByRole("button", { name: /Ajukan/ }).isEnabled();
  if (adaRuang) { await buka(); await isi({ jenis: "sakit" }); }
  const lebar = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  cek("11a tidak ada scroll horizontal pada 360px", lebar.sw <= lebar.iw, JSON.stringify(lebar));
  await page.screenshot({ path: SP + "/s11-360.png", fullPage: true });

  // 12. sesi habis
  await ctx.clearCookies();
  if (adaRuang) {
    await isi({ dari: "2026-11-25", sampai: "2026-11-26", alasan: "Sakit ringan", pin: "715204" });
    await kirim.click();
    await page.getByText(/Sesi berakhir/).waitFor();
    cek("12 sesi habis: pesan jelas, tanpa crash", true);
  }
  cek("13 tidak ada galat konsol/halaman", errs.length === 0, errs.join(" | ").slice(0, 400));
  await browser.close();
  const gagal = hasil.filter((x) => !x).length;
  console.log(`\n${hasil.length - gagal}/${hasil.length} lolos`);
  process.exit(gagal ? 1 : 0);
})().catch((e) => { console.error("SKRIP ERROR:", e.message.split("\n").slice(0, 6).join("\n")); process.exit(2); });
