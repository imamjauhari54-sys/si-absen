import { supabaseAdmin } from "@/lib/supabase/server";
import { todayJakarta } from "@/lib/utils/tanggal";
import type { DeviceStatus, ScanDeviceRow } from "@/types";

export async function registerScanner(
  scannerId: string,
  deviceName: string,
  ipAddress: string,
  offlineQueueCount: number
) {
  try {
    await supabaseAdmin.from("absensi_scanner").upsert(
      {
        scanner_id: scannerId,
        device_name: deviceName,
        ip_address: ipAddress,
        status: "active",
        offline_queue_count: offlineQueueCount,
        last_sync: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "scanner_id" }
    );
  } catch {
    // non-fatal, jangan ganggu proses absen kalau tracking scanner gagal
  }
}

export async function bumpScannerStats(scannerId: string) {
  try {
    const { data } = await supabaseAdmin
      .from("absensi_scanner")
      .select("total_scans")
      .eq("scanner_id", scannerId)
      .maybeSingle();
    await supabaseAdmin
      .from("absensi_scanner")
      .update({ total_scans: (data?.total_scans ?? 0) + 1, last_sync: new Date().toISOString() })
      .eq("scanner_id", scannerId);
  } catch {
    // non-fatal
  }
}

// ── MONITORING DEVICE SCANNER ──────────────────────────────────────
const ONLINE_THRESHOLD_SEC = 2 * 60; // masih aktif scan barusan
const IDLE_THRESHOLD_SEC = 10 * 60; // sempat aktif tapi lagi diam

/** Ringkas user-agent mentah jadi label device yang gampang dibaca admin. */
function ringkasDeviceName(ua: string | null): string {
  if (!ua) return "Device tidak dikenal";
  const platform = /iPhone/i.test(ua)
    ? "iPhone"
    : /iPad/i.test(ua)
      ? "iPad"
      : /Android/i.test(ua)
        ? "Android"
        : /Windows/i.test(ua)
          ? "Windows"
          : /Macintosh/i.test(ua)
            ? "Mac"
            : "Device lain";
  const browser = /Edg\//i.test(ua)
    ? "Edge"
    : /Chrome\//i.test(ua)
      ? "Chrome"
      : /Firefox\//i.test(ua)
        ? "Firefox"
        : /Safari\//i.test(ua)
          ? "Safari"
          : "Browser lain";
  return `${platform} · ${browser}`;
}

function hitungStatus(detikLalu: number | null): DeviceStatus {
  if (detikLalu === null) return "offline";
  if (detikLalu <= ONLINE_THRESHOLD_SEC) return "online";
  if (detikLalu <= IDLE_THRESHOLD_SEC) return "idle";
  return "offline";
}

export async function getScanDevices(): Promise<ScanDeviceRow[]> {
  const [{ data }, { data: logHariIni }] = await Promise.all([
    supabaseAdmin
      .from("absensi_scanner")
      .select("scanner_id, device_name, label, ip_address, total_scans, offline_queue_count, last_sync")
      .order("last_sync", { ascending: false, nullsFirst: false }),
    supabaseAdmin.from("absensi_log").select("scanner_id").eq("tanggal_absen", todayJakarta()),
  ]);

  const hitungHariIni = new Map<string, number>();
  for (const row of logHariIni ?? []) {
    if (!row.scanner_id) continue;
    hitungHariIni.set(row.scanner_id, (hitungHariIni.get(row.scanner_id) ?? 0) + 1);
  }

  const now = Date.now();
  return (data ?? []).map((row) => {
    // last_sync bisa null kalau device baru keregister tapi belum pernah scan
    const detikLalu = row.last_sync ? Math.max(0, Math.floor((now - new Date(row.last_sync).getTime()) / 1000)) : null;
    const namaOtomatis = ringkasDeviceName(row.device_name);
    return {
      scannerId: row.scanner_id,
      namaDevice: namaOtomatis,
      namaTampil: row.label?.trim() || namaOtomatis,
      label: row.label?.trim() || null,
      ipAddress: row.ip_address ?? "-",
      totalScans: row.total_scans ?? 0,
      scanHariIni: hitungHariIni.get(row.scanner_id) ?? 0,
      antrianOffline: row.offline_queue_count ?? 0,
      lastSync: row.last_sync,
      detikLalu,
      deviceStatus: hitungStatus(detikLalu),
    };
  });
}

export async function updateScannerLabel(scannerId: string, label: string) {
  const bersih = label.trim().slice(0, 60);
  const { error } = await supabaseAdmin
    .from("absensi_scanner")
    .update({ label: bersih || null, updated_at: new Date().toISOString() })
    .eq("scanner_id", scannerId);
  if (error) throw new Error(error.message);
}

export async function deleteScanner(scannerId: string) {
  const { error } = await supabaseAdmin.from("absensi_scanner").delete().eq("scanner_id", scannerId);
  if (error) throw new Error(error.message);
}
