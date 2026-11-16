"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { HariPratinjau } from "@/lib/utils/pengajuan";
import { formatTanggalPendek } from "@/lib/utils/pengajuan-form";
import { kirimJson } from "@/lib/utils/pengajuan-klien";
import {
  bangunBodyPutuskan,
  kalimatAkibat,
  keteranganPratinjau,
  MAKS_CATATAN,
  ringkasAkibat,
  validasiKeputusan,
  type ModeKeputusan,
} from "@/lib/utils/keputusan-pengajuan";

const MODE: { nilai: ModeKeputusan; label: string; ikon: string }[] = [
  { nilai: "semua", label: "Setujui semua", ikon: "fa-check-double" },
  { nilai: "sebagian", label: "Setujui sebagian", ikon: "fa-list-check" },
  { nilai: "tolak", label: "Tolak", ikon: "fa-xmark" },
];

export default function KeputusanPengajuan({ id, pratinjau }: { id: number; pratinjau: HariPratinjau[] }) {
  const router = useRouter();
  const semuaHari = pratinjau.map((h) => h.tanggal);
  const [mode, setMode] = useState<ModeKeputusan>("semua");
  const [terpilih, setTerpilih] = useState<Set<string>>(() => new Set(semuaHari));
  const [catatan, setCatatan] = useState("");
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const pagar = useRef(false);

  const akibat = ringkasAkibat(pratinjau, mode, terpilih);

  function ganti(m: ModeKeputusan) {
    setMode(m);
    setGalat(null);
  }
  function centang(t: string) {
    setTerpilih((s) => {
      const n = new Set(s);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      return n;
    });
  }

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    if (pagar.current) return;
    const isi = { mode, terpilih, catatan };
    const salah = validasiKeputusan(isi, semuaHari);
    if (salah) return setGalat(salah);
    pagar.current = true;
    setSibuk(true);
    setGalat(null);
    try {
      const r = await kirimJson(`/api/pengajuan/${id}/putuskan`, bangunBodyPutuskan(isi, semuaHari));
      if (!r.ok) {
        setGalat(r.kode === "SESI" ? "Sesi berakhir. Muat ulang halaman lalu masuk kembali." : r.pesan);
        // 409 = sudah diputuskan/dibatalkan pihak lain: muat ulang agar yang tampil keadaan sebenarnya.
        if (r.status === 409) router.refresh();
        return;
      }
      router.push(`/pengajuan?selesai=${encodeURIComponent(r.pesan || "Keputusan disimpan.")}`);
      router.refresh();
    } finally {
      setSibuk(false);
      pagar.current = false;
    }
  }

  return (
    <form onSubmit={kirim} className="section-card shadow-sm p-5 space-y-4" data-testid="form-keputusan">
      <div role="radiogroup" aria-label="Keputusan" className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {MODE.map((m) => (
          <button
            key={m.nilai}
            type="button"
            role="radio"
            aria-checked={mode === m.nilai}
            onClick={() => ganti(m.nilai)}
            disabled={sibuk}
            className={`rounded-xl border px-3 py-2.5 text-sm font-bold flex items-center justify-center gap-2 transition-colors ${
              mode === m.nilai
                ? m.nilai === "tolak"
                  ? "bg-rose-600 border-rose-600 text-white"
                  : "bg-indigo-600 border-indigo-600 text-white"
                : "bg-white dark:bg-gray-800/40 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-indigo-300"
            }`}
          >
            <i className={`fas ${m.ikon}`} aria-hidden="true" /> {m.label}
          </button>
        ))}
      </div>

      {mode === "sebagian" && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Centang hari yang disetujui. Hari yang tidak dicentang <strong>tidak</strong> otomatis menjadi izin/sakit.
        </p>
      )}

      <ul className="divide-y divide-gray-100 dark:divide-gray-700/50 text-sm rounded-xl border border-gray-100 dark:border-gray-700/50" data-testid="pratinjau-hari">
        {pratinjau.map((h) => {
          const k = keteranganPratinjau(h);
          const setuju = mode === "semua" || (mode === "sebagian" && terpilih.has(h.tanggal));
          return (
            <li key={h.tanggal} className="px-3 py-2.5 flex items-start gap-3" data-tanggal={h.tanggal}>
              {mode === "sebagian" && (
                <input
                  type="checkbox"
                  checked={terpilih.has(h.tanggal)}
                  onChange={() => centang(h.tanggal)}
                  disabled={sibuk}
                  aria-label={`Setujui ${formatTanggalPendek(h.tanggal)}`}
                  className="mt-1 h-4 w-4 accent-indigo-600"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-700 dark:text-gray-200">
                  {formatTanggalPendek(h.tanggal)}
                  {k.ada && <span className="ml-2 text-[11px] font-bold text-gray-500 dark:text-gray-400">Catatan saat ini: {k.ada}</span>}
                </div>
                <div className={`text-xs mt-0.5 ${mode === "tolak" || !setuju ? (h.jikaTidak === "dialpha" ? "text-rose-600 dark:text-rose-300" : "text-gray-500 dark:text-gray-400") : "text-emerald-700 dark:text-emerald-300"}`}>
                  {mode === "tolak" || !setuju ? k.tidak : k.setuju}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <ul className="text-xs text-gray-600 dark:text-gray-300 space-y-0.5" aria-live="polite" data-testid="ringkasan-akibat">
        {kalimatAkibat(akibat).map((t) => (
          <li key={t}>• {t}</li>
        ))}
      </ul>

      <div>
        <label htmlFor="catatan-keputusan" className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">
          Catatan untuk orang tua <span className="font-normal text-gray-400">(opsional)</span>
        </label>
        <textarea
          id="catatan-keputusan"
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          maxLength={MAKS_CATATAN + 50}
          rows={2}
          disabled={sibuk}
          className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
        />
        <div className="text-[10px] text-gray-400 text-right">{catatan.trim().length}/{MAKS_CATATAN}</div>
      </div>

      {galat && (
        <div role="alert" className="text-sm font-semibold text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-900/40 rounded-xl px-3 py-2">
          {galat}
        </div>
      )}

      <button
        type="submit"
        disabled={sibuk}
        className={`w-full sm:w-auto px-6 py-2.5 rounded-xl text-sm font-extrabold text-white disabled:opacity-60 ${mode === "tolak" ? "bg-rose-600 hover:bg-rose-700" : "bg-indigo-600 hover:bg-indigo-700"}`}
      >
        {sibuk ? "Menyimpan…" : mode === "tolak" ? "Tolak pengajuan" : mode === "sebagian" ? "Simpan persetujuan sebagian" : "Setujui semua hari"}
      </button>
    </form>
  );
}
