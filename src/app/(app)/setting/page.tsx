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
  const durasiKunciMenit = setting.durasi_kunci_menit ?? 120;
  const toleransiPagiMenit = setting.toleransi_pagi_menit ?? 60;

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
          {isAdmin ? (
            <JadwalForm
              jamMasuk={jamMasuk}
              batasTerlambat={batasTerlambat}
              jamPulang={jamPulang}
              tapel={tapel}
              semester={semester}
              durasiKunciMenit={durasiKunciMenit}
              toleransiPagiMenit={toleransiPagiMenit}
            />
          ) : (
            <div className="section-card p-6 shadow-sm mb-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-lg">
                  <i className="fas fa-stopwatch" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-gray-800 dark:text-white">Jadwal & Batas Operasional</h3>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-widest mt-0.5">Waktu penentuan status otomatis</p>
                </div>
              </div>

              <hr className="border-gray-100 dark:border-gray-700/50 my-5" />

              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50 rounded-xl shadow-inner">
                <div className="flex-1 text-center border-r border-gray-200 dark:border-gray-700">
                  <div className="font-mono text-2xl font-black text-emerald-500 dark:text-emerald-400 tracking-tight leading-none">{jamMasuk}</div>
                  <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mt-1.5">Jam Masuk</div>
                </div>
                <div className="flex-1 text-center border-r border-gray-200 dark:border-gray-700">
                  <div className="font-mono text-2xl font-black text-amber-500 dark:text-amber-400 tracking-tight leading-none">{batasTerlambat}</div>
                  <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mt-1.5">Batas Telat</div>
                </div>
                <div className="flex-1 text-center">
                  <div className="font-mono text-2xl font-black text-indigo-500 dark:text-indigo-400 tracking-tight leading-none">{jamPulang}</div>
                  <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mt-1.5">Jam Pulang</div>
                </div>
              </div>

              <div className="flex items-start gap-2.5 mt-5 p-3.5 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-xl">
                <i className="fas fa-circle-info text-amber-500 mt-0.5 text-xs flex-shrink-0" />
                <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                  <strong>Catatan:</strong> Jadwal ini berlaku untuk seluruh sekolah dan menentukan status Hadir/Terlambat siswa secara otomatis saat scan absen. Hanya <strong>admin</strong> yang bisa mengubah pengaturan ini.
                </p>
              </div>
            </div>
          )}
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
