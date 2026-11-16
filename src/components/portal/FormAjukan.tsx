"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PinInput from "./PinInput";
import { ATURAN_PENGAJUAN, type JenisPengajuan } from "@/lib/utils/pengajuan";
import {
  batasTanggalForm, lampiranWajib, tanggalSampaiEfektif, validasiForm,
  type GalatForm, type IsiForm, type KolomForm,
} from "@/lib/utils/pengajuan-form";
import { kirimJson, unggahLampiran, URL_API } from "@/lib/utils/pengajuan-klien";

interface Props {
  hariIni: string;
  liburTanggal: string[];
  onSelesai: (pesan: string) => void;
  onTutup: () => void;
}

const kelasInput = (galat?: string) =>
  `w-full h-11 px-3 bg-gray-50 dark:bg-gray-800/50 border text-gray-800 dark:text-gray-100 rounded-xl text-base focus:ring-2 focus:ring-indigo-500 outline-none ${
    galat ? "border-rose-400" : "border-gray-200 dark:border-gray-700"
  }`;
const kelasLabel = "block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5";

function Galat({ id, pesan }: { id: string; pesan?: string }) {
  if (!pesan) return null;
  return (
    <p id={id} className="mt-1 text-xs font-semibold text-rose-600 dark:text-rose-400">
      {pesan}
    </p>
  );
}

