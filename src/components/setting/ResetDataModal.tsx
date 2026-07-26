"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { resetDataAction } from "@/lib/actions/setting";
import { settingInitialState } from "@/lib/actions/setting-types";
import Portal from "@/components/ui/Portal";
import NotifModal from "@/components/ui/NotifModal";

const BULAN_ID: Record<number, string> = {
  1: "Januari", 2: "Februari", 3: "Maret", 4: "April", 5: "Mei", 6: "Juni",
  7: "Juli", 8: "Agustus", 9: "September", 10: "Oktober", 11: "November", 12: "Desember",
};
function formatBulan(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  return `${BULAN_ID[m]} ${y}`;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex-1 py-3 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white rounded-2xl text-[11px] font-bold uppercase transition shadow-lg hover:shadow-red-500/30"
    >
      {pending ? <i className="fas fa-spinner fa-spin" /> : "Hapus Data"}
    </button>
  );
}

export default function ResetDataModal({ daftarBulan }: { daftarBulan: string[] }) {
  const [open, setOpen] = useState(false);
  const [periode, setPeriode] = useState("");
  const [kelasList, setKelasList] = useState<string[]>([]);
  const [kelasLoading, setKelasLoading] = useState(false);
  const [kelasFilter, setKelasFilter] = useState("");
  const [konf, setKonf] = useState("");
  const [state, formAction] = useActionState(resetDataAction, settingInitialState);
  const [notifOpen, setNotifOpen] = useState(false);

  function bukaModal() {
    setOpen(true);
    setPeriode("");
    setKelasList([]);
    setKelasFilter("");
    setKonf("");
  }

  async function handlePeriodeChange(v: string) {
    setPeriode(v);
    setKelasFilter("");
    if (!v) {
      setKelasList([]);
      return;
    }
    setKelasLoading(true);
    try {
      const res = await fetch(`/api/setting/kelas-by-periode?periode=${encodeURIComponent(v)}`);
      const data = await res.json();
      setKelasList(data.success ? data.kelas : []);
    } catch {
      setKelasList([]);
    } finally {
      setKelasLoading(false);
    }
  }

  return (
    <>
      <div className="section-card p-6 mt-6 border-red-100 dark:border-red-900/30 bg-red-50/30 dark:bg-red-900/5 reveal">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 flex items-center justify-center text-lg">
            <i className="fas fa-radiation" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-gray-800 dark:text-white">Zona Bahaya</h3>
            <p className="text-[10px] text-red-500 dark:text-red-400 uppercase tracking-widest mt-0.5 font-bold">Hapus atau bersihkan data absensi</p>
          </div>
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-5 leading-relaxed">
          Gunakan fitur ini untuk membersihkan data absensi hasil uji coba atau menghapus data lama yang sudah tidak diperlukan. Data yang dihapus tidak dapat dikembalikan.
        </p>
        <button
          onClick={bukaModal}
          className="w-full py-3 bg-white dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 hover:bg-red-600 hover:text-white dark:hover:bg-red-600 dark:hover:text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm"
        >
          <i className="fas fa-trash-alt" /> Bersihkan Database Absensi
        </button>
      </div>

      {open && (
        <Portal>
          <div className="fixed inset-0 z-[999] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
            <div className="bg-white dark:bg-[#1e2235] w-full max-w-[380px] rounded-[2.5rem] p-8 border border-gray-200 dark:border-white/10 shadow-2xl relative text-center">
              <div className="flex justify-center -mt-16 mb-6">
                <div className="w-16 h-16 bg-white dark:bg-[#1e2235] border-4 border-gray-100 dark:border-[#282d45] rounded-full flex items-center justify-center shadow-xl">
                  <i className="fas fa-exclamation-triangle text-red-500 text-xl" />
                </div>
              </div>

              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2">Hapus Data Absensi</h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-6">Pilih periode dulu, kemudian pilih kelas yang ingin dihapus.</p>

              <form
                action={formAction}
                onSubmit={() => {
                  setNotifOpen(true);
                  setOpen(false);
                }}
              >
                <div className="mb-5 text-left">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                    <i className="fas fa-calendar text-emerald-500 mr-1" /> 1️⃣ Pilih Periode:
                  </label>
                  <select
                    name="periode_reset"
                    value={periode}
                    onChange={(e) => handlePeriodeChange(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white rounded-xl text-sm font-bold focus:border-emerald-500 outline-none transition"
                  >
                    <option value="">-- Pilih Periode --</option>
                    <option value="all">Semua Data (Total Reset)</option>
                    {daftarBulan.map((b) => (
                      <option key={b} value={b}>
                        {formatBulan(b)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mb-5 text-left">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                    <i className="fas fa-graduation-cap text-indigo-500 mr-1" /> 2️⃣ Pilih Kelas (Opsional):
                  </label>
                  <select
                    name="kelas_filter"
                    value={kelasFilter}
                    onChange={(e) => setKelasFilter(e.target.value)}
                    disabled={!periode || kelasLoading}
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white rounded-xl text-sm font-bold focus:border-indigo-500 outline-none transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {!periode ? (
                      <option value="">-- Pilih periode terlebih dahulu --</option>
                    ) : kelasLoading ? (
                      <option value="">⏳ Memuat data...</option>
                    ) : kelasList.length === 0 ? (
                      <option value="">❌ Tidak ada data di periode ini</option>
                    ) : (
                      <>
                        <option value="">— Semua Kelas di Periode Ini —</option>
                        {kelasList.map((k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                  <p className="text-[9px] text-gray-400 dark:text-gray-500 mt-1.5 ml-1">
                    <i className="fas fa-info-circle mr-1" /> Hanya menampilkan kelas yang ada data di periode dipilih
                  </p>
                </div>

                <div className="mb-6 text-left">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2">
                    <i className="fas fa-lock text-red-500 mr-1" /> 3️⃣ Ketik &quot;HAPUS&quot; untuk konfirmasi:
                  </label>
                  <input
                    type="text"
                    name="konfirmasi_teks"
                    value={konf}
                    onChange={(e) => setKonf(e.target.value)}
                    placeholder="Ketik HAPUS..."
                    autoComplete="off"
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white rounded-xl text-sm font-bold text-center focus:border-red-500 outline-none transition"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-2xl text-[11px] font-bold uppercase transition"
                  >
                    Batal
                  </button>
                  <SubmitButton />
                </div>
              </form>
            </div>
          </div>
        </Portal>
      )}

      <NotifModal
        open={notifOpen && state.status !== "idle"}
        status={state.status === "ok" ? "ok" : "error"}
        message={state.message}
        onClose={() => setNotifOpen(false)}
      />
    </>
  );
}
