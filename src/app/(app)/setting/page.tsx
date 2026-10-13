import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { getAbsensiSetting } from "@/lib/data/dashboard";
import { getSettingValue } from "@/lib/data/settings";
import { getDistinctBulanAbsensi } from "@/lib/data/rekap";
import { getDaftarTapel } from "@/lib/data/tapel";
import { JENIS_NOTIF, parseNotif } from "@/lib/wa/jenis-notifikasi";
import { todayJakarta } from "@/lib/utils/tanggal";
import { tapelDariTanggal, urutkanTapelTerbaru, type Semester } from "@/lib/utils/tapel";
import JadwalForm from "@/components/setting/JadwalForm";
import ResetDataModal from "@/components/setting/ResetDataModal";
import InfoSekolahForm from "@/components/setting/InfoSekolahForm";
import WaSettingForm from "@/components/setting/WaSettingForm";
import PageTitle from "@/components/ui/PageTitle";

export const metadata: Metadata = { title: "Pengaturan" };
export const dynamic = "force-dynamic";

export default async function SettingPage() {
  const session = await requireSession();
  const isAdmin = session.role === "admin";

  const [setting, namaSekolah, alamat, daftarBulan, daftarTapelMaster, waEnabled, waGatewayUrl, waApiKey, ...notifMentah] = await Promise.all([
    getAbsensiSetting(),
    getSettingValue("nama_sekolah", "SI-ABSEN"),
    getSettingValue("alamat_sekolah", ""),
    isAdmin ? getDistinctBulanAbsensi() : Promise.resolve([]),
    isAdmin ? getDaftarTapel() : Promise.resolve([] as string[]),
    getSettingValue("wa_enabled", "false"),
    getSettingValue("wa_gateway_url", ""),
    getSettingValue("wa_api_key", ""),
    ...JENIS_NOTIF.map((j) => (isAdmin ? getSettingValue(j.settingKey, "") : Promise.resolve(""))),
  ]);
  // Bawaan server dipakai untuk jenis yang belum pernah disimpan (hanya Alpha yang aktif).
  const notif = parseNotif(Object.fromEntries(JENIS_NOTIF.map((j, i) => [j.kunci, notifMentah[i]])));

  const jamMasuk = (setting.jam_masuk ?? "07:00:00").slice(0, 5);
  const batasTerlambat = (setting.batas_terlambat ?? "07:15:00").slice(0, 5);
  const jamPulang = (setting.jam_pulang_mulai ?? "11:30:00").slice(0, 5);
  const tapel = setting.tapel ?? tapelDariTanggal(todayJakarta());
  const semester: Semester = setting.semester === "ganjil" ? "ganjil" : "genap";
  // Tapel aktif selalu ada di daftar, walau master belum terisi (mis. migrasi 015 belum jalan).
  const daftarTapel = urutkanTapelTerbaru([...daftarTapelMaster, tapel]);
  const durasiKunciMenit = setting.durasi_kunci_menit ?? 120;
  const toleransiPagiMenit = setting.toleransi_pagi_menit ?? 60;

  return (
    <div className="w-full max-w-[1600px] px-4 pt-2 mb-14">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4 reveal">
        <PageTitle icon="fa-gear" title="Pengaturan Sistem">
          Konfigurasi jam operasional sekolah dan parameter absensi
        </PageTitle>
      </div>

      {/*
        Susunan layar lebar (xl): baris 1 = Jadwal | (Info Sekolah di atas Zona Bahaya) supaya kedua
        kolom hampir sama tinggi; baris 2 = Notifikasi WhatsApp selebar penuh. Di bawah xl semuanya
        ditumpuk satu kolom dan Zona Bahaya memakai order-last, jadi tindakan penghapusan data
        selalu paling akhir di HP. Lebar mengikuti halaman lain (w-full, rata kiri); batas 1600px
        hanya mencegah isian melebar tanpa batas di monitor ultra-lebar atau saat browser di-zoom out.
      */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="reveal xl:h-full">
          {isAdmin ? (
            <JadwalForm
              jamMasuk={jamMasuk}
              batasTerlambat={batasTerlambat}
              jamPulang={jamPulang}
              durasiKunciMenit={durasiKunciMenit}
              toleransiPagiMenit={toleransiPagiMenit}
            />
          ) : (
            <div className="section-card p-6 shadow-sm xl:h-full">
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
        </div>

        <div className="contents xl:flex xl:flex-col xl:gap-6">
          <InfoSekolahForm namaSekolah={namaSekolah} alamat={alamat} tapel={tapel} semester={semester} daftarTapel={daftarTapel} isAdmin={isAdmin} />

          {isAdmin && (
            <div className="order-last xl:order-none xl:flex-1">
              <ResetDataModal daftarBulan={daftarBulan} />
            </div>
          )}
        </div>

        {isAdmin && (
          <div className="xl:col-span-2">
            <WaSettingForm enabled={waEnabled === "true"} gatewayUrl={waGatewayUrl} apiKey={waApiKey} notif={notif} />
          </div>
        )}
      </div>
    </div>
  );
}
