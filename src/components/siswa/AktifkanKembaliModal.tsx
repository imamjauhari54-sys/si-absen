"use client";

import { useEffect, useState } from "react";
import type { StudentFull } from "@/types";
import Portal from "@/components/ui/Portal";
import { formatTglIndo, todayJakarta } from "@/lib/utils/tanggal";
import {
  MODE_JEDA_DIBUKA,
  kembaliPalingAwal,
  susunDampak,
  type ModeAktifkan,
  type PratinjauAktifkan,
} from "@/lib/utils/aktifkan-kembali";

export interface HasilAktifkanUi {
  status: "ok" | "error";
  message: string;
}

type Muat = { key: string; pratinjau?: PratinjauAktifkan; galat?: string; sudahAktif?: boolean };

/**
 * Modal "Aktifkan Kembali" (migrasi 025): menampilkan DAMPAK dulu (hari yang jadi Alpha / hari jeda),
 * baru admin mengonfirmasi. Semua angka berasal dari pratinjau database, bukan hitungan di browser.
 * Mode B ("Kembali setelah jeda") hanya muncul bila MODE_JEDA_DIBUKA (Langkah 3).
 * Dirender dengan key={siswa.id} oleh induknya, jadi state selalu mulai bersih untuk tiap siswa.
 */
