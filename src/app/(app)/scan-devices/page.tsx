import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { getScanDevices } from "@/lib/data/scanner";
import DaftarDevice from "@/components/scan-devices/DaftarDevice";

export const metadata: Metadata = { title: "Device Scanner" };
export const dynamic = "force-dynamic";

export default async function ScanDevicesPage() {
  await requireSession(["admin"]);
  const devices = await getScanDevices();

  return (
    <div className="w-full px-4 pt-2 mb-14">
      <div className="mb-6 reveal">
        <h2 className="text-2xl font-extrabold text-gray-800 dark:text-white tracking-tight">
          Device Scanner
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm font-medium">
          Pantau semua device yang lagi dipakai buka halaman Scan QR secara bersamaan.
        </p>
      </div>

      <DaftarDevice initialDevices={devices} />
    </div>
  );
}
