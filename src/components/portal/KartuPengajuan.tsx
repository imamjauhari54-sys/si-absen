"use client";

import { useEffect, useRef, useState } from "react";
import PinInput from "./PinInput";
import type { PengajuanPortal } from "@/lib/data/pengajuan";
import { STATUS_PENGAJUAN_LABEL } from "@/lib/utils/pengajuan";
import { formatTanggalPendek, GAYA_STATUS, keteranganHari, ringkasRentang } from "@/lib/utils/pengajuan-form";
import { kirimJson, URL_API } from "@/lib/utils/pengajuan-klien";

const NADA: Record<"tunggu" | "baik" | "netral" | "buruk", string> = {
  tunggu: "text-amber-700 dark:text-amber-300",
  baik: "text-emerald-700 dark:text-emerald-300",
  netral: "text-gray-500 dark:text-gray-400",
  buruk: "text-rose-700 dark:text-rose-300",
};

export default function KartuPengajuan({ p, bolehBatal, onSelesai }: { p: PengajuanPortal; bolehBatal: boolean; onSelesai: (pesan: string) => void }) {
  const [konfirmasi, setKonfirmasi] = useState(false);
  const [pin, setPin] = useState("");
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const pagar = useRef(false);
  const pinRef = useRef<HTMLInputElement>(null);
  const fokusPinNanti = useRef(false); // kolom disabled tidak bisa difokuskan: fokus setelah aktif lagi

  useEffect(() => {
    if (!sibuk && fokusPinNanti.current) {
      fokusPinNanti.current = false;
      pinRef.current?.focus();
    }
  }, [sibuk]);

  async function batalkan(e: React.FormEvent) {
    e.preventDefault();
    if (pagar.current) return;
    if (!/^[0-9]{6}$/.test(pin)) return setGalat("PIN 6 digit angka.");
    pagar.current = true;
    setSibuk(true);
    setGalat(null);
    try {
      const r = await kirimJson(URL_API.batal(p.id), { pin });
      if (!r.ok) {
        setGalat(r.pesan);
        if (r.kode?.startsWith("PIN") || r.kode === "TERKUNCI") {
          setPin("");
          fokusPinNanti.current = true;
        }
        return;
      }
      onSelesai(r.pesan || "Pengajuan dibatalkan.");
    } finally {
      setSibuk(false);
      pagar.current = false;
    }
  }

  return (
    <li className="rounded-2xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/40 p-4" data-testid="kartu-pengajuan" data-status={p.status}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-extrabold text-gray-800 dark:text-white">
            {p.jenis === "sakit" ? "Sakit" : "Izin"} · {ringkasRentang(p.tanggalDari, p.tanggalSampai)}
          </div>
          <div className="text-[11px] text-gray-400 mt-0.5">
            Diajukan {formatTanggalPendek(p.diajukanPada.slice(0, 10))}
            {p.adaLampiran && <> · <i className="fas fa-paperclip" /> ada lampiran</>}
          </div>
        </div>
        <span className={`px-2.5 py-1 rounded-full border text-[11px] font-extrabold ${GAYA_STATUS[p.status]}`}>{STATUS_PENGAJUAN_LABEL[p.status]}</span>
      </div>

      {p.hari.length > 0 && (
        <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-700/50 text-xs">
          {p.hari.map((h) => {
            const k = keteranganHari(h, p.status, p.jenis);
            return (
              <li key={h.tanggal} className="flex justify-between gap-3 py-1.5">
                <span className="font-semibold text-gray-600 dark:text-gray-300">{formatTanggalPendek(h.tanggal)}</span>
                <span className={`text-right ${NADA[k.nada]}`}>{k.teks}</span>
              </li>
            );
          })}
        </ul>
      )}

      {p.catatanKeputusan && (
        <div className="mt-3 text-xs rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-700/50 px-3 py-2 text-gray-600 dark:text-gray-300">
          <span className="font-bold">Catatan wali kelas{p.diputuskanNama ? ` (${p.diputuskanNama})` : ""}:</span> {p.catatanKeputusan}
        </div>
      )}

      {p.status === "menunggu" && bolehBatal && (
        <div className="mt-3">
          {!konfirmasi ? (
            <button type="button" onClick={() => setKonfirmasi(true)} className="text-xs font-bold text-rose-600 hover:underline">
              Batalkan pengajuan
            </button>
          ) : (
            <form onSubmit={batalkan} className="rounded-xl border border-rose-100 dark:border-rose-900/40 bg-rose-50/60 dark:bg-rose-950/20 p-3">
              <p className="text-xs text-gray-600 dark:text-gray-300 mb-2">Masukkan PIN untuk membatalkan pengajuan ini.</p>
              <div className="flex flex-wrap items-end gap-2">
                <PinInput id={`bt-pin-${p.id}`} ref={pinRef} value={pin} onChange={setPin} disabled={sibuk} autoFocus />
                <button type="submit" disabled={sibuk} className="h-11 px-4 bg-rose-600 hover:bg-rose-700 disabled:opacity-70 text-white rounded-xl text-sm font-bold">
                  {sibuk ? "Memproses..." : "Ya, batalkan"}
                </button>
                <button type="button" disabled={sibuk} onClick={() => { setKonfirmasi(false); setPin(""); setGalat(null); }}
                  className="h-11 px-4 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-xl text-sm font-bold">
                  Tidak
                </button>
              </div>
              {galat && <p role="alert" className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-400">{galat}</p>}
            </form>
          )}
        </div>
      )}
    </li>
  );
}
