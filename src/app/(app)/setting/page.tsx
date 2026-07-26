import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { getAbsensiSetting } from "@/lib/data/dashboard";
import { getSettingValue } from "@/lib/data/settings";
import { getDistinctBulanAbsensi } from "@/lib/data/rekap";
import JadwalForm from "@/components/setting/JadwalForm";
import ResetDataModal from "@/components/setting/ResetDataModal";
import InfoSekolahForm from "@/components/setting/InfoSekolahForm";
import WaSettingForm from "@/components/setting/WaSettingForm";

export const metadata: Metadata = { title: "Pengaturan" };
export const dynamic = "force-dynamic";

export default async function SettingPage() {
  const session = await requireSession();
  const isAdmin = session.role === "admin";

  const [setting, namaSekolah, alamat, daftarBulan, waEnabled, waGatewayUrl, waApiKey] = await Promise.all([
    getAbsensiSetting(),
    getSettingValue("nama_sekolah", "SI-ABSEN"),
    getSettingValue("alamat_sekolah", ""),
    isAdmin ? getDistinctBulanAbsensi() : Promise.resolve([]),
    getSettingValue("wa_enabled", "false"),
    getSettingValue("wa_gateway_url", ""),
    getSettingValue("wa_api_key", ""),
  ]);

  const jamMasuk = (setting.jam_masuk ?? "07:00:00").slice(0, 5);
  const batasTerlambat = (setting.batas_terlambat ?? "07:15:00").slice(0, 5);
  const jamPulang = (setting.jam_pulang_mulai ?? "11:30:00").slice(0, 5);
  const tapel = setting.tapel ?? "2025/2026";
  const semester = setting.semester === "ganjil" ? "ganjil" : "genap";

  return (
    <div className="w-full px-4 pt-2 mb-14">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4 reveal">
        <div>
          <h2 className="text-2xl font-extrabold text-gray-800 dark:text-white tracking-tight">Pengaturan Sistem</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm font-medium">Konfigurasi jam operasional sekolah dan parameter absensi</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* KIRI: FORM + ZONA BAHAYA */}
        <div className="lg:col-span-2 reveal">
          <JadwalForm jamMasuk={jamMasuk} batasTerlambat={batasTerlambat} jamPulang={jamPulang} tapel={tapel} semester={semester} />
          {isAdmin && <ResetDataModal daftarBulan={daftarBulan} />}
        </div>

        {/* KANAN: SIDEBAR INFO */}
        <div className="space-y-6">
          <InfoSekolahForm namaSekolah={namaSekolah} alamat={alamat} tapel={tapel} semester={semester} isAdmin={isAdmin} />

          {isAdmin && <WaSettingForm enabled={waEnabled === "true"} gatewayUrl={waGatewayUrl} apiKey={waApiKey} />}
        </div>
      </div>
    </div>
  );
}
