import { supabaseAdmin } from "@/lib/supabase/server";
import { nowJakarta, tambahMenit } from "@/lib/utils/tanggal";
import { getAbsensiSetting, cekHariLibur } from "@/lib/data/dashboard";

export type StatusScan = "hadir" | "terlambat" | "pulang" | "sudah" | "ignore" | "error";

export interface ScanResult {
  status: StatusScan;
  nama?: string;
  kelas?: string;
  jam?: string; // format H.i, misal "07.15"
  keterangan?: string;
  message?: string;
}

export interface SiswaCariResult {
  id: number;
  name: string;
  class: string;
}

/** Port dari validateQRToken() di ajax_absen.php */
function validateQRToken(raw: string): string | null {
  const m = /^SIELISA:([a-f0-9]{32,})$/i.exec(raw.trim());
  return m ? m[1] : null;
}

/** Port dari registerScanner() — upsert perangkat scanner ke absensi_scanner. Best-effort, tidak boleh gagalkan absen. */
async function registerScanner(scannerId: string, userAgent: string, ip: string) {
  try {
    await supabaseAdmin.from("absensi_scanner").upsert(
      {
        scanner_id: scannerId,
        device_name: userAgent.slice(0, 255),
        ip_address: ip,
        last_sync: new Date().toISOString(),
        status: "active",
      },
      { onConflict: "scanner_id" }
    );
  } catch (e) {
    console.error("[registerScanner]", e);
  }
}

/** Port dari logAbsensi() — catat riwayat transisi status ke absensi_log. */
async function logAbsensi(params: {
  adminId: number;
  siswaId: number;
  tanggal: string;
  statusBaru: string;
  statusLama: string | null;
  scannerId: string;
}) {
  const keterangan = `Scan: ${params.statusBaru.toUpperCase()}`;
  const { error } = await supabaseAdmin.from("absensi_log").insert({
    admin_id: params.adminId,
    siswa_id: params.siswaId,
    tanggal_absen: params.tanggal,
    status_lama: params.statusLama ?? "proses",
    status_baru: params.statusBaru,
    keterangan,
    scanner_id: params.scannerId,
  });
  if (error) console.error("[logAbsensi]", error.message);
}

/** Port dari GET action=cari — pencarian siswa untuk modal absen manual. */
export async function cariSiswaUntukAbsen(qRaw: string): Promise<SiswaCariResult[]> {
  const q = qRaw.trim().slice(0, 50);
  if (q.length < 2) return [];

  const { data, error } = await supabaseAdmin
    .from("students")
    .select("id, name, class")
    .ilike("name", `%${q}%`)
    .order("name")
    .limit(10);

  if (error) {
    console.error("[cariSiswaUntukAbsen]", error.message);
    return [];
  }
  return (data ?? []).map((s) => ({ id: s.id, name: s.name, class: s.class }));
}

/**
 * Port 1:1 dari logika utama ajax_absen.php (POST):
 * - cek hari libur & master lock
 * - resolve siswa dari token QR (absensi_qr_token) atau siswa_id (manual)
 * - anti-double-tap 30 detik
 * - absen masuk (hadir/terlambat) kalau belum ada data hari ini
 * - absen pulang kalau data sudah ada & sudah masuk jam pulang
 */