export default function AktifkanKembaliModal({
  siswa,
  onTutup,
  onSelesai,
}: {
  siswa: StudentFull;
  onTutup: () => void;
  onSelesai: (hasil: HasilAktifkanUi) => void;
}) {
  const [mode, setMode] = useState<ModeAktifkan>("batal_pindah");
  const [kembali, setKembali] = useState(() => todayJakarta());
  const [muat, setMuat] = useState<Muat | null>(null);
  const [busy, setBusy] = useState(false);
  const [galatKirim, setGalatKirim] = useState<string | null>(null);

  const kembaliAktif = mode === "kembali_setelah_jeda" ? kembali : "";
  const key = `${siswa.id}|${kembaliAktif}`;
  const memuat = muat?.key !== key;

  useEffect(() => {
    const ctrl = new AbortController();
    const q = kembaliAktif ? `?kembali=${encodeURIComponent(kembaliAktif)}` : "";
    fetch(`/api/siswa/${siswa.id}/aktifkan${q}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => {
        if (d.status === "ok") setMuat({ key, pratinjau: d.pratinjau as PratinjauAktifkan });
        else setMuat({ key, galat: d.message || "Gagal memuat pratinjau.", sudahAktif: d.status === "sudah_aktif" });
      })
      .catch((e) => {
        if (e?.name !== "AbortError") setMuat({ key, galat: "Terjadi kesalahan jaringan." });
      });
    return () => ctrl.abort(); // jawaban lama tidak boleh menimpa pilihan terbaru
  }, [siswa.id, kembaliAktif, key]);

  const pratinjau = !memuat ? muat?.pratinjau : undefined;
  const dampak = pratinjau ? susunDampak(pratinjau, mode, mode === "kembali_setelah_jeda" ? kembali : null) : null;
  const bisaKonfirmasi = !!dampak?.bisaLanjut && !memuat && !busy;

  async function konfirmasi() {
    if (!bisaKonfirmasi) return;
    setBusy(true);
    setGalatKirim(null);
    try {
      const form = new FormData();
      form.set("mode", mode);
      if (mode === "kembali_setelah_jeda") form.set("kembali", kembali);
      const res = await fetch(`/api/siswa/${siswa.id}/aktifkan`, { method: "POST", body: form });
      const d = await res.json();
      if (d.status === "ok") {
        const n = Number(d.hasil?.hari_alpha_diisi ?? 0);
        onSelesai({
          status: "ok",
          message:
            `Siswa "${siswa.name}" berhasil diaktifkan kembali.` +
            (n > 0 ? ` ${n} hari sekolah diisi Alpha; koreksi lewat Edit Manual bila siswa sebenarnya masuk.` : ""),
        });
      } else if (d.status === "sudah_aktif") {
        onSelesai({ status: "ok", message: `Siswa "${siswa.name}" sudah aktif (diaktifkan lebih dulu). Daftar diperbarui.` });
      } else {
        setGalatKirim(d.message || "Gagal mengaktifkan siswa.");
      }
    } catch {
      setGalatKirim("Terjadi kesalahan jaringan.");
    } finally {
      setBusy(false);
    }
  }

  const pilihan: { nilai: ModeAktifkan; judul: string; ket: string }[] = [
    { nilai: "batal_pindah", judul: "Tidak jadi pindah / salah input", ket: "Semua hari dihitung penuh, tanpa jeda." },
  ];
  if (MODE_JEDA_DIBUKA) {
    pilihan.push({
      nilai: "kembali_setelah_jeda",
      judul: "Kembali masuk setelah jeda",
      ket: "Hari jeda tidak dihitung dan tidak tampil; hitungan lanjut dari tanggal kembali.",
    });
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[999] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md"
        onClick={() => !busy && onTutup()}
      >
        <div
          className="bg-white dark:bg-[#1e2235] w-full max-w-[380px] rounded-[2.5rem] p-8 border border-gray-200 dark:border-white/10 shadow-2xl relative"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-center -mt-16 mb-6">
            <div className="w-16 h-16 bg-white dark:bg-[#1e2235] border-4 border-gray-100 dark:border-[#282d45] rounded-full flex items-center justify-center shadow-xl">
              <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-emerald-500/40">
                <i className="fas fa-rotate-left text-sm" />
              </div>
            </div>
          </div>
          <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-1 tracking-tight text-center">Aktifkan Kembali</h3>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 text-center mb-4">
            <strong className="text-gray-700 dark:text-gray-300">{siswa.name}</strong> (Kelas {siswa.class})
          </p>

          {memuat && !muat?.galat && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400 text-center py-6">
              <i className="fas fa-spinner fa-spin mr-2" />
              Menghitung dampak…
            </p>
          )}

          {!memuat && muat?.galat && (
            <div className="space-y-4">
              <p className="text-[11px] text-red-600 dark:text-red-400 text-center leading-relaxed">{muat.galat}</p>
              <button
                onClick={() => (muat.sudahAktif ? onSelesai({ status: "ok", message: muat.galat! }) : onTutup())}
                className="w-full py-3.5 bg-gray-200 dark:bg-[#282d45] text-gray-600 dark:text-gray-400 rounded-2xl text-[10px] font-bold uppercase tracking-widest"
              >
                Tutup
              </button>
            </div>
          )}

          {dampak && pratinjau && (
            <>
              <div className="rounded-2xl bg-gray-50 dark:bg-[#282d45] px-4 py-3 mb-4 text-[11px] font-semibold text-gray-700 dark:text-gray-200 leading-relaxed">
                {dampak.ringkasan}
              </div>

              {pilihan.length > 1 && (
                <div className="space-y-2 mb-4" role="radiogroup" aria-label="Cara mengaktifkan kembali">
                  {pilihan.map((p) => (
                    <label
                      key={p.nilai}
                      className={`block rounded-2xl border px-4 py-3 cursor-pointer text-left transition-all ${
                        mode === p.nilai
                          ? "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-500/10"
                          : "border-gray-200 dark:border-white/10"
                      }`}
                    >
                      <input
                        type="radio"
                        name="mode-aktifkan"
                        className="sr-only"
                        checked={mode === p.nilai}
                        onChange={() => setMode(p.nilai)}
                      />
                      <span className="block text-[11px] font-bold text-gray-800 dark:text-white">{p.judul}</span>
                      <span className="block text-[10px] text-gray-500 dark:text-gray-400">{p.ket}</span>
                    </label>
                  ))}
                </div>
              )}

              {mode === "kembali_setelah_jeda" && (
                <label className="block mb-4 text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                  Tanggal kembali
                  <input
                    type="date"
                    value={kembali}
                    min={kembaliPalingAwal(pratinjau.pindah_pada)}
                    max={todayJakarta()}
                    onChange={(e) => setKembali(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1e2235] px-3 py-2 text-sm font-medium text-gray-800 dark:text-white"
                  />
                  {pratinjau.pindah_pada && (
                    <span className="block mt-1 normal-case tracking-normal font-medium">
                      Harus sesudah {formatTglIndo(pratinjau.pindah_pada)}.
                    </span>
                  )}
                </label>
              )}

              <ul className="mb-4 space-y-2">
                {dampak.peringatan.map((t, i) => (
                  <li
                    key={i}
                    className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 rounded-xl px-3 py-2"
                  >
                    <i className="fas fa-triangle-exclamation mr-1.5 text-[10px]" />
                    {t}
                  </li>
                ))}
              </ul>

              {galatKirim && <p className="text-[11px] text-red-600 dark:text-red-400 mb-3 text-center leading-relaxed">{galatKirim}</p>}

              <div className="flex gap-3">
                <button
                  onClick={onTutup}
                  disabled={busy}
                  className="flex-1 py-3.5 bg-gray-200 dark:bg-[#282d45] hover:bg-gray-300 dark:hover:bg-[#323858] text-gray-600 dark:text-gray-400 rounded-2xl text-[10px] font-bold transition-all uppercase tracking-widest disabled:opacity-60"
                >
                  Batal
                </button>
                <button
                  onClick={konfirmasi}
                  disabled={!bisaKonfirmasi}
                  className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-2xl text-[10px] font-bold transition-all uppercase tracking-widest shadow-lg shadow-emerald-500/20"
                >
                  {busy ? <i className="fas fa-spinner fa-spin" /> : "Ya, Aktifkan"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </Portal>
  );
}
