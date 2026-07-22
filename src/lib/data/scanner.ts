import { supabaseAdmin } from "@/lib/supabase/server";

export async function registerScanner(scannerId: string, deviceName: string, ipAddress: string) {
  try {
    await supabaseAdmin.from("absensi_scanner").upsert(
      {
        scanner_id: scannerId,
        device_name: deviceName,
        ip_address: ipAddress,
        status: "active",
        last_sync: new Date().toISOString(),
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
