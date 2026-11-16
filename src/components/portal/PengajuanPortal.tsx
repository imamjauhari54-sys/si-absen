"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FormAjukan from "./FormAjukan";
import GantiPin from "./GantiPin";
import KartuPengajuan from "./KartuPengajuan";
import type { PengajuanPortal as DataPengajuan, StatusPinSiswa } from "@/lib/data/pengajuan";
import { ATURAN_PENGAJUAN } from "@/lib/utils/pengajuan";

interface Props {
  pengajuan: DataPengajuan[];
  pin: StatusPinSiswa;
  hariIni: string;
  liburTanggal: string[];
  /** Dipakai uji/harness untuk mengganti router.refresh. */
  muatUlang?: () => void;
}

function jamWib(iso: string): string {
  return new Date(iso).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false }).replace(".", ":");
}

export default function PengajuanPortal({ pengajuan, pin, hariIni, liburTanggal, muatUlang }: Props) {
  const router = useRouter();
  const [formTerbuka, setFormTerbuka] = useState(false);
  const [kabar, setKabar] = useState<string | null>(null);

  const jumlahMenunggu = pengajuan.filter((p) => p.status === "menunggu").length;
  const penuh = jumlahMenunggu >= ATURAN_PENGAJUAN.maksMenunggu;
  const alasanTutup = !pin.diatur
    ? "PIN belum dibuat. Minta wali kelas membuatkan PIN, lalu gunakan di sini."
    : pin.terkunciSampai
      ? `Terlalu banyak PIN salah. Bisa dicoba lagi setelah pukul ${jamWib(pin.terkunciSampai)} WIB, atau minta wali kelas mereset PIN.`
      : penuh
        ? `Masih ada ${jumlahMenunggu} pengajuan menunggu persetujuan. Tunggu keputusan atau batalkan salah satunya.`
        : null;

  function selesai(pesan: string) {
    setKabar(pesan);
    setFormTerbuka(false);
    (muatUlang ?? (() => router.refresh()))();
  }

  return (
    <section className="section-card p-5 mb-6 reveal shadow-sm" aria-labelledby="judul-pengajuan" data-testid="bagian-pengajuan">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="judul-pengajuan" className="text-sm font-bold text-gray-800 dark:text-white flex items-center gap-2">
          <i className="fas fa-envelope-open-text text-indigo-500" /> Pengajuan Izin / Sakit
        </h3>
        {!formTerbuka && (
          <button type="button" disabled={alasanTutup !== null} onClick={() => { setKabar(null); setFormTerbuka(true); }}
            className="h-10 px-5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold shadow-sm transition active:scale-95 flex items-center gap-2">
            <i className="fas fa-plus" /> Ajukan
          </button>
        )}
      </div>

      {alasanTutup && !formTerbuka && (
        <p className="mt-3 text-xs rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 border border-amber-100 dark:border-amber-900/40 px-3 py-2" role="note">
          <i className="fas fa-circle-info mr-1.5" /> {alasanTutup}
        </p>
      )}

      {kabar && (
        <div role="status" className="mt-3 flex items-start gap-3 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-900/40 rounded-2xl px-4 py-3 text-[13px] font-semibold">
          <i className="fa-solid fa-circle-check mt-0.5" /> <span>{kabar}</span>
        </div>
      )}

      <details className="mt-3 group rounded-xl bg-gray-50 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-700/50 px-3 py-2 text-xs text-gray-600 dark:text-gray-300">
        <summary className="cursor-pointer font-bold text-gray-700 dark:text-gray-200">Apa arti status &ldquo;Menunggu persetujuan&rdquo;?</summary>
        <ul className="mt-2 space-y-1.5 list-disc pl-4 leading-relaxed">
          <li>Pengajuan <b>tidak langsung mengubah absensi</b>. Wali kelas akan memeriksanya dulu.</li>
          <li>Selama menunggu, hari itu <b>tampil &ldquo;Menunggu&rdquo;</b>, tidak dihitung Alpha, dan tidak dikirimi pemberitahuan Alpha.</li>
          <li>Bila <b>disetujui</b>, hari itu dicatat Izin/Sakit. Bila siswa ternyata hadir (scan), catatan hadir yang dipakai.</li>
          <li>Bila <b>ditolak atau dibatalkan</b>, hari itu kembali mengikuti aturan biasa: Alpha jika siswa tidak hadir.</li>
          <li>Pengajuan hanya bisa dibatalkan selama masih menunggu.</li>
        </ul>
      </details>

      {formTerbuka && <FormAjukan hariIni={hariIni} liburTanggal={liburTanggal} onSelesai={selesai} onTutup={() => setFormTerbuka(false)} />}

      <div className="mt-5">
        {pengajuan.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-6"><i className="fas fa-inbox text-2xl block mb-2 opacity-50" />Belum ada pengajuan.</p>
        ) : (
          <ul className="space-y-3" aria-label="Riwayat pengajuan">
            {pengajuan.map((p) => <KartuPengajuan key={p.id} p={p} bolehBatal={pin.diatur && !pin.terkunciSampai} onSelesai={selesai} />)}
          </ul>
        )}
      </div>

      {pin.diatur && <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-700/50"><GantiPin onSelesai={selesai} /></div>}
    </section>
  );
}
