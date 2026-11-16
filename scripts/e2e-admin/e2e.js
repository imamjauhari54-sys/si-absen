const { chromium } = require("playwright");
const fs = require("fs");
const SP = process.argv[2];
const B = "http://127.0.0.1:3055", FAKE = "http://127.0.0.1:54321/rest/v1/__state";
const [cAdmin, cGuru] = [fs.readFileSync(SP + "/admin.txt", "utf8").trim(), fs.readFileSync(SP + "/guru.txt", "utf8").trim()];
const hasil = [];
const cek = (nama, ok, info = "") => { hasil.push(ok); console.log((ok ? "OK    : " : "GAGAL : ") + nama + (ok ? "" : "   -> " + info)); };
const state = async () => (await fetch(FAKE)).json();
const rpcs = async (fn) => (await state()).rpc.filter((r) => r.fn === fn);

async function sesi(browser, cookie, lebar = 1100) {
  const ctx = await browser.newContext({ viewport: { width: lebar, height: 900 } });
  await ctx.addCookies([{ name: "si_absen_session", value: cookie, url: B }]);
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|fonts|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  page.on("pageerror", (e) => errs.push("PAGEERROR " + e.message));
  return { ctx, page, errs };
}

(async () => {
  const browser = await chromium.launch();
  const { page, errs } = await sesi(browser, cAdmin);

  // 1. Daftar
  await page.goto(B + "/pengajuan");
  await page.locator('[data-testid="daftar-pengajuan"]').waitFor();
  cek("1a daftar Menunggu: 3 pengajuan (admin lihat semua kelas)", (await page.locator('[data-testid="daftar-pengajuan"] li').count()) === 3);
  cek("1b menu sidebar memuat Pengajuan Izin & PIN Orang Tua", (await page.getByRole("link", { name: "Pengajuan Izin" }).count()) > 0 && (await page.getByRole("link", { name: "PIN Orang Tua" }).count()) > 0);

  cek("1c penanda menu admin = 3 pengajuan menunggu", (await page.locator('[data-testid="penanda-pengajuan"]').first().innerText()).trim() === "3");

  // 2. Detail + setujui sebagian
  await page.goto(B + "/pengajuan/10");
  await page.locator('[data-testid="form-keputusan"]').waitFor();
  const alasan = await page.locator('[data-testid="alasan"]').innerText();
  cek("2a alasan tampil sebagai TEKS (HTML tidak dieksekusi)", alasan.includes("<b>dua</b>") && (await page.locator('[data-testid="alasan"] b').count()) === 0, alasan);
  cek("2b lampiran https dibuka di tab baru dengan noopener", (await page.locator('a[href*="cloudinary"][rel="noopener noreferrer"][target=_blank]').count()) === 1);
  cek("2c pratinjau 3 hari", (await page.locator('[data-testid="pratinjau-hari"] li').count()) === 3);
  cek("2d hari yang sudah hadir dijelaskan tidak diubah", (await page.locator('li[data-tanggal="2026-11-11"]').innerText()).includes("Hadir"));
  await page.getByRole("radio", { name: /Setujui sebagian/ }).click();
  await page.getByLabel(/Setujui .*12 Nov/).uncheck();
  const ring = await page.locator('[data-testid="ringkasan-akibat"]').innerText();
  cek("2e ringkasan akibat berubah (2 disetujui)", /2 hari disetujui/.test(ring), ring);
  await page.fill("#catatan-keputusan", "Mohon surat dokter menyusul");
  await page.getByRole("button", { name: /Simpan persetujuan sebagian/ }).click();
  await page.waitForURL(/\/pengajuan\?selesai=/);
  cek("2f kembali ke daftar dengan pesan sukses", (await page.locator('div[role=status]').innerText()).includes("disetujui"));
  const r1 = (await rpcs("putuskan_pengajuan_izin"))[0]?.body;
  cek("2g RPC menerima hari terpilih saja + identitas editor dari sesi", r1 && JSON.stringify(r1.p_hari) === JSON.stringify(["2026-11-10", "2026-11-11"]) && r1.p_keputusan === "setujui", JSON.stringify(r1));
  cek("2h editor dari sesi (bukan dari body)", r1 && r1.p_editor_id === 1, JSON.stringify(r1));
  cek("2i daftar Menunggu kini 2", (await page.locator('[data-testid="daftar-pengajuan"] li').count()) === 2);

  // WA keputusan (dikirim di after(), jadi tunggu sebentar)
  const tungguWa = async (n) => { for (let i = 0; i < 40 && (await state()).wa.length < n; i++) await new Promise((r) => setTimeout(r, 150)); return (await state()).wa; };
  const wa1 = await tungguWa(1);
  cek("2j orang tua mendapat 1 WA dengan nomor, kunci gateway, dan isi keputusan sebagian", wa1.length === 1 && wa1[0].target === "6281234567890" && wa1[0].auth === "TOKEN-UJI" && /DISETUJUI SEBAGIAN/.test(wa1[0].message) && /Budi Santoso/.test(wa1[0].message), JSON.stringify(wa1));
  cek("2k WA memuat tanggal disetujui, catatan wali kelas, dan nama sekolah", /Disetujui: .*10 Nov 2026, .*11 Nov 2026\./.test(wa1[0].message) && /Tidak disetujui: .*12 Nov 2026\./.test(wa1[0].message) && /Catatan wali kelas: Mohon surat dokter menyusul/.test(wa1[0].message) && /SDN Contoh 2/.test(wa1[0].message), wa1[0].message);
  cek("2l PRIVASI: alasan pengajuan & URL lampiran TIDAK ada di WA", !/Demam|<b>|cloudinary|surat\.png/.test(wa1[0].message), wa1[0].message);
  cek("2m percobaan tercatat di wa_log (tipe keputusan, terkirim)", (await state()).walog.some((l) => l.tipe === "keputusan" && l.status === "terkirim" && l.siswa_id === 42));

  // 3. Detail yang sudah diputuskan: tanpa form
  await page.goto(B + "/pengajuan/10");
  await page.locator('[data-testid="keputusan-final"]').waitFor();
  cek("3a pengajuan terputus tampil read-only", (await page.locator('[data-testid="form-keputusan"]').count()) === 0 && (await page.locator('[data-testid="status-pengajuan"]').innerText()).includes("sebagian"));

  // 4. Tolak
  await page.goto(B + "/pengajuan/11");
  await page.getByRole("radio", { name: "Tolak" }).click();
  await page.getByRole("button", { name: "Tolak pengajuan" }).click();
  await page.waitForURL(/\/pengajuan\?selesai=/);
  const r2 = (await rpcs("putuskan_pengajuan_izin"))[1]?.body;
  cek("4a tolak: tanpa daftar hari", r2 && r2.p_id === 11 && (r2.p_hari === null || r2.p_hari === undefined), JSON.stringify(r2));

  const wa2 = await tungguWa(2);
  cek("4b tolak: WA kedua ke orang tua Ani berisi TIDAK DISETUJUI", wa2.length === 2 && wa2[1].target === "6281298765432" && /TIDAK DISETUJUI/.test(wa2[1].message), JSON.stringify(wa2[1]));
  await page.goto(B + "/pengajuan");
  cek("4c penanda menu admin turun jadi 1 setelah dua keputusan (cache disegarkan)", (await page.locator('[data-testid="penanda-pengajuan"]').first().innerText()).trim() === "1");

  // 5. Sebagian tanpa pilihan: ditahan di klien
  await page.goto(B + "/pengajuan/12");
  await page.getByRole("radio", { name: /Setujui sebagian/ }).click();
  await page.getByLabel(/Setujui .*12 Nov/).uncheck();
  const sebelum = (await rpcs("putuskan_pengajuan_izin")).length;
  await page.getByRole("button", { name: /Simpan persetujuan sebagian/ }).click();
  cek("5a tanpa hari dipilih: pesan galat, tidak ada permintaan ke server", (await page.locator('[data-testid="form-keputusan"] [role=alert]').innerText()).includes("minimal satu hari") && (await rpcs("putuskan_pengajuan_izin")).length === sebelum);

  // 6. ID aneh / tidak ada
  for (const x of ["999", "abc", "10%27"]) {
    await page.goto(B + "/pengajuan/" + x);
    // loading.tsx membuat status HTTP sudah 200 saat streaming; yang dijaga: tampil halaman "tidak ditemukan", tanpa data.
    const t = await page.locator("body").innerText();
    cek(`6 /pengajuan/${x} -> halaman tidak ditemukan, tanpa data`, /could not be found/i.test(t) && !/Budi|Ani|Alasan/.test(t), t.slice(0, 80));
  }

  // 7. PIN
  await page.goto(B + "/pin-ortu?kelas=5");
  await page.locator('[data-testid="tabel-pin"]').waitFor();
  cek("7a tabel 3 siswa kelas 5, tanpa PIN polos", (await page.locator('[data-testid="tabel-pin"] tbody tr').count()) === 3 && !(await page.content()).match(/\b48\d 9\d\d\b/));
  await page.getByRole("button", { name: /Buat PIN untuk yang belum punya \(2\)/ }).click();
  await page.locator('[data-testid="panel-pin-baru"]').waitFor();
  const tabel = await page.locator('[data-testid="tabel-pin"]').innerText();
  cek("7b PIN baru tampil terformat 3+3 untuk 2 siswa", /482 910/.test(tabel) && /482 917/.test(tabel), tabel);
  cek("7c siswa yang sudah punya PIN tidak ikut dibuat ulang", (await rpcs("buat_pin_acak_ortu"))[0].body.p_siswa_ids.sort().join() === "43,44");
  await page.emulateMedia({ media: "print" });
  cek("7d mode cetak: 2 slip, panel kontrol tersembunyi", (await page.locator(".slip:visible").count()) === 2 && (await page.locator('[data-testid="panel-pin-baru"]').isHidden()));
  const slip = await page.locator(".slip").first().innerText();
  cek("7e slip memuat nama, kelas, PIN", /Ani Lestari/.test(slip) && /Kelas 5/.test(slip) && /\d{3} \d{3}/.test(slip), slip);
  await page.pdf({ path: SP + "/slip.pdf", format: "A4" });
  await page.emulateMedia({ media: "screen" });
  await page.getByLabel("Pilih Ani Lestari").check();
  await page.getByRole("button", { name: /Tandai sudah dibagikan \(1\)/ }).click();
  await page.locator('div[role=status]').waitFor();
  const tb = (await rpcs("tandai_pin_dibagikan"))[0]?.body;
  cek("7f tandai dibagikan mengirim id terpilih; PIN polos siswa itu dibuang dari layar", tb && tb.p_siswa_ids.join() === "43" && !(await page.locator('[data-testid="tabel-pin"]').innerText()).includes("482 910"));
  await page.reload();
  await page.locator('[data-testid="tabel-pin"]').waitFor();
  cek("7g muat ulang: PIN polos hilang selamanya", !/\d{3} \d{3}/.test(await page.locator('[data-testid="tabel-pin"]').innerText()));
  cek("7h PIN polos tidak pernah masuk ke log permintaan DB selain RPC pembuatnya", !(await state()).log.some((l) => /48291/.test(l)));
  cek("7i admin tanpa memilih kelas: diminta memilih", (await (async () => { await page.goto(B + "/pin-ortu"); return page.getByText("Pilih kelas terlebih dahulu.").count(); })()) === 1);

  // 8. Tanpa horizontal scroll di HP
  const hp = await sesi(browser, cAdmin, 360);
  for (const u of ["/pengajuan", "/pengajuan/12", "/pin-ortu?kelas=5"]) {
    await hp.page.goto(B + u); await hp.page.waitForLoadState("networkidle");
    cek(`8 ${u} 360px tanpa scroll horizontal`, (await hp.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)));
    await hp.page.screenshot({ path: SP + "/hp-" + u.replace(/\W+/g, "_") + ".png" });
  }

  // 9. Guru kelas 6 (wali) tidak bisa melihat pengajuan kelas 5
  const g = await sesi(browser, cGuru);
  await g.page.goto(B + "/pengajuan");
  await g.page.locator('[data-testid="daftar-pengajuan"]').waitFor();
  const baris = await g.page.locator('[data-testid="daftar-pengajuan"] li').allInnerTexts();
  cek("9z penanda menu wali kelas 6 = 1 (hanya kelasnya)", (await g.page.locator('[data-testid="penanda-pengajuan"]').first().innerText()).trim() === "1");
  cek("9a guru kelas 6 hanya melihat pengajuan kelasnya", baris.length === 1 && baris[0].includes("Dimas Lain"), JSON.stringify(baris));
  cek("9b query ?kelas=5 diabaikan untuk guru", await (async () => { await g.page.goto(B + "/pengajuan?kelas=5"); return (await g.page.locator('[data-testid="daftar-pengajuan"] li').count()) === 1; })());
  await g.page.goto(B + "/pengajuan/11");
  const t9 = await g.page.locator("body").innerText();
  cek("9c guru membuka pengajuan kelas lain -> tampil sama dengan 'tidak ada', tanpa data siswa", /could not be found/i.test(t9) && !/Ani Lestari|Acara keluarga/.test(t9), t9.slice(0, 80));
  const x = await g.page.evaluate(async () => { const r = await fetch("/api/pengajuan/11/putuskan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keputusan: "tolak" }) }); return r.status; });
  cek("9d guru memutuskan pengajuan kelas lain lewat API -> 403", x === 403, String(x));
  await g.page.goto(B + "/pin-ortu?kelas=5");
  cek("9e guru: kelas PIN selalu kelas wali (?kelas=5 diabaikan)", (await g.page.locator('[data-testid="tabel-pin"] tbody tr').count()) === 1);

  cek("9y tidak ada WA lain yang bocor (guru/validasi gagal tidak mengirim)", (await state()).wa.length === 2);

  // 10. Tanpa sesi
  const anon = await browser.newContext();
  const ap = await anon.newPage();
  await ap.goto(B + "/pengajuan");
  cek("10 tanpa sesi -> /login", /\/login/.test(ap.url()), ap.url());

  cek("11 tanpa galat konsol/halaman", errs.length === 0 && hp.errs.length === 0 && g.errs.length === 0, JSON.stringify([...errs, ...hp.errs, ...g.errs]));
  await browser.close();
  const gagal = hasil.filter((x) => !x).length;
  console.log(`\n${hasil.length - gagal}/${hasil.length} lulus`);
  process.exit(gagal ? 1 : 0);
})();
