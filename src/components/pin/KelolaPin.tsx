"use client";

import { useMemo, useRef, useState } from "react";
import type { StatusPinKelas } from "@/lib/data/pengajuan";
import { kirimJson } from "@/lib/utils/pengajuan-klien";
import {
  bacaPinBaru,
  bagiHalaman,
  formatPinTampil,
  gabungPin,
  keadaanPin,
  LABEL_KEADAAN_PIN,
  type PinBaru,
} from "@/lib/utils/cetak-pin";

type Aksi = "buat" | "reset" | "tandai_dibagikan";

export default function KelolaPin({ kelas, siswa }: { kelas: string; siswa: StatusPinKelas[] }) {
  const [daftar, setDaftar] = useState<StatusPinKelas[]>(siswa);
  const [pinBaru, setPinBaru] = useState<PinBaru[]>([]); // hanya di memori halaman ini
  const [dipilih, setDipilih] = useState<Set<number>>(new Set());
  const [pesan, setPesan] = useState<{ jenis: "ok" | "galat"; teks: string } | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [konfirmReset, setKonfirmReset] = useState(false);
  const pagar = useRef(false);

  const pinPerId = useMemo(() => new Map(pinBaru.map((p) => [p.siswaId, p.pin])), [pinBaru]);
  const belumAda = daftar.filter((s) => !s.pinDiatur);

  function centang(id: number) {
    setDipilih((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function semua(centangSemua: boolean) {
    setDipilih(centangSemua ? new Set(daftar.map((s) => s.id)) : new Set());
  }

  async function jalankan(aksi: Aksi, ids: number[]) {
    if (pagar.current || ids.length === 0) return;
    pagar.current = true;
    setSibuk(true);
    setPesan(null);
    setKonfirmReset(false);
    try {
      const r = await kirimJson("/api/pin-ortu", { action: aksi, siswa_ids: ids });
      if (!r.ok) {
        setPesan({ jenis: "galat", teks: r.kode === "SESI" ? "Sesi berakhir. Muat ulang halaman lalu masuk kembali." : r.pesan });
        return;
      }
      const sekarang = new Date().toISOString();
      if (aksi === "tandai_dibagikan") {
        setDaftar((d) => d.map((s) => (ids.includes(s.id) && s.pinDiatur ? { ...s, dibagikanPada: sekarang } : s)));
        setPinBaru((p) => p.filter((x) => !ids.includes(x.siswaId))); // sudah dibagikan: tidak perlu ditampilkan lagi
      } else {
        const baru = bacaPinBaru(r.data.pin);
        const idBaru = new Set(baru.map((b) => b.siswaId));
        setPinBaru((lama) => gabungPin(lama, baru));
        setDaftar((d) =>
          d.map((s) => (idBaru.has(s.id) ? { ...s, pinDiatur: true, dibagikanPada: null, terkunciSampai: null } : s))
        );
      }
      setDipilih(new Set());
      setPesan({ jenis: "ok", teks: r.pesan });
    } finally {
      setSibuk(false);
      pagar.current = false;
    }
  }

  const halaman = bagiHalaman(pinBaru);

  return (
    <div>
      <div className="no-print">
        <div className="section-card shadow-sm p-4 mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={sibuk || belumAda.length === 0}
            onClick={() => jalankan("buat", belumAda.map((s) => s.id))}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-50"
          >
            <i className="fas fa-wand-magic-sparkles mr-2" aria-hidden="true" />Buat PIN untuk yang belum punya ({belumAda.length})
          </button>
          {!konfirmReset ? (
            <button
              type="button"
              disabled={sibuk || dipilih.size === 0}
              onClick={() => setKonfirmReset(true)}
              className="px-4 py-2 rounded-xl border border-amber-300 text-amber-700 dark:text-amber-300 text-sm font-bold disabled:opacity-50"
            >
              Reset PIN terpilih ({dipilih.size})
            </button>
          ) : (
            <span className="flex items-center gap-2 text-xs rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 px-3 py-1.5">
              PIN lama {dipilih.size} siswa langsung tidak berlaku.
              <button type="button" disabled={sibuk} onClick={() => jalankan("reset", [...dipilih])} className="font-extrabold text-amber-800 dark:text-amber-200">Ya, reset</button>
              <button type="button" onClick={() => setKonfirmReset(false)} className="font-bold text-gray-500">Batal</button>
            </span>
          )}
          <button
            type="button"
            disabled={sibuk || dipilih.size === 0}
            onClick={() => jalankan("tandai_dibagikan", [...dipilih])}
            className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-600 dark:text-gray-300 disabled:opacity-50"
          >
            Tandai sudah dibagikan ({dipilih.size})
          </button>
        </div>

        {pesan && (
          <div role={pesan.jenis === "galat" ? "alert" : "status"} className={`mb-4 rounded-xl border px-4 py-2.5 text-sm font-semibold ${pesan.jenis === "galat" ? "border-rose-200 bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:border-rose-800 dark:text-rose-300" : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300"}`}>
            {pesan.teks}
          </div>
        )}

        {pinBaru.length > 0 && (
          <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-4 flex flex-wrap items-center justify-between gap-3" data-testid="panel-pin-baru">
            <p className="text-sm text-amber-900 dark:text-amber-100">
              <strong>{pinBaru.length} PIN baru</strong> siap dicetak. PIN hanya tampil di halaman ini dan <strong>hilang saat halaman ditutup atau dimuat ulang</strong>. Cetak sekarang, lalu tandai sudah dibagikan.
            </p>
            <button type="button" onClick={() => window.print()} className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-extrabold">
              <i className="fas fa-print mr-2" aria-hidden="true" />Cetak slip PIN
            </button>
          </div>
        )}

        <div className="section-card shadow-sm overflow-hidden">
          {daftar.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-gray-400">Tidak ada siswa aktif di kelas ini.</div>
          ) : (
            <table className="w-full text-sm" data-testid="tabel-pin">
              <thead className="bg-gray-50 dark:bg-gray-800/60 text-[11px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="w-10 px-3 py-2.5"><input type="checkbox" aria-label="Pilih semua" checked={dipilih.size === daftar.length} onChange={(e) => semua(e.target.checked)} className="h-4 w-4 accent-indigo-600" /></th>
                  <th className="px-3 py-2.5 text-left">Nama</th>
                  <th className="px-3 py-2.5 text-left">Status PIN</th>
                  <th className="px-3 py-2.5 text-left">PIN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {daftar.map((s) => {
                  const pin = pinPerId.get(s.id);
                  const k = keadaanPin(s, !!pin);
                  return (
                    <tr key={s.id} data-keadaan={k}>
                      <td className="px-3 py-2.5"><input type="checkbox" aria-label={`Pilih ${s.name}`} checked={dipilih.has(s.id)} onChange={() => centang(s.id)} className="h-4 w-4 accent-indigo-600" /></td>
                      <td className="px-3 py-2.5 font-semibold text-gray-800 dark:text-gray-100">{s.name}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-600 dark:text-gray-300">{LABEL_KEADAAN_PIN[k]}</td>
                      <td className="px-3 py-2.5 font-mono font-extrabold tracking-wider text-gray-800 dark:text-gray-100">{pin ? formatPinTampil(pin) : <span className="text-gray-300 dark:text-gray-600">••••••</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Hanya tercetak: slip per siswa, 8 per lembar, dipotong per kotak. */}
      <div className="only-print" aria-hidden="true">
        {halaman.map((lembar, i) => (
          <section key={i} className="slip-halaman">
            {lembar.map((p) => (
              <div key={p.siswaId} className="slip">
                <div className="slip-judul">PIN Portal Absensi Orang Tua</div>
                <div className="slip-nama">{p.nama}</div>
                <div className="slip-kelas">Kelas {p.kelas || kelas}</div>
                <div className="slip-pin">{formatPinTampil(p.pin)}</div>
                <div className="slip-catatan">Rahasiakan PIN ini. Dipakai untuk mengajukan atau membatalkan izin. Bisa diganti di portal.</div>
              </div>
            ))}
          </section>
        ))}
      </div>

      <style>{`
        .only-print { display: none; }
        @media print {
          .no-print { display: none !important; }
          body * { visibility: hidden; }
          .only-print, .only-print * { visibility: visible; }
          .only-print { display: block; position: absolute; inset: 0; background: #fff; color: #000; }
          .slip-halaman { display: grid; grid-template-columns: 1fr 1fr; gap: 0; page-break-after: always; break-after: page; }
          .slip { border: 1px dashed #666; padding: 12mm 8mm; height: 62mm; box-sizing: border-box; break-inside: avoid; }
          .slip-judul { font-size: 9pt; text-transform: uppercase; letter-spacing: .06em; color: #444; }
          .slip-nama { font-size: 13pt; font-weight: 800; margin-top: 3mm; }
          .slip-kelas { font-size: 10pt; color: #333; }
          .slip-pin { font-family: ui-monospace, Menlo, monospace; font-size: 24pt; font-weight: 800; letter-spacing: .15em; margin: 4mm 0; }
          .slip-catatan { font-size: 7.5pt; color: #444; }
        }
      `}</style>
    </div>
  );
}