export async function prosesAbsen(opts: {
  manual: boolean;
  token?: string;
  siswaId?: number;
  scannerId: string;
  adminId: number;
  userAgent: string;
  ip: string;
}): Promise<ScanResult> {
  const { tanggal, jam } = nowJakarta();
  const jamFmt = jam.slice(0, 5).replace(":", ".");

  await registerScanner(opts.scannerId, opts.userAgent, opts.ip);

  // CEK HARI LIBUR
  const { isLibur, pesanLibur } = await cekHariLibur(tanggal);
  if (isLibur) {
    return { status: "error", message: `LIBUR: ${pesanLibur}` };
  }

  const setting = await getAbsensiSetting();
  const jamMasuk = setting.jam_masuk ?? "07:00:00";
  const batasTerlambat = setting.batas_terlambat ?? "07:15:00";
  const jamPulangMulai = setting.jam_pulang_mulai ?? "11:30:00";

  // MASTER LOCK: tutup sistem otomatis 120 menit setelah jam pulang mulai
  const batasAkhirSistem = tambahMenit(jamPulangMulai, 120);
  if (jam > batasAkhirSistem) {
    return { status: "error", message: `Sistem Terkunci! Batas operasional berakhir jam ${batasAkhirSistem.slice(0, 5)}` };
  }

  // TENTUKAN SISWA
  let siswa: { id: number; name: string; class: string } | null = null;
  let sumberScan: string;

  if (opts.manual) {
    if (!opts.siswaId || opts.siswaId <= 0) {
      return { status: "error", message: "Invalid student ID" };
    }
    const { data } = await supabaseAdmin
      .from("students")
      .select("id, name, class")
      .eq("id", opts.siswaId)
      .maybeSingle();
    if (!data) return { status: "error", message: "Student not found" };
    siswa = data;
    sumberScan = "manual_scanner";
  } else {
    if (!opts.token) return { status: "error", message: "Token empty" };
    const token = validateQRToken(opts.token);
    if (!token) return { status: "error", message: "Invalid QR token format" };

    const { data } = await supabaseAdmin
      .from("absensi_qr_token")
      .select("siswa_id, students(id, name, class)")
      .eq("token", token)
      .maybeSingle();

    const s = data?.students ? (Array.isArray(data.students) ? data.students[0] : data.students) : null;
    if (!s) return { status: "error", message: "Invalid token or student not found" };
    siswa = s;
    sumberScan = "sistem_otomatis";
  }

  const siswaId = siswa.id;

  // ANTI-DOUBLE-TAP (30 DETIK DEBOUNCING)
  const { data: lastLog } = await supabaseAdmin
    .from("absensi_log")
    .select("created_at")
    .eq("siswa_id", siswaId)
    .eq("tanggal_absen", tanggal)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastLog) {
    const selisihDetik = (Date.now() - new Date(lastLog.created_at).getTime()) / 1000;
    if (selisihDetik < 30) {
      return {
        status: "ignore",
        nama: siswa.name,
        message: `Sabar, tunggu ${Math.ceil(30 - selisihDetik)} detik lagi.`,
      };
    }
  }

  // CEK ABSEN HARI INI
  const { data: absenHariIni } = await supabaseAdmin
    .from("absensi")
    .select("id, jam_masuk, jam_pulang, status")
    .eq("siswa_id", siswaId)
    .eq("tanggal", tanggal)
    .maybeSingle();

  // KONDISI A: BELUM ADA DATA -> ABSEN MASUK
  if (!absenHariIni) {
    const jamBukaSistem = tambahMenit(jamMasuk, -60);
    if (jam < jamBukaSistem) {
      return { status: "error", message: `Terlalu Pagi! Scan dibuka jam ${jamBukaSistem.slice(0, 5)}` };
    }
    if (jam >= jamPulangMulai) {
      return {
        status: "error",
        message: `Akses Ditolak! Sudah masuk waktu pulang (${jamPulangMulai.slice(0, 5)}). Anda dianggap tidak hadir.`,
      };
    }

    const status: "hadir" | "terlambat" = jam > batasTerlambat ? "terlambat" : "hadir";

    const { error: insertErr } = await supabaseAdmin.from("absensi").insert({
      siswa_id: siswaId,
      tanggal,
      jam_masuk: jam,
      status,
      tapel: setting.tapel,
      semester: setting.semester,
      scan_oleh: sumberScan,
      scanner_id: opts.scannerId,
    });
    if (insertErr) return { status: "error", message: insertErr.message };

    await logAbsensi({
      adminId: opts.adminId,
      siswaId,
      tanggal,
      statusBaru: status,
      statusLama: null,
      scannerId: opts.scannerId,
    });

    return { status, nama: siswa.name, kelas: siswa.class, jam: jamFmt };
  }

  // KONDISI B: DATA SUDAH ADA
  if (absenHariIni.jam_pulang) {
    return {
      status: "sudah",
      nama: siswa.name,
      keterangan: `Selesai! Sudah absen pulang · ${String(absenHariIni.jam_pulang).slice(0, 5)}`,
    };
  }

  if (jam < jamPulangMulai) {
    const teksStatus = absenHariIni.status === "terlambat" ? "Terlambat" : "Hadir";
    return {
      status: "sudah",
      nama: siswa.name,
      keterangan: `${teksStatus} masuk · ${String(absenHariIni.jam_masuk).slice(0, 5)} (Belum jam pulang)`,
    };
  }

  // KONDISI C: ABSEN PULANG
  const { error: updateErr } = await supabaseAdmin
    .from("absensi")
    .update({ jam_pulang: jam })
    .eq("id", absenHariIni.id);
  if (updateErr) return { status: "error", message: updateErr.message };

  await logAbsensi({
    adminId: opts.adminId,
    siswaId,
    tanggal,
    statusBaru: "pulang",
    statusLama: absenHariIni.status,
    scannerId: opts.scannerId,
  });

  return { status: "pulang", nama: siswa.name, kelas: siswa.class, jam: jamFmt };
}
