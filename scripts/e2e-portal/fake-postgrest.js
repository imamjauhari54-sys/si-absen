// PostgREST tiruan minimal untuk uji e2e portal (hanya yang dibutuhkan dashboard + API pengajuan).
const http = require("http");
const PIN_BENAR = { v: "483920" };
const S = { gagal: 0, kunciSampai: null, pinAda: true, nextId: 100, log: [] };
const siswa = { id: 42, name: "Budi Santoso", class: "5", nisn: "0012345678", status: "aktif", jenis_kelamin: "L", foto: null };
const hariSekolah = (d1, d2) => { const out = []; for (let t = Date.parse(d1); t <= Date.parse(d2); t += 864e5) { const d = new Date(t); if (d.getUTCDay() !== 0) out.push(d.toISOString().slice(0, 10)); } return out; };
const store = [
  { id: 1, siswa_id: 42, jenis: "sakit", tanggal_dari: "2026-11-09", tanggal_sampai: "2026-11-10", alasan: "Demam", lampiran: null, status: "disetujui", diajukan_pada: "2026-11-08T01:00:00Z", diputuskan_nama: "Bu Sri", diputuskan_pada: "2026-11-08T03:00:00Z", catatan_keputusan: "Semoga lekas sembuh", pengajuan_izin_hari: [{ tanggal: "2026-11-09", disetujui: true, aktif: true, hasil: "ditulis" }, { tanggal: "2026-11-10", disetujui: true, aktif: true, hasil: "ditulis" }] },
  { id: 2, siswa_id: 42, jenis: "izin", tanggal_dari: "2026-11-11", tanggal_sampai: "2026-11-11", alasan: "Keperluan", lampiran: null, status: "ditolak", diajukan_pada: "2026-11-10T01:00:00Z", diputuskan_nama: "Bu Sri", diputuskan_pada: "2026-11-10T04:00:00Z", catatan_keputusan: "Mohon lampirkan surat", pengajuan_izin_hari: [{ tanggal: "2026-11-11", disetujui: false, aktif: true, hasil: "dialpha" }] },
];
function lock() { S.kunciSampai = new Date(Date.now() + 15 * 60000).toISOString(); }
function verifikasi(pin) {
  if (!S.pinAda) return { ok: false, kode: "PIN_BELUM_DIATUR" };
  if (S.kunciSampai && Date.parse(S.kunciSampai) > Date.now()) return { ok: false, kode: "TERKUNCI", terkunci_sampai: S.kunciSampai };
  if (pin === PIN_BENAR.v) { S.gagal = 0; return { ok: true }; }
  S.gagal++;
  if (S.gagal >= 5) { lock(); return { ok: false, kode: "TERKUNCI", menit: 15, terkunci_sampai: S.kunciSampai }; }
  return { ok: false, kode: "PIN_SALAH", sisa_percobaan: 5 - S.gagal };
}
function send(res, code, body) { res.writeHead(code, { "content-type": "application/json", "content-range": "0-0/*" }); res.end(JSON.stringify(body)); }
http.createServer((req, res) => {
  let raw = ""; req.on("data", (c) => (raw += c)); req.on("end", () => {
    const u = new URL(req.url, "http://x"); const p = u.pathname.replace("/rest/v1/", "");
    const single = /pgrst\.object/.test(req.headers.accept || "");
    const body = raw ? JSON.parse(raw) : {};
    S.log.push(`${req.method} ${p}`);
    if (p === "__state") { if (req.method === "POST") { Object.assign(S, body); return send(res, 200, S); } return send(res, 200, { ...S, store }); }
    if (p.startsWith("rpc/")) {
      const fn = p.slice(4);
      if (fn === "verifikasi_pin_ortu") return send(res, 200, verifikasi(body.p_pin));
      if (fn === "ajukan_pengajuan_izin") {
        if ((body.p_alasan || "").trim().length < 5) return send(res, 400, { code: "P0001", message: "Alasan minimal 5 karakter." });
        const menunggu = store.filter((x) => x.status === "menunggu").length;
        if (menunggu >= 3) return send(res, 400, { code: "P0001", message: "Masih ada 3 pengajuan yang menunggu persetujuan. Tunggu hingga diputuskan atau batalkan salah satunya." });
        const hs = hariSekolah(body.p_dari, body.p_sampai);
        if (body.p_jenis === "sakit" && hs.length > 2 && !body.p_lampiran) return send(res, 400, { code: "P0001", message: "Lampiran (foto surat dokter) wajib untuk sakit lebih dari 2 hari." });
        const row = { id: ++S.nextId, siswa_id: 42, jenis: body.p_jenis, tanggal_dari: body.p_dari, tanggal_sampai: body.p_sampai, alasan: body.p_alasan, lampiran: body.p_lampiran, status: "menunggu", diajukan_pada: new Date().toISOString(), diputuskan_nama: null, diputuskan_pada: null, catatan_keputusan: null, pengajuan_izin_hari: hs.map((t) => ({ tanggal: t, disetujui: null, aktif: true, hasil: null })) };
        store.unshift(row); return send(res, 200, { id: row.id, jenis: row.jenis, hari_sekolah: hs });
      }
      if (fn === "batalkan_pengajuan_izin") {
        const r = store.find((x) => x.id === body.p_id && x.siswa_id === body.p_siswa_id);
        if (!r) return send(res, 400, { code: "P0001", message: "Pengajuan tidak ditemukan." });
        if (r.status !== "menunggu") return send(res, 400, { code: "P0001", message: "Pengajuan sudah diputuskan, tidak dapat dibatalkan." });
        r.status = "dibatalkan"; r.pengajuan_izin_hari.forEach((h) => (h.aktif = false)); return send(res, 200, { status: "dibatalkan", hari_alpha: 0 });
      }
      if (fn === "atur_pin_ortu") {
        const v = verifikasi(body.p_pin_lama); if (!v.ok) return send(res, 200, v);
        if (/^(\d)\1{5}$/.test(body.p_pin_baru) || body.p_pin_baru === "123456") return send(res, 200, { ok: false, kode: "PIN_TERLALU_MUDAH" });
        PIN_BENAR.v = body.p_pin_baru; return send(res, 200, { ok: true });
      }
      return send(res, 200, null);
    }
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 200, []);
    const one = (o) => (single ? (o ? send(res, 200, o) : send(res, 406, { code: "PGRST116", message: "no rows", details: "", hint: null })) : send(res, 200, o ? [o] : []));
    if (p === "students") return one(siswa);
    if (p === "absensi_setting") return one({ tapel: "2026/2027", semester: "ganjil" });
    if (p === "kunci_ortu") return one(S.pinAda ? { terkunci_sampai: S.kunciSampai } : null);
    if (p === "pengajuan_izin") return single ? send(res, 406, { code: "PGRST116" }) : send(res, 200, store.filter((x) => x.siswa_id === 42).sort((a, b) => (a.diajukan_pada < b.diajukan_pada ? 1 : -1)));
    return single ? send(res, 406, { code: "PGRST116", message: "no rows", details: "", hint: null }) : send(res, 200, []);
  });
}).listen(54321, "127.0.0.1", () => console.log("fake postgrest :54321"));
