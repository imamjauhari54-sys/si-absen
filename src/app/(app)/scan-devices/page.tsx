import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { getScanDevices } from "@/lib/data/scanner";
import DaftarDevice from "@/components/scan-devices/DaftarDevice";
import PageTitle from "@/components/ui/PageTitle";

export const metadata: Metadata = { title: "Device Scanner" };
export const dynamic = "force-dynamic";

export default async function ScanDevicesPage() {
  await requireSession(["admin"]);
  const devices = await getScanDevices();

  return (
    <div className="w-full px-4 pt-2 mb-14">
      <div className="mb-6 reveal">
        <PageTitle icon="fa-tablet-screen-button" title="Device Scanner">
          Pantau semua device yang lagi dipakai buka halaman Scan QR secara bersamaan.
        </PageTitle>
      </div>

      <DaftarDevice initialDevices={devices} />
    </div>
  );
}
