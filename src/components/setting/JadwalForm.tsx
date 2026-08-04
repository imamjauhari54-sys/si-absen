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

/**
 * Pengganti <input type="time"> bawaan browser.
 *
 * MASALAHNYA: format tampilan <input type="time"> (12 jam AM/PM vs 24 jam)
 * ditentukan oleh BAHASA BROWSER si pengguna (Chrome Settings > Languages),
 * BUKAN oleh atribut lang="id" di halaman. Jadi kalau Chrome admin/guru
 * settingnya bahasa Inggris, input jam bakal kelihatan "06:00 PM" walau
 * datanya sendiri tetap tersimpan benar (18:00) — sekadar salah baca doang,
 * tapi tetap membingungkan buat guru sekolah yang terbiasa format 24 jam.
 *
 * SOLUSI: bikin sendiri 2 kotak angka (jam & menit) yang PASTI 24 jam di
 * browser mana pun, device mana pun, apa pun setting bahasanya — karena ini
 * cuma angka biasa, bukan widget locale-dependent bawaan browser.
 */
function TimeInput24({
  name,
  defaultValue,
  onChange,
}: {
  name: string;
  defaultValue: string; // format "HH:MM"
  onChange?: (value: string) => void;
}) {
  const [h, setH] = useState(defaultValue.slice(0, 2));
  const [m, setM] = useState(defaultValue.slice(3, 5));

  function angkaSaja(raw: string, maks: number) {
    const digit = raw.replace(/\D/g, "").slice(0, 2);
    if (digit === "") return "";
    return String(Math.min(parseInt(digit, 10), maks));
  }

  function ubah(bagian: "h" | "m", raw: string) {
    const v = angkaSaja(raw, bagian === "h" ? 23 : 59);
    if (bagian === "h") setH(v);
    else setM(v);
    const hh = (bagian === "h" ? v : h).padStart(2, "0");
    const mm = (bagian === "m" ? v : m).padStart(2, "0");
    onChange?.(`${hh}:${mm}`);
  }

  return (
    <div className="inp-modern flex items-center gap-1.5 w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus-within:border-indigo-500">
      <input type="hidden" name={name} value={`${h.padStart(2, "0")}:${m.padStart(2, "0")}`} />
      <i className="fas fa-clock text-gray-400 text-xs" />
      <input
        type="text"
        inputMode="numeric"
        maxLength={2}
        value={h}
        onChange={(e) => ubah("h", e.target.value)}
        onBlur={() => h && setH(h.padStart(2, "0"))}
        placeholder="00"
        aria-label="Jam"
        className="w-6 bg-transparent text-center font-mono text-sm font-bold text-gray-800 dark:text-gray-100 outline-none"
      />
      <span className="text-gray-400 font-mono font-bold">:</span>
      <input
        type="text"
        inputMode="numeric"
        maxLength={2}
        value={m}
        onChange={(e) => ubah("m", e.target.value)}
        onBlur={() => m && setM(m.padStart(2, "0"))}
        placeholder="00"
        aria-label="Menit"
        className="w-6 bg-transparent text-center font-mono text-sm font-bold text-gray-800 dark:text-gray-100 outline-none"
      />
      <span className="text-[9px] text-gray-400 font-bold ml-auto tracking-wide">24H</span>
    </div>
  );
}

export default function JadwalForm({
  jamMasuk,
  batasTerlambat,
  jamPulang,
  tapel,
  semester,
  durasiKunciMenit,
  toleransiPagiMenit,
}: {
  jamMasuk: string;
  batasTerlambat: string;
  jamPulang: string;
  tapel: string;
  semester: string;
  durasiKunciMenit: number;
  toleransiPagiMenit: number;
}) {
  const [state, formAction] = useActionState(simpanJadwalAction, settingInitialState);
  const [prevMasuk, setPrevMasuk] = useState(jamMasuk);
  const [prevBatas, setPrevBatas] = useState(batasTerlambat);
  const [prevPulang, setPrevPulang] = useState(jamPulang);
  const [prevDurasiKunci, setPrevDurasiKunci] = useState(durasiKunciMenit);
  const [prevToleransiPagi, setPrevToleransiPagi] = useState(toleransiPagiMenit);
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
              <TimeInput24 name="jam_masuk" defaultValue={jamMasuk} onChange={setPrevMasuk} />
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1.5 ml-1">
                Scan s/d jam ini = <strong className="text-emerald-500">Hadir</strong>
              </p>
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-gray-600 dark:text-gray-300 mb-2">
                <i className="fas fa-clock text-amber-500 opacity-80" /> Batas Terlambat
              </label>
              <TimeInput24 name="batas_terlambat" defaultValue={batasTerlambat} onChange={setPrevBatas} />
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1.5 ml-1">
                Scan lewat batas = <strong className="text-amber-500">Terlambat</strong>
              </p>
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-gray-600 dark:text-gray-300 mb-2">
                <i className="fas fa-door-closed text-indigo-500 opacity-80" /> Jam Pulang Mulai
              </label>
              <TimeInput24 name="jam_pulang" defaultValue={jamPulang} onChange={setPrevPulang} />
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

          <hr className="border-gray-100 dark:border-gray-700/50 my-5" />

          <div className="mb-2">
            <h4 className="text-sm font-extrabold text-gray-800 dark:text-white">Batas Operasional Scan</h4>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-widest mt-0.5">Kapan sistem menolak semua scan</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6 mt-3">
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-gray-600 dark:text-gray-300 mb-2">
                <i className="fas fa-lock text-rose-500 opacity-80" /> Durasi Kunci Sistem (menit)
              </label>
              <input
                type="number"
                min={1}
                name="durasi_kunci_menit"
                defaultValue={durasiKunciMenit}
                onChange={(e) => setPrevDurasiKunci(Number(e.target.value) || 0)}
                className="inp-modern w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-xl font-mono text-sm focus:border-indigo-500 outline-none"
              />
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1.5 ml-1">
                Sistem terkunci total <strong className="text-rose-500">{prevDurasiKunci} menit</strong> setelah <strong>Jam Pulang Mulai</strong>
              </p>
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-gray-600 dark:text-gray-300 mb-2">
                <i className="fas fa-sun text-orange-400 opacity-80" /> Toleransi Buka Pagi (menit)
              </label>
              <input
                type="number"
                min={0}
                name="toleransi_pagi_menit"
                defaultValue={toleransiPagiMenit}
                onChange={(e) => setPrevToleransiPagi(Number(e.target.value) || 0)}
                className="inp-modern w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-xl font-mono text-sm focus:border-indigo-500 outline-none"
              />
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1.5 ml-1">
                Scan absen masuk paling awal boleh <strong className="text-orange-500">{prevToleransiPagi} menit</strong> sebelum <strong>Jam Masuk Sekolah</strong>
              </p>
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
