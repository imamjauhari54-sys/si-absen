import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAbsensiSetting } from "@/lib/data/dashboard";
import { registerScanner, bumpScannerStats } from "@/lib/data/scanner";
import { kirimNotifAbsen } from "@/lib/wa/notifikasi";
import { nowJakarta, hms, jamTitikFormat, addMinutes } from "@/lib/utils/jam";

const TOKEN_RE = /^SIELISA:([a-f0-9]{32,})$/i;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ status: "error", message: "Unauthorized" }, { status: 403 });
  }

  const form = await req.formData();
  const isManual = !!form.get("manual");
  const scannerId = String(form.get("scanner_id") || "unknown").trim();
  const offlineQueueCount = Math.max(0, parseInt(String(form.get("offline_queue_count") || "0"), 10) || 0);

  const now = nowJakarta();
  const tanggal = now.toISOString().slice(0, 10);
  const jamNow = hms(now);
  const jamFmt = jamTitikFormat(now);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const userAgent = (req.headers.get("user-agent") || "").slice(0, 255);
  registerScanner(scannerId, userAgent, ip, offlineQueueCount); // fire and forget, non-blocking untuk respons

  try {
    // Cek hari libur (Minggu atau tabel hari_libur)
    const dow = now.getUTCDay(); // 0 = Minggu
    if (dow === 0) {
      return NextResponse.json({ status: "error", message: "LIBUR: Hari Minggu" });
    }
    const { data: libur } = await supabaseAdmin
      .from("hari_libur")
      .select("keterangan")
      .eq("tanggal", tanggal)
      .maybeSingle();
    if (libur) {
      return NextResponse.json({ status: "error", message: `LIBUR: ${libur.keterangan}` });
    }

    const setting = await getAbsensiSetting();
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
      if (!siswaId) throw new Error("Invalid student ID");
      const { data } = await supabaseAdmin
        .from("students")
        .select("id, name, class")
        .eq("id", siswaId)
        .eq("status", "aktif")
        .maybeSingle();
      if (!data) throw new Error("Student not found");
      siswa = data;
      sumberScan = "manual_scanner";
    } else {
      const rawToken = String(form.get("token") || "").trim();
      if (!rawToken) throw new Error("Token empty");
      const match = rawToken.match(TOKEN_RE);
      if (!match) throw new Error("Invalid QR token format");
      const token = match[1];

      const { data } = await supabaseAdmin
        .from("absensi_qr_token")
        .select("siswa_id, students(id, name, class, status)")
        .eq("token", token)
        .maybeSingle();
      const s = data?.students ? (Array.isArray(data.students) ? data.students[0] : data.students) : null;
      if (!s) throw new Error("Invalid token or student not found");
      if (s.status !== "aktif") throw new Error("Siswa sudah tidak aktif");
      siswa = s;
      sumberScan = "sistem_otomatis";
    }

    const siswaId = siswa.id;

    // Anti-double-tap: 30 detik debounce berdasarkan log terakhir
    const { data: lastLog } = await supabaseAdmin
      .from("absensi_log")
      .select("created_at")
      .eq("siswa_id", siswaId)
      .eq("tanggal_absen", tanggal)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastLog) {
      const selisih = Math.floor((Date.now() - new Date(lastLog.created_at).getTime()) / 1000);
      if (selisih < 30) {
        return NextResponse.json({
          status: "ignore",
          nama: siswa.name,
          message: `Sabar, tunggu ${30 - selisih} detik lagi.`,
        });
      }
    }

    // Cek absen hari ini
    const { data: absenHariIni } = await supabaseAdmin
      .from("absensi")
      .select("id, jam_masuk, jam_pulang, status")
      .eq("siswa_id", siswaId)
      .eq("tanggal", tanggal)
      .maybeSingle();

    // KONDISI A: belum ada data -> absen masuk
    if (!absenHariIni) {
      const jamBukaSistem = addMinutes(jamMasuk, -toleransiPagiMenit);
      if (jamNow < jamBukaSistem) {
        return NextResponse.json({
          status: "error",
          message: `Terlalu Pagi! Scan dibuka jam ${jamBukaSistem.slice(0, 5)}`,
        });
      }
      if (jamNow >= jamPulangMulai) {
        return NextResponse.json({
          status: "error",
          message: `Akses Ditolak! Sudah masuk waktu pulang (${jamPulangMulai.slice(0, 5)}). Anda dianggap tidak hadir.`,
        });
      }

      const status = jamNow > batasTerlambat ? "terlambat" : "hadir";

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
        keterangan: `Scan: ${status.toUpperCase()}`,
        scanner_id: scannerId,
      });
      bumpScannerStats(scannerId);
      kirimNotifAbsen(siswaId, siswa.name, siswa.class, status as "hadir" | "terlambat", jamNow); // fire and forget

      return NextResponse.json({ status, nama: siswa.name, kelas: siswa.class, jam: jamFmt });
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
    const { error: updErr } = await supabaseAdmin
      .from("absensi")
      .update({ jam_pulang: jamNow })
      .eq("id", absenHariIni.id);
    if (updErr) throw new Error("Gagal simpan absen pulang: " + updErr.message);

    await supabaseAdmin.from("absensi_log").insert({
      admin_id: session.userId,
      siswa_id: siswaId,
      tanggal_absen: tanggal,
      status_lama: absenHariIni.status,
      status_baru: "pulang",
      keterangan: "Scan: PULANG",
      scanner_id: scannerId,
    });
    bumpScannerStats(scannerId);
    kirimNotifAbsen(siswaId, siswa.name, siswa.class, "pulang", jamNow); // fire and forget

    return NextResponse.json({ status: "pulang", nama: siswa.name, kelas: siswa.class, jam: jamFmt });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Terjadi kesalahan";
    return NextResponse.json({ status: "error", message }, { status: 400 });
  }
}
