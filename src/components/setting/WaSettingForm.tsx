"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { simpanWaSettingAction } from "@/lib/actions/setting";
import { settingInitialState } from "@/lib/actions/setting-types";
import NotifModal from "@/components/ui/NotifModal";

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
}: {
  enabled: boolean;
  gatewayUrl: string;
  apiKey: string;
}) {
  const [state, formAction] = useActionState(simpanWaSettingAction, settingInitialState);
  const [notifOpen, setNotifOpen] = useState(false);
  const [isEnabled, setIsEnabled] = useState(enabled);

  return (
    <div className="section-card p-5 shadow-sm reveal">
      <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-2">
        <i className="fab fa-whatsapp text-emerald-500" /> Notifikasi WhatsApp
      </h3>
      <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-4 leading-relaxed">
        Kirim pesan WA otomatis ke orang tua saat siswa absen masuk/pulang/alpha. Butuh akun gateway WA pihak ketiga
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