export default function FormAjukan({ hariIni, liburTanggal, onSelesai, onTutup }: Props) {
  const libur = useMemo(() => new Set(liburTanggal), [liburTanggal]);
  const { min, max } = batasTanggalForm(hariIni);

  const [jenis, setJenis] = useState<JenisPengajuan | "">("");
  const [dari, setDari] = useState("");
  const [sampai, setSampai] = useState("");
  const [alasan, setAlasan] = useState("");
  const [pin, setPin] = useState("");
  const [berkas, setBerkas] = useState<File | null>(null);
  const [pratinjau, setPratinjau] = useState<string | null>(null);
  const [galat, setGalat] = useState<GalatForm>({});
  const [galatUmum, setGalatUmum] = useState<string | null>(null);
  const [tahap, setTahap] = useState<null | "unggah" | "kirim">(null);

  const sedangKirim = useRef(false); // pagar klik ganda (state terlambat satu render)
  const pinRef = useRef<HTMLInputElement>(null);
  /** Fokus ke PIN harus menunggu kolom aktif lagi (kolom disabled tidak bisa difokuskan), jadi dilakukan di effect setelah render. */
  const fokusPinNanti = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  /** Hasil unggah yang sudah berhasil: bila pengiriman gagal (mis. PIN salah) dan dicoba lagi, foto TIDAK diunggah ulang. */
  const unggahan = useRef<{ kunci: string; url: string } | null>(null);

  // URL pratinjau dibuat di penangan pilihan berkas (bukan di effect) dan dilepas saat berganti/unmount.
  const urlPratinjau = useRef<string | null>(null);
  useEffect(() => () => { if (urlPratinjau.current) URL.revokeObjectURL(urlPratinjau.current); }, []);

  useEffect(() => {
    if (tahap === null && fokusPinNanti.current) {
      fokusPinNanti.current = false;
      pinRef.current?.focus();
    }
  }, [tahap]);

  const isi: IsiForm = { jenis, dari, sampai, alasan, pin, berkas: berkas ? { type: berkas.type, size: berkas.size } : null };
  const wajibLampiran = lampiranWajib({ jenis, dari, sampai }, libur);
  const sibuk = tahap !== null;

  function fokusKePertama(g: GalatForm) {
    const urut: KolomForm[] = ["jenis", "dari", "sampai", "alasan", "lampiran", "pin"];
    const k = urut.find((x) => g[x]);
    if (k) document.getElementById(`aj-${k}`)?.focus();
  }

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    if (sedangKirim.current) return;
    setGalatUmum(null);
    const g = validasiForm(isi, hariIni, libur);
    setGalat(g);
    if (Object.keys(g).length > 0) return fokusKePertama(g);
    if (jenis === "") return;

    sedangKirim.current = true;
    try {
      let urlLampiran: string | null = null;
      if (berkas) {
        const kunci = `${berkas.name}:${berkas.size}:${berkas.lastModified}`;
        if (unggahan.current?.kunci === kunci) {
          urlLampiran = unggahan.current.url;
        } else {
          setTahap("unggah");
          const r = await unggahLampiran(berkas, pin);
          if (!r.ok) {
            setGalatUmum(r.pesan);
            if (r.kode?.startsWith("PIN") || r.kode === "TERKUNCI") {
              setPin("");
              fokusPinNanti.current = true;
            }
            return;
          }
          unggahan.current = { kunci, url: r.url };
          urlLampiran = r.url;
        }
      }
      setTahap("kirim");
      const r = await kirimJson(URL_API.pengajuan, {
        jenis,
        tanggal_dari: dari,
        tanggal_sampai: tanggalSampaiEfektif({ jenis, dari, sampai }),
        alasan: alasan.trim(),
        ...(urlLampiran ? { lampiran_url: urlLampiran } : {}),
        pin,
      });
      if (!r.ok) {
        setGalatUmum(r.pesan);
        if (r.kode === "PIN_SALAH" || r.kode === "TERKUNCI" || r.kode === "PIN_BELUM_DIATUR") {
          setPin("");
          fokusPinNanti.current = true;
        }
        return;
      }
      onSelesai(r.pesan || "Pengajuan terkirim dan menunggu persetujuan wali kelas.");
    } finally {
      setTahap(null);
      sedangKirim.current = false;
    }
  }

  function pilihBerkas(f: File | null) {
    if (urlPratinjau.current) URL.revokeObjectURL(urlPratinjau.current);
    urlPratinjau.current = f ? URL.createObjectURL(f) : null;
    setPratinjau(urlPratinjau.current);
    setBerkas(f);
    setGalat((x) => ({ ...x, lampiran: undefined }));
  }

  return (
    <form onSubmit={kirim} noValidate className="rounded-2xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/40 dark:bg-indigo-950/20 p-4 sm:p-5 mt-4" aria-label="Form pengajuan izin atau sakit">
      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="sm:col-span-2">
          <legend className={kelasLabel}>Jenis</legend>
          <div className="flex gap-2" role="radiogroup" aria-describedby={galat.jenis ? "aj-jenis-err" : undefined}>
            {(["izin", "sakit"] as const).map((j, i) => (
              <label
                key={j}
                className={`flex-1 sm:flex-none sm:w-36 cursor-pointer text-center px-4 py-2.5 rounded-xl border text-sm font-bold transition ${
                  jenis === j
                    ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                    : "bg-white dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-indigo-300"
                }`}
              >
                <input
                  id={i === 0 ? "aj-jenis" : undefined}
                  type="radio"
                  name="jenis"
                  value={j}
                  checked={jenis === j}
                  disabled={sibuk}
                  onChange={() => {
                    setJenis(j);
                    setGalat((x) => ({ ...x, jenis: undefined }));
                  }}
                  className="sr-only"
                />
                <i className={`fas ${j === "izin" ? "fa-envelope-open-text" : "fa-notes-medical"} mr-1.5`} />
                {j === "izin" ? "Izin" : "Sakit"}
              </label>
            ))}
          </div>
          <Galat id="aj-jenis-err" pesan={galat.jenis} />
          {jenis === "izin" && <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">Izin untuk satu hari. Untuk hari lain, buat pengajuan baru.</p>}
          {jenis === "sakit" && (
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              Sakit maksimal {ATURAN_PENGAJUAN.maksHariSakit} hari per pengajuan. Lebih dari {ATURAN_PENGAJUAN.lampiranWajibLebihDariHari} hari sekolah wajib melampirkan foto surat dokter.
            </p>
          )}
        </fieldset>

        <div>
          <label htmlFor="aj-dari" className={kelasLabel}>{jenis === "sakit" ? "Tanggal mulai" : "Tanggal"}</label>
          <input id="aj-dari" type="date" value={dari} min={min} max={max} disabled={sibuk} aria-invalid={!!galat.dari}
            aria-describedby={galat.dari ? "aj-dari-err" : undefined} onChange={(e) => setDari(e.target.value)} className={kelasInput(galat.dari)} />
          <Galat id="aj-dari-err" pesan={galat.dari} />
        </div>

        {jenis === "sakit" && (
          <div>
            <label htmlFor="aj-sampai" className={kelasLabel}>Tanggal sampai</label>
            <input id="aj-sampai" type="date" value={sampai} min={dari || min} max={max} disabled={sibuk} aria-invalid={!!galat.sampai}
              aria-describedby={galat.sampai ? "aj-sampai-err" : undefined} onChange={(e) => setSampai(e.target.value)} className={kelasInput(galat.sampai)} />
            <Galat id="aj-sampai-err" pesan={galat.sampai} />
          </div>
        )}

        <div className="sm:col-span-2">
          <label htmlFor="aj-alasan" className={kelasLabel}>Alasan</label>
          <textarea id="aj-alasan" rows={3} value={alasan} disabled={sibuk} maxLength={ATURAN_PENGAJUAN.alasanMaks + 50}
            aria-invalid={!!galat.alasan} aria-describedby={galat.alasan ? "aj-alasan-err" : "aj-alasan-info"}
            onChange={(e) => setAlasan(e.target.value)} placeholder="Contoh: Acara keluarga di luar kota"
            className={`${kelasInput(galat.alasan)} h-auto py-2.5 resize-y`} />
          <div className="flex justify-between gap-3">
            <div>
              <Galat id="aj-alasan-err" pesan={galat.alasan} />
              {!galat.alasan && <p id="aj-alasan-info" className="mt-1 text-xs text-gray-500 dark:text-gray-400">Cukup singkat saja. Tidak perlu menulis rincian penyakit.</p>}
            </div>
            <span className={`mt-1 text-xs tabular-nums shrink-0 ${alasan.trim().length > ATURAN_PENGAJUAN.alasanMaks ? "text-rose-600 font-bold" : "text-gray-400"}`}>
              {alasan.trim().length}/{ATURAN_PENGAJUAN.alasanMaks}
            </span>
          </div>
        </div>

        <div className="sm:col-span-2">
          <span className={kelasLabel}>
            Foto surat {wajibLampiran ? <span className="text-rose-600 normal-case tracking-normal font-bold">(wajib)</span> : <span className="normal-case tracking-normal font-normal">(opsional)</span>}
          </span>
          <input ref={fileRef} id="aj-lampiran" type="file" accept="image/jpeg,image/png,image/webp" disabled={sibuk} className="sr-only"
            aria-describedby={galat.lampiran ? "aj-lampiran-err" : undefined}
            onChange={(e) => pilihBerkas(e.target.files?.[0] ?? null)} />
          {berkas && pratinjau ? (
            <div className="flex items-center gap-3 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pratinjau} alt="Pratinjau foto surat" className="w-14 h-14 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-gray-700 dark:text-gray-200 truncate">{berkas.name}</div>
                <div className="text-[11px] text-gray-400">{(berkas.size / 1024).toFixed(0)} KB</div>
              </div>
              <button type="button" disabled={sibuk}
                onClick={() => { pilihBerkas(null); if (fileRef.current) fileRef.current.value = ""; }}
                className="px-3 py-1.5 text-xs font-bold rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 disabled:opacity-50">
                Hapus
              </button>
            </div>
          ) : (
            <button type="button" disabled={sibuk} onClick={() => fileRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 px-4 py-4 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-500 dark:text-gray-400 hover:border-indigo-400 hover:text-indigo-600 transition disabled:opacity-50">
              <i className="fas fa-camera" /> Pilih atau foto surat
              <span className="text-[11px] font-normal opacity-70">JPG, PNG, WebP, maks 5 MB</span>
            </button>
          )}
          <Galat id="aj-lampiran-err" pesan={galat.lampiran} />
        </div>

        <div className="sm:col-span-2">
          <PinInput id="aj-pin" ref={pinRef} value={pin} onChange={setPin} error={galat.pin} disabled={sibuk} label="PIN dari wali kelas" />
        </div>
      </div>

      {galatUmum && (
        <div role="alert" className="mt-4 flex items-start gap-3 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-300 border border-rose-100 dark:border-rose-900/40 rounded-2xl px-4 py-3 text-[13px] font-semibold">
          <i className="fa-solid fa-circle-exclamation mt-0.5" />
          <span>{galatUmum}</span>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <button type="submit" disabled={sibuk}
          className="h-11 px-6 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-70 text-white rounded-xl text-sm font-bold shadow-sm transition active:scale-95 flex items-center gap-2">
          {tahap === "unggah" ? (<><i className="fas fa-circle-notch fa-spin" /> Mengunggah foto...</>)
            : tahap === "kirim" ? (<><i className="fas fa-circle-notch fa-spin" /> Mengirim...</>)
            : (<><i className="fas fa-paper-plane" /> Kirim Pengajuan</>)}
        </button>
        <button type="button" onClick={onTutup} disabled={sibuk}
          className="h-11 px-5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl text-sm font-bold transition disabled:opacity-50">
          Batal
        </button>
      </div>
    </form>
  );
}
