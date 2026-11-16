// PostgREST tiruan untuk e2e halaman persetujuan + PIN (admin/wali kelas). Data di memori.
const http = require("http");
const S = { log: [], rpc: [], pinPolos: {}, wa: [], walog: [] };
const SETTINGS = { wa_enabled: "true", wa_gateway_url: "http://127.0.0.1:54399/send", wa_api_key: "TOKEN-UJI", nama_sekolah: "SDN Contoh 2" };
const siswa = [
  { id: 42, name: "Budi Santoso", class: "5", nisn: "0012345678", status: "aktif", no_hp_ortu: "081234567890" },
  { id: 43, name: "Ani Lestari", class: "5", nisn: "0012345679", status: "aktif", no_hp_ortu: "081298765432" },
  { id: 44, name: "Citra Dewi", class: "5", nisn: "0012345680", status: "aktif" },
  { id: 90, name: "Dimas Lain", class: "6", nisn: "0012345690", status: "aktif" },
];
const H = (t, d) => ({ tanggal: t, disetujui: null, aktif: true, hasil: null });
const mk = (id, sid, jenis, hari, alasan, status = "menunggu") => ({
  id, siswa_id: sid, jenis, tanggal_dari: hari[0], tanggal_sampai: hari[hari.length - 1], alasan, lampiran: id === 10 ? "https://res.cloudinary.com/demo-cloud/image/upload/v1/surat.png" : null,
  status, diajukan_pada: `2026-11-1${id % 10}T01:00:00Z`, diputuskan_nama: null, diputuskan_pada: null, catatan_keputusan: null, pengajuan_izin_hari: hari.map(H),
});
const store = [
  mk(10, 42, "sakit", ["2026-11-10", "2026-11-11", "2026-11-12"], "Demam tinggi <b>dua</b> hari"),
  mk(11, 43, "izin", ["2026-11-12"], "Acara keluarga di luar kota"),
  mk(12, 90, "izin", ["2026-11-12"], "Pengajuan kelas lain"),
];
const kunci = { 42: { pin_hash: "h", dibagikan_pada: "2026-11-01T00:00:00Z", terkunci_sampai: null } };
const absensi = [{ siswa_id: 42, tanggal: "2026-11-11", status: "hadir" }];
const embed = (r) => ({ ...r, students: siswa.find((s) => s.id === r.siswa_id) });
function send(res, code, body, total) { res.writeHead(code, { "content-type": "application/json", "content-range": total === undefined ? "0-0/*" : `0-${Math.max(0, total - 1)}/${total}` }); res.end(JSON.stringify(body)); }
http.createServer((req, res) => {
  let raw = ""; req.on("data", (c) => (raw += c)); req.on("end", () => {
    const u = new URL(req.url, "http://x"); const p = u.pathname.replace("/rest/v1/", ""); const q = u.searchParams;
    const single = /pgrst\.object/.test(req.headers.accept || "");
    const body = raw ? JSON.parse(raw) : {};
    S.log.push(`${req.method} ${p}?${u.searchParams.toString()}`);
    if (p === "__state") { return send(res, 200, { ...S, store, kunci }); }
    if (p.startsWith("rpc/")) {
      const fn = p.slice(4); S.rpc.push({ fn, body });
      if (fn === "putuskan_pengajuan_izin") {
        const r = store.find((x) => x.id === body.p_id);
        if (!r || r.status !== "menunggu") return send(res, 400, { code: "P0001", message: "Pengajuan sudah diputuskan." });
        if (body.p_keputusan === "tolak") { r.status = "ditolak"; r.pengajuan_izin_hari.forEach((h) => (h.disetujui = false)); r.catatan_keputusan = body.p_catatan; return send(res, 200, { status: "ditolak", hari_alpha: 2 }); }
        const semua = r.pengajuan_izin_hari.map((h) => h.tanggal); const set = body.p_hari || semua;
        r.pengajuan_izin_hari.forEach((h) => (h.disetujui = set.includes(h.tanggal)));
        r.status = set.length === semua.length ? "disetujui" : "disetujui_sebagian"; r.diputuskan_nama = body.p_editor_nama; r.catatan_keputusan = body.p_catatan;
        return send(res, 200, { status: r.status, disetujui: set.length, ditulis: 1, hari_alpha: 0 });
      }
      if (fn === "buat_pin_acak_ortu") {
        const out = body.p_siswa_ids.map((id, i) => { const pin = String(482910 + i * 7); S.pinPolos[id] = pin; kunci[id] = { pin_hash: "h", dibagikan_pada: null, terkunci_sampai: null }; return { siswa_id: id, pin }; });
        return send(res, 200, out);
      }
      if (fn === "tandai_pin_dibagikan") { body.p_siswa_ids.forEach((id) => kunci[id] && (kunci[id].dibagikan_pada = new Date().toISOString())); return send(res, 200, body.p_siswa_ids.length); }
      return send(res, 200, null);
    }
    if (req.method === "POST" && p === "wa_log") S.walog.push(body);
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 200, []);
    const none = () => send(res, single ? 406 : 200, single ? { code: "PGRST116", message: "no rows", details: "", hint: null } : []);
    const one = (o) => (single ? (o ? send(res, 200, o) : none()) : send(res, 200, o ? [o] : []));
    if (p === "settings") { const k = (q.get("key") || "").replace("eq.", ""); return one(k in SETTINGS ? { value: SETTINGS[k] } : null); }
    if (p === "users") return one({ id: 1, must_change_password: false });
    if (p === "guru_mengajar_kelas") return one({ class: process.env.KELAS_GURU || "6" });
    if (p === "kelas_master") return send(res, 200, [{ id: 1, nama: "5" }, { id: 2, nama: "6" }]);
    if (p === "pengajuan_izin") {
      const idEq = (q.get("id") || "").replace("eq.", "");
      if (idEq) return one(store.find((x) => String(x.id) === idEq) && embed(store.find((x) => String(x.id) === idEq)));
      let rows = store.map(embed);
      if (q.get("status") === "eq.menunggu") rows = rows.filter((r) => r.status === "menunggu");
      const k = q.get("students.class"); if (k) rows = rows.filter((r) => `eq.${r.students.class}` === k);
      return send(res, 200, rows, rows.length);
    }
    if (p === "absensi") return send(res, 200, absensi.filter((a) => a.siswa_id === 42));
    if (p === "students") {
      const idIn = q.get("id"); let rows = siswa;
      if (idIn && idIn.startsWith("in.")) rows = rows.filter((s) => idIn.slice(4, -1).split(",").includes(String(s.id)));
      else if (idIn && idIn.startsWith("eq.")) rows = rows.filter((s) => `eq.${s.id}` === idIn);
      if (q.get("class")) rows = rows.filter((s) => `eq.${s.class}` === q.get("class"));
      return single ? one(rows[0]) : send(res, 200, rows);
    }
    if (p === "kunci_ortu") return send(res, 200, Object.entries(kunci).map(([id, v]) => ({ siswa_id: Number(id), ...v })));
    return none();
  });
}).listen(54321, "127.0.0.1", () => console.log("fake postgrest admin :54321"));

// Gateway WA tiruan: menampung pesan yang dikirim aplikasi.
http.createServer((req, res) => {
  let raw = ""; req.on("data", (c) => (raw += c)); req.on("end", () => {
    S.wa.push({ auth: req.headers.authorization, ...JSON.parse(raw || "{}") });
    res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ status: true }));
  });
}).listen(54399, "127.0.0.1", () => console.log("gateway WA tiruan :54399"));
