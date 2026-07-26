"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { simpanInfoSekolahAction } from "@/lib/actions/setting";
import { settingInitialState } from "@/lib/actions/setting-types";
import NotifModal from "@/components/ui/NotifModal";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl text-xs font-bold shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2"
    >
      {pending ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-save" />}
      {pending ? "Menyimpan..." : "Simpan Info Sekolah"}
    </button>
  );
}

export default function InfoSekolahForm({
  namaSekolah,
  alamat,
  tapel,
  semester,
  isAdmin,
}: {
  namaSekolah: string;
  alamat: string;
  tapel: string;
  semester: string;
  isAdmin: boolean;
}) {
  const [state, formAction] = useActionState(simpanInfoSekolahAction, settingInitialState);
  const [notifOpen, setNotifOpen] = useState(false);

  return (
    <div className="section-card p-5 shadow-sm reveal">
      <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
        <i className="fas fa-school text-indigo-500" /> Info Sekolah
      </h3>

      {isAdmin ? (
        <form action={formAction} onSubmit={() => setNotifOpen(true)} className="space-y-3">
          <div>
            <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
              Nama Sekolah
            </label>
            <input
              type="text"
              name="nama_sekolah"
              defaultValue={namaSekolah}
              placeholder="Nama sekolah"
              className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
              Alamat <span className="normal-case font-normal">(opsional)</span>
            </label>
            <input
              type="text"
              name="alamat_sekolah"
              defaultValue={alamat}
              placeholder="Alamat sekolah"
              className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          <div className="flex justify-between items-center p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-100 dark:border-indigo-800/50">
            <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">Tapel Aktif</span>
            <span className="text-xs font-extrabold text-indigo-700 dark:text-indigo-300 text-right">
              {tapel} <span className="mx-0.5">•</span> {semester.charAt(0).toUpperCase() + semester.slice(1)}
            </span>
          </div>

          <SubmitButton />
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 leading-relaxed">
            <i className="fas fa-info-circle mr-1" /> Tahun pelajaran &amp; semester diatur lewat form Jadwal Sekolah di sebelah kiri.
          </p>
        </form>
      ) : (
        <div className="space-y-3">
          <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-700/50">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Nama Sekolah</span>
            <span className="text-xs font-bold text-gray-800 dark:text-white text-right max-w-[140px] truncate" title={namaSekolah}>
              {namaSekolah}
            </span>
          </div>
          {alamat && (
            <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-700/50">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Alamat</span>
              <span className="text-xs font-bold text-gray-800 dark:text-white text-right max-w-[140px] truncate" title={alamat}>
                {alamat}
              </span>
            </div>
          )}
          <div className="flex justify-between items-center p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-100 dark:border-indigo-800/50">
            <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">Tapel Aktif</span>
            <span className="text-xs font-extrabold text-indigo-700 dark:text-indigo-300 text-right">
              {tapel} <span className="mx-0.5">•</span> {semester.charAt(0).toUpperCase() + semester.slice(1)}
            </span>
          </div>
        </div>
      )}

      <NotifModal
        open={notifOpen && state.status !== "idle"}
        status={state.status === "ok" ? "ok" : "error"}
        message={state.message}
        onClose={() => setNotifOpen(false)}
      />
    </div>
  );
}
