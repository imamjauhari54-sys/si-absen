"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { simpanJadwalAction } from "@/lib/actions/setting";
import { settingInitialState } from "@/lib/actions/setting-types";
import NotifModal from "@/components/ui/NotifModal";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
    >
      {pending ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-save" />}
      {pending ? "Menyimpan..." : "Simpan Pengaturan"}
    </button>
  );
}

export default function JadwalForm({
  jamMasuk,
  batasTerlambat,
  jamPulang,
  tapel,
  semester,
}: {
  jamMasuk: string;
  batasTerlambat: string;
  jamPulang: string;
  tapel: string;
  semester: string;
}) {
  const [state, formAction] = useActionState(simpanJadwalAction, settingInitialState);
  const [prevMasuk, setPrevMasuk] = useState(jamMasuk);
  const [prevBatas, setPrevBatas] = useState(batasTerlambat);
  const [prevPulang, setPrevPulang] = useState(jamPulang);
  const [semesterPilih, setSemesterPilih] = useState(semester);
  const [notifOpen, setNotifOpen] = useState(false);

  return (
    <>
      <form action={formAction} onSubmit={() => setNotifOpen(true)}>
        <div className="section-card p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-lg">
              <i className="fas fa-stopwatch" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-gray-800 dark:text-white">Jadwal Sekolah</h3>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-widest mt-0.5">Waktu penentuan status otomatis</p>
            </div>
          </div>

          <hr className="border-gray-100 dark:border-gray-700/50 my-5" />

          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50 rounded-xl mb-6 shadow-inner">
            <div className="flex-1 text-center border-r border-gray-200 dark:border-gray-700">
              <div className="font-mono text-2xl font-black text-emerald-500 dark:text-emerald-400 tracking-tight leading-none">{prevMasuk}</div>
              <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mt-1.5">Jam Masuk</div>
            </div>
            <div className="flex-1 text-center border-r border-gray-200 dark:border-gray-700">
              <div className="font-mono text-2xl font-black text-amber-500 dark:text-amber-400 tracking-tight leading-none">{prevBatas}</div>
              <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mt-1.5">Batas Telat</div>
            </div>
            <div className="flex-1 text-center">
              <div className="font-mono text-2xl font-black text-indigo-500 dark:text-indigo-400 tracking-tight leading-none">{prevPulang}</div>
              <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mt-1.5">Jam Pulang</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-gray-600 dark:text-gray-300 mb-2">
                <i className="fas fa-door-open text-emerald-500 opacity-80" /> Jam Masuk Sekolah
              </label>
              <input
                type="time"
                name="jam_masuk"
                defaultValue={jamMasuk}
                onChange={(e) => setPrevMasuk(e.target.value)}
                className="inp-modern w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-xl font-mono text-sm focus:border-indigo-500 outline-none"
              />
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1.5 ml-1">
                Scan s/d jam ini = <strong className="text-emerald-500">Hadir</strong>
              </p>
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-gray-600 dark:text-gray-300 mb-2">
                <i className="fas fa-clock text-amber-500 opacity-80" /> Batas Terlambat
              </label>
              <input
                type="time"
                name="batas_terlambat"
                defaultValue={batasTerlambat}
                onChange={(e) => setPrevBatas(e.target.value)}
                className="inp-modern w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-xl font-mono text-sm focus:border-indigo-500 outline-none"
              />
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1.5 ml-1">
                Scan lewat batas = <strong className="text-amber-500">Terlambat</strong>
              </p>
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-gray-600 dark:text-gray-300 mb-2">
                <i className="fas fa-door-closed text-indigo-500 opacity-80" /> Jam Pulang Mulai
              </label>
              <input
                type="time"
                name="jam_pulang"
                defaultValue={jamPulang}
                onChange={(e) => setPrevPulang(e.target.value)}
                className="inp-modern w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-xl font-mono text-sm focus:border-indigo-500 outline-none"
              />
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1.5 ml-1">Batas perpindahan scan masuk ke pulang</p>
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-gray-600 dark:text-gray-300 mb-2">
                <i className="fas fa-graduation-cap text-purple-500 opacity-80" /> Tahun Pelajaran
              </label>
              <input
                type="text"
                name="tapel"
                defaultValue={tapel}
                placeholder="Misal: 2025/2026"
                className="inp-modern w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-xl text-sm focus:border-indigo-500 outline-none font-bold"
              />
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1.5 ml-1">Digunakan untuk informasi cetak/dashboard</p>
            </div>
          </div>

          <div className="mb-6">
            <label className="flex items-center gap-1.5 text-xs font-bold text-gray-600 dark:text-gray-300 mb-2">
              <i className="fas fa-calendar-half text-pink-500 opacity-80" /> Semester Aktif
            </label>
            <div className="grid grid-cols-2 gap-3">
              {(["ganjil", "genap"] as const).map((opt) => (
                <label key={opt} className="relative cursor-pointer group">
                  <input
                    type="radio"
                    name="semester"
                    value={opt}
                    checked={semesterPilih === opt}
                    onChange={() => setSemesterPilih(opt)}
                    className="peer hidden"
                  />
                  <div className="px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-bold text-sm text-center transition-all peer-checked:border-indigo-500 peer-checked:bg-indigo-50 peer-checked:dark:bg-indigo-900/20 peer-checked:text-indigo-600 peer-checked:dark:text-indigo-400 group-hover:border-indigo-300">
                    Semester {opt === "ganjil" ? "Ganjil" : "Genap"}
                  </div>
                </label>
              ))}
            </div>
          </div>

          <SubmitButton />
        </div>
      </form>

      <NotifModal
        open={notifOpen && state.status !== "idle"}
        status={state.status === "ok" ? "ok" : "error"}
        message={state.message}
        onClose={() => setNotifOpen(false)}
      />
    </>
  );
}
