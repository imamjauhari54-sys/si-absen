"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { simpanWaSettingAction } from "@/lib/actions/setting";
import { settingInitialState } from "@/lib/actions/setting-types";
import NotifModal from "@/components/ui/NotifModal";
import { DEFAULT_NOTIF, JENIS_NOTIF, type PengaturanNotif } from "@/lib/wa/jenis-notifikasi";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl text-xs font-bold shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2"
    >
      {pending ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-save" />}
      {pending ? "Menyimpan..." : "Simpan Pengaturan WA"}
    </button>
  );
}

export default function WaSettingForm({
  enabled,
  gatewayUrl,
  apiKey,
  notif = DEFAULT_NOTIF,
}: {
  enabled: boolean;
  gatewayUrl: string;
  apiKey: string;
  /** Opsional: kalau tidak dikirim (mis. halaman setting belum diperbarui, atau props basi saat hot reload), pakai bawaan. */
  notif?: PengaturanNotif;
}) {
  const [state, formAction] = useActionState(simpanWaSettingAction, settingInitialState);
  const [notifOpen, setNotifOpen] = useState(false);
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [notifPilih, setNotifPilih] = useState<PengaturanNotif>(notif);
  const adaYangDipilih = JENIS_NOTIF.some((j) => notifPilih[j.kunci]);

  return (
    <div className="section-card p-5 shadow-sm reveal">
      <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-2">
        <i className="fab fa-whatsapp text-emerald-500" /> Notifikasi WhatsApp
      </h3>
      <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-4 leading-relaxed">
        Kirim pesan WA otomatis ke orang tua sesuai jenis notifikasi yang dipilih di bawah. Butuh akun gateway WA pihak ketiga
        (mis. Fonnte, Wablas) yang kompatibel format <code>{"{ target, message }"}</code>.
      </p>

      <form action={formAction} onSubmit={() => setNotifOpen(true)} className="space-y-3">
        <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 cursor-pointer">
          <span className="text-xs font-bold text-gray-600 dark:text-gray-300">Aktifkan Notifikasi WA</span>
          <input
            type="checkbox"
            name="wa_enabled"
            value="1"
            checked={isEnabled}
            onChange={(e) => setIsEnabled(e.target.checked)}
            className="w-4 h-4 rounded accent-emerald-600"
          />
        </label>

        {isEnabled && (
          <>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
                URL Gateway WA
              </label>
              <input
                type="text"
                name="wa_gateway_url"
                defaultValue={gatewayUrl}
                placeholder="https://api.fonnte.com/send"
                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-xl text-sm font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
                API Key / Token
              </label>
              <input
                type="password"
                name="wa_api_key"
                defaultValue={apiKey}
                placeholder="Token dari dashboard provider WA"
                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-xl text-sm font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
          </>
        )}

        {/* Penanda: server hanya menyimpan jenis notifikasi kalau form ini memang mengirimkannya. */}
        <input type="hidden" name="notif_ada" value="1" />

        <div className={`rounded-xl border border-gray-200 dark:border-gray-700 p-3 transition-opacity ${isEnabled ? "" : "opacity-60"}`}>
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Jenis notifikasi</div>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 leading-relaxed">
                Pilih pesan yang dikirim ke orang tua. Satu scan masuk hanya menghasilkan satu pesan sesuai statusnya (Hadir atau Terlambat).
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNotifPilih({ hadir: false, terlambat: false, pulang: false, alpha: false })}
              className="shrink-0 text-[10px] font-bold text-rose-500 hover:text-rose-600 underline underline-offset-2"
            >
              Nonaktifkan semua
            </button>
          </div>

          <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {JENIS_NOTIF.map((j) => (
              <label key={j.kunci} className="flex items-start gap-3 py-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  name={`notif_${j.kunci}`}
                  value="1"
                  checked={notifPilih[j.kunci]}
                  onChange={(e) => setNotifPilih((p) => ({ ...p, [j.kunci]: e.target.checked }))}
                  className="w-4 h-4 mt-0.5 rounded accent-emerald-600 shrink-0"
                />
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-gray-700 dark:text-gray-200">{j.label}</span>
                  <span className="block text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">{j.kapan}</span>
                  <span className="block text-[10px] text-gray-400 dark:text-gray-500 leading-relaxed mt-0.5">{j.keterangan}</span>
                </span>
              </label>
            ))}
          </div>

          {!isEnabled && (
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2 leading-relaxed">
              <i className="fas fa-info-circle mr-1" /> Belum berlaku selama notifikasi WA nonaktif.
            </p>
          )}
          {isEnabled && !adaYangDipilih && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-2 leading-relaxed">
              <i className="fas fa-triangle-exclamation mr-1" /> Belum ada jenis yang dipilih, jadi tidak ada pesan yang akan terkirim.
            </p>
          )}
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2 leading-relaxed">
            <i className="fas fa-info-circle mr-1" /> Perubahan berlaku dalam sekitar 30 detik, tanpa deploy. Untuk Fonnte, notifikasi Alpha
            dikirim bertahap dengan jeda acak antar pesan.
          </p>
        </div>

        <SubmitButton />
        <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-relaxed">
          <i className="fas fa-info-circle mr-1" /> Nomor HP orang tua diisi lewat form Tambah/Edit Siswa. Kalau nomornya
          kosong, notifikasi untuk siswa itu otomatis dilewati.
        </p>
      </form>

      <NotifModal
        open={notifOpen && state.status !== "idle"}
        status={state.status === "ok" ? "ok" : "error"}
        message={state.message}
        onClose={() => setNotifOpen(false)}
      />
    </div>
  );
}
