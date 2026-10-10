import { after, NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAbsensiSetting } from "@/lib/data/dashboard";
import { registerScanner, bumpScannerStats } from "@/lib/data/scanner";
import { kirimNotifAbsen } from "@/lib/wa/notifikasi";
import { nowJakarta, hms, jamTitikFormat, addMinutes } from "@/lib/utils/jam";
import { getKelasWali } from "@/lib/data/wali-kelas";
import {
  KETERANGAN_ALPHA_SISTEM,
  bolehScanSiswa,
  rencanaKoreksiMasuk,
  tentukanStatusMasuk,
  validasiScanId,
  validasiWaktuScanOffline,
} from "@/lib/utils/absen-scan";

const TOKEN_RE = /^SIELISA:([a-f0-9]{32,})$/i;

/** Penolakan karena input/aturan bisnis (permanen, tidak perlu dicoba ulang). */
class ErrorBisnis extends Error {}

export async function POST(req: NextRequest) {
  const session = await getSession();
  // Admin: semua kelas. Guru: hanya siswa kelas yang diampunya (dicek di server, lihat bolehScanSiswa).
  if (!session || (session.role !== "admin" && session.role !== "guru")) {
    return NextResponse.json({ status: "error", message: "Unauthorized" }, { status: 403 });
  }

  const form = await req.formData();
  const isManual = !!form.get("manual");
  const scannerId = String(form.get("scanner_id") || "unknown").trim();
  const offlineQueueCount = Math.max(0, parseInt(String(form.get("offline_queue_count") || "0"), 10) || 0);

  // Identitas item antrean offline (UUID dari perangkat). Opsional, tapi kalau ada harus valid.
  const idScan = validasiScanId(String(form.get("scan_id") || ""));
  if (!idScan.ok) {
    return NextResponse.json({ status: "error", message: idScan.message }, { status: 400 });
  }
  const scanId = idScan.scanId;

  // Waktu scan: default = sekarang. Scan dari antrean offline mengirim scan_at (waktu scan asli) +
  // device_now (jam perangkat saat dikirim) supaya jam masuk, status terlambat, dan tanggalnya benar —
  // bukan waktu ketika perangkat kembali online — dan jam perangkat yang salah ikut dikoreksi.
  let waktuScan: Date | null = null;
  const scanAtRaw = String(form.get("scan_at") || "").trim();
  if (scanAtRaw) {
    const v = validasiWaktuScanOffline({
      scanAtRaw,
      deviceNowRaw: String(form.get("device_now") || "").trim(),
      serverNowMs: Date.now(),
    });
    if (!v.ok) {
      return NextResponse.json({ status: "error", message: v.message }, { status: 400 });
    }
    waktuScan = v.waktu;
  }
  const dariAntrean = waktuScan !== null;

  const now = nowJakarta(waktuScan ?? undefined);
  const tanggal = now.toISOString().slice(0, 10);
  const jamNow = hms(now);
  const jamFmt = jamTitikFormat(now);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const userAgent = (req.headers.get("user-agent") || "").slice(0, 255);
  // Dijalankan setelah respons (after) supaya tidak memperlambat scan, tapi TIDAK hilang:
  // pemanggilan tanpa await di serverless bisa dibekukan sebelum selesai.
  after(() => registerScanner(scannerId, userAgent, ip, offlineQueueCount));

  try {
    // Cek hari libur (Minggu atau tabel hari_libur)
    const dow = now.getUTCDay(); // 0 = Minggu
    if (dow === 0) {
      return NextResponse.json({ status: "error", message: "LIBUR: Hari Minggu" });
    }
    // Dua query ini saling bebas: jalankan bersamaan (hemat 1 round-trip ke DB).
    // Kelas wali dibaca dari DB (bukan JWT) dan hanya untuk role guru — ikut paralel, tanpa round-trip tambahan.
    const [{ data: libur }, setting, kelasWali] = await Promise.all([
      supabaseAdmin.from("hari_libur").select("keterangan").eq("tanggal", tanggal).maybeSingle(),
      getAbsensiSetting(),
      session.role === "guru" ? getKelasWali(session.userId) : Promise.resolve(null),
    ]);
    if (libur) {
      return NextResponse.json({ status: "error", message: `LIBUR: ${libur.keterangan}` });
    }
    if (session.role === "guru" && !kelasWali) {
      return NextResponse.json({ status: "error", message: "Akun Anda belum terdaftar sebagai wali kelas." });
    }

    const jamMasuk = setting.jam_masuk ?? "07:00:00";
    const batasTerlambat = setting.batas_terlambat ?? "07:15:00";
    const jamPulangMulai = setting.jam_pulang_mulai ?? "11:30:00";
    const tapel = setting.tapel ?? "2025/2026";
    const semester = setting.semester ?? "genap";
    const durasiKunciMenit = setting.durasi_kunci_menit ?? 120;
    const toleransiPagiMenit = setting.toleransi_pagi_menit ?? 60;

    // Master lock: sistem tutup N menit (dinamis, dari Pengaturan) setelah jam_pulang_mulai
    const batasAkhirSistem = addMinutes(jamPulangMulai, durasiKunciMenit);
    if (jamNow > batasAkhirSistem) {
      return NextResponse.json({
        status: "error",
        message: `Sistem Terkunci! Batas operasional berakhir jam ${batasAkhirSistem.slice(0, 5)}`,
      });
    }

    // Tentukan siswa
    let siswa: { id: number; name: string; class: string } | null = null;
    let sumberScan: string;

    if (isManual) {
      const siswaId = parseInt(String(form.get("siswa_id") || "0"), 10);
      if (!siswaId) throw new ErrorBisnis("ID siswa tidak valid");
      const { data } = await supabaseAdmin
        .from("students")
        .select("id, name, class")
        .eq("id", siswaId)
        .eq("status", "aktif")
        .maybeSingle();
      if (!data) throw new ErrorBisnis("Siswa tidak ditemukan");
      siswa = data;
      sumberScan = "manual_scanner";
    } else {
      const rawToken = String(form.get("token") || "").trim();
      if (!rawToken) throw new ErrorBisnis("Token kosong");
      const match = rawToken.match(TOKEN_RE);
      if (!match) throw new ErrorBisnis("Format QR tidak valid");
      const token = match[1];

      const { data } = await supabaseAdmin
        .from("absensi_qr_token")
        .select("siswa_id, students(id, name, class, status)")
        .eq("token", token)
        .maybeSingle();
      const s = data?.students ? (Array.isArray(data.students) ? data.students[0] : data.students) : null;
      if (!s) throw new ErrorBisnis("QR tidak dikenal atau siswa tidak ditemukan");
      if (s.status !== "aktif") throw new ErrorBisnis("Siswa sudah tidak aktif");
      siswa = s;
      sumberScan = "sistem_otomatis";
    }

    // Akses wali kelas: DITOLAK DI SERVER sebelum ada pembacaan/penulisan absensi apa pun.
    // Pesan sengaja tanpa nama siswa supaya data siswa kelas lain tidak bocor.
    if (!bolehScanSiswa(session.role, kelasWali, siswa.class)) {
      return NextResponse.json({ status: "error", message: "Siswa ini bukan kelas Anda." });
    }

    const siswaId = siswa.id;
    const jamBukaSistem = addMinutes(jamMasuk, -toleransiPagiMenit);

    // Anti-double-tap: 30 detik debounce berdasarkan log terakhir
    // Log terakhir & absen hari ini saling bebas -> satu round-trip.
    const [{ data: lastLog }, { data: absenHariIni }, { data: scanSudahDiproses }] = await Promise.all([
      supabaseAdmin
        .from("absensi_log")
        .select("created_at")
        .eq("siswa_id", siswaId)
        .eq("tanggal_absen", tanggal)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("absensi")
        .select("id, jam_masuk, jam_pulang, status, keterangan")
        .eq("siswa_id", siswaId)
        .eq("tanggal", tanggal)
        .maybeSingle(),
      // Item antrean yang sama tidak boleh menimbulkan efek dua kali (kirim ulang setelah balasan hilang, dst).
      scanId
        ? supabaseAdmin.from("absensi_log").select("id").eq("scan_id", scanId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    if (scanSudahDiproses) {
      return NextResponse.json({
        status: "sudah",
        nama: siswa.name,
        keterangan: "Scan offline ini sudah diproses sebelumnya.",
      });
    }

    // Debounce hanya untuk scan langsung. Scan dari antrean offline sudah dijaga scan_id + update bersyarat.
    if (lastLog && !dariAntrean) {
      const selisih = Math.floor((Date.now() - new Date(lastLog.created_at).getTime()) / 1000);
      if (selisih < 30) {
        return NextResponse.json({
          status: "ignore",
          nama: siswa.name,
          message: `Sabar, tunggu ${30 - selisih} detik lagi.`,
        });
      }
    }

    // KONDISI A: belum ada data -> absen masuk
    if (!absenHariIni) {
      if (jamNow < jamBukaSistem) {
        return NextResponse.json({
          status: "error",
          nama: siswa.name,
          message: `Terlalu Pagi! Scan dibuka jam ${jamBukaSistem.slice(0, 5)}`,
        });
      }
      if (jamNow >= jamPulangMulai) {
        return NextResponse.json({
          status: "error",
          nama: siswa.name,
          message: `Akses Ditolak! Sudah masuk waktu pulang (${jamPulangMulai.slice(0, 5)}). Anda dianggap tidak hadir.`,
        });
      }

      const status = tentukanStatusMasuk(jamNow, batasTerlambat);

      const { error: insErr } = await supabaseAdmin.from("absensi").insert({
        siswa_id: siswaId,
        tanggal,
        jam_masuk: jamNow,
        status,
        tapel,
        semester,
        scan_oleh: sumberScan,
        scanner_id: scannerId,
      });

      if (insErr) {
        // 23505 = unique_violation. Ini kejadian race condition asli: dua
        // scan nyaris bersamaan sama-sama lolos cek "belum ada absen hari
        // ini" di atas, tapi cuma satu yang menang INSERT duluan — baris
        // constraint `absensi_siswa_tanggal_unique` di database yang
        // mencegah duplikatnya, bukan kode di sini. Kalau ini terjadi,
        // anggap saja sebagai "sudah absen" (karena memang sudah, oleh
        // scan yang menang), bukan error ke admin.
        if (insErr.code === "23505") {
          const { data: sudahAda } = await supabaseAdmin
            .from("absensi")
            .select("jam_masuk, status")
            .eq("siswa_id", siswaId)
            .eq("tanggal", tanggal)
            .maybeSingle();
          return NextResponse.json({
            status: "sudah",
            nama: siswa.name,
            keterangan: `Sudah tercatat ${sudahAda?.status ?? ""} · ${String(sudahAda?.jam_masuk ?? jamNow).slice(0, 5)}`,
          });
        }
        throw new Error("Gagal simpan absensi: " + insErr.message);
      }

      await supabaseAdmin.from("absensi_log").insert({
        admin_id: session.userId,
        siswa_id: siswaId,
        tanggal_absen: tanggal,
        status_lama: "proses",
        status_baru: status,
        keterangan: `Scan${dariAntrean ? " offline" : ""}: ${status.toUpperCase()}`,
        scanner_id: scannerId,
        scan_id: scanId,
      });
      const namaSiswa = siswa.name;
      const kelasSiswa = siswa.class;
      after(async () => {
        await bumpScannerStats(scannerId);
        await kirimNotifAbsen(siswaId, namaSiswa, kelasSiswa, status as "hadir" | "terlambat", jamNow);
      });

      return NextResponse.json({ status, nama: siswa.name, kelas: siswa.class, jam: jamFmt });
    }

    // KOREKSI "scan paling awal menang": scan offline yang baru tiba bisa lebih awal dari yang sudah
    // tercatat (scan online perangkat lain, atau alpha otomatis yang terlanjur jalan). Keputusan akhir
    // diambil ATOMIK di database (fungsi koreksi_absen_masuk: lock baris + cek ulang syarat), jadi dua
    // perangkat yang sinkron bersamaan tidak saling menimpa. Tidak mengirim WA koreksi; perubahan
    // dicatat di absensi_log dan tampil di Log Aktivitas.
    if (dariAntrean) {
      const rencana = rencanaKoreksiMasuk({ absen: absenHariIni, jamScan: jamNow, jamBuka: jamBukaSistem, jamPulangMulai, batasTerlambat });
      if (rencana.aksi === "koreksi") {
        const { data: hasil, error: koreksiErr } = await supabaseAdmin.rpc("koreksi_absen_masuk", {
          p_siswa_id: siswaId,
          p_tanggal: tanggal,
          p_jam: rencana.jamBaru,
          p_status_baru: rencana.statusBaru,
          p_ket_alpha_sistem: KETERANGAN_ALPHA_SISTEM,
          p_scanner_id: scannerId,
          p_scan_oleh: sumberScan,
          p_admin_id: session.userId,
          p_scan_id: scanId,
        });
        if (koreksiErr) throw new Error("Gagal koreksi absensi: " + koreksiErr.message);
        const baris = (Array.isArray(hasil) ? hasil[0] : hasil) as { dikoreksi?: boolean; status_lama?: string } | null;
        if (baris?.dikoreksi) {
          return NextResponse.json({
            status: "sudah",
            dikoreksi: true,
            nama: siswa.name,
            kelas: siswa.class,
            keterangan: `Dikoreksi: ${baris.status_lama ?? ""} → ${rencana.statusBaru} ${rencana.jamBaru.slice(0, 5)} (scan offline lebih awal)`,
          });
        }
      }
    }

    // KONDISI B: data sudah ada
    if (absenHariIni.jam_pulang) {
      return NextResponse.json({
        status: "sudah",
        nama: siswa.name,
        keterangan: `Selesai! Sudah absen pulang · ${String(absenHariIni.jam_pulang).slice(0, 5)}`,
      });
    }

    if (jamNow < jamPulangMulai) {
      const teksStatus = absenHariIni.status === "terlambat" ? "Terlambat" : "Hadir";
      return NextResponse.json({
        status: "sudah",
        nama: siswa.name,
        keterangan: `${teksStatus} masuk · ${String(absenHariIni.jam_masuk).slice(0, 5)} (Belum jam pulang)`,
      });
    }

    // KONDISI C: absen pulang
    // Bersyarat jam_pulang IS NULL: kalau dua perangkat memindai bersamaan, hanya satu yang
    // menang — yang lain tidak menggandakan log dan notifikasi WA.
    const { data: terupdate, error: updErr } = await supabaseAdmin
      .from("absensi")
      .update({ jam_pulang: jamNow })
      .eq("id", absenHariIni.id)
      .is("jam_pulang", null)
      .select("id");
    if (updErr) throw new Error("Gagal simpan absen pulang: " + updErr.message);
    if (!terupdate || terupdate.length === 0) {
      return NextResponse.json({
        status: "sudah",
        nama: siswa.name,
        keterangan: "Selesai! Sudah absen pulang",
      });
    }

    await supabaseAdmin.from("absensi_log").insert({
      admin_id: session.userId,
      siswa_id: siswaId,
      tanggal_absen: tanggal,
      status_lama: absenHariIni.status,
      status_baru: "pulang",
      keterangan: `Scan${dariAntrean ? " offline" : ""}: PULANG`,
      scanner_id: scannerId,
      scan_id: scanId,
    });
    const namaSiswa = siswa.name;
    const kelasSiswa = siswa.class;
    after(async () => {
      await bumpScannerStats(scannerId);
      await kirimNotifAbsen(siswaId, namaSiswa, kelasSiswa, "pulang", jamNow);
    });

    return NextResponse.json({ status: "pulang", nama: siswa.name, kelas: siswa.class, jam: jamFmt });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Terjadi kesalahan";
    if (e instanceof ErrorBisnis) {
      // Penolakan permanen (QR tidak dikenal, siswa nonaktif, dst): tidak perlu dicoba ulang.
      return NextResponse.json({ status: "error", message }, { status: 400 });
    }
    // Kegagalan sementara (DB/jaringan): 500 + retry, supaya klien menyimpan di antrean
    // dan mencoba lagi, bukan menganggap scan ini selesai.
    return NextResponse.json({ status: "error", message, retry: true }, { status: 500 });
  }
}
