"use client";

import { useRef, useState } from "react";
import PinInput from "./PinInput";
import { kirimJson, URL_API } from "@/lib/utils/pengajuan-klien";

export default function GantiPin({ onSelesai }: { onSelesai: (pesan: string) => void }) {
  const [buka, setBuka] = useState(false);
  const [lama, setLama] = useState("");
  const [baru, setBaru] = useState("");
  const [ulang, setUlang] = useState("");
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const pagar = useRef(false);

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    if (pagar.current) return;
    if (!/^[0-9]{6}$/.test(lama) || !/^[0-9]{6}$/.test(baru)) return setGalat("PIN harus 6 digit angka.");
    if (baru !== ulang) return setGalat("Ulangi PIN baru dengan benar: kedua isian tidak sama.");
    if (baru === lama) return setGalat("PIN baru harus berbeda dari PIN lama.");
    pagar.current = true;
    setSibuk(true);
    setGalat(null);
    try {
      const r = await kirimJson(URL_API.pin, { pin_lama: lama, pin_baru: baru });
      if (!r.ok) return setGalat(r.pesan);
      setBuka(false);
      setLama(""); setBaru(""); setUlang("");
      onSelesai(r.pesan || "PIN berhasil diganti.");
    } finally {
      setSibuk(false);
      pagar.current = false;
    }
  }

  if (!buka) {
    return (
      <button type="button" onClick={() => setBuka(true)} className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
        <i className="fas fa-key mr-1" /> Ganti PIN
      </button>
    );
  }
  return (
    <form onSubmit={simpan} className="rounded-2xl border border-gray-200 dark:border-gray-700/60 bg-gray-50/60 dark:bg-gray-800/30 p-4" aria-label="Ganti PIN">
      <div className="flex flex-wrap gap-3 items-start">
        <PinInput id="gp-lama" value={lama} onChange={setLama} disabled={sibuk} label="PIN lama" autoFocus />
        <PinInput id="gp-baru" value={baru} onChange={setBaru} disabled={sibuk} label="PIN baru" />
        <PinInput id="gp-ulang" value={ulang} onChange={setUlang} disabled={sibuk} label="Ulangi PIN baru" />
      </div>
      <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">Hindari PIN yang mudah ditebak seperti 123456 atau 111111.</p>
      {galat && <p role="alert" className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-400">{galat}</p>}
      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={sibuk} className="h-10 px-5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-70 text-white rounded-xl text-sm font-bold">
          {sibuk ? "Menyimpan..." : "Simpan PIN"}
        </button>
        <button type="button" disabled={sibuk} onClick={() => { setBuka(false); setGalat(null); setLama(""); setBaru(""); setUlang(""); }}
          className="h-10 px-4 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-xl text-sm font-bold">
          Batal
        </button>
      </div>
    </form>
  );
}
