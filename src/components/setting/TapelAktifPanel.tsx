"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useModalAction } from "@/lib/hooks/useModalAction";
import { setPeriodeAktifAction } from "@/lib/actions/tapel";
import { tambahTapelAction } from "@/lib/actions/tapel";
import {
  formatTapel,
  tahunMulaiTapel,
  TAHUN_MULAI_MAX,
  TAHUN_MULAI_MIN,
  type Semester,
} from "@/lib/utils/tapel";
import Portal from "@/components/ui/Portal";
import NotifModal from "@/components/ui/NotifModal";

const labelSemester = (s: string) => (s === "ganjil" ? "Ganjil" : "Genap");

function ModalShell({
  icon,
  title,
  subtitle,
  onClose,
  children,
}: {
  icon: string;
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Portal>
      <div
        className="fixed inset-0 z-[999] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div className="bg-white dark:bg-[#1e2235] w-full max-w-[380px] rounded-[2.5rem] p-8 border border-gray-200 dark:border-white/10 shadow-2xl relative">
          <div className="flex justify-center -mt-16 mb-6">
            <div className="w-16 h-16 bg-white dark:bg-[#1e2235] border-4 border-gray-100 dark:border-[#282d45] rounded-full flex items-center justify-center shadow-xl">
              <i className={`fas ${icon} text-indigo-500 text-xl`} />
            </div>
          </div>
          <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-1 text-center">{title}</h3>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-5 text-center">{subtitle}</p>
          {children}
        </div>
      </div>
    </Portal>
  );
}

function ModalFooter({
  pending,
  disabled,
  label,
  onCancel,
}: {
  pending: boolean;
  disabled?: boolean;
  label: string;
  onCancel: () => void;
}) {
  return (
    <div className="flex gap-3 mt-6">
      <button
        type="button"
        onClick={onCancel}
        disabled={pending}
        className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-60 rounded-2xl text-[11px] font-bold uppercase transition"
      >
        Batal
      </button>
      <button
        type="submit"
        disabled={pending || disabled}
        className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl text-[11px] font-bold uppercase transition shadow-lg flex items-center justify-center gap-2"
      >
        {pending ? <i className="fas fa-spinner fa-spin" /> : label}
      </button>
    </div>
  );
}

const tombolKecil =
  "px-3 py-2 rounded-lg text-[11px] font-bold border transition-all active:scale-95 flex items-center gap-1.5";

// ── TAMBAH TAPEL ────────────────────────────────────────────────────────

export function TambahTapelButton({ daftarTapel }: { daftarTapel: string[] }) {
  const m = useModalAction(tambahTapelAction);
  const [tahun, setTahun] = useState("");

  function buka() {
    const terbaru = daftarTapel[0] ? tahunMulaiTapel(daftarTapel[0]) : null;
    setTahun(String(terbaru !== null ? terbaru + 1 : new Date().getFullYear()));
    m.buka();
  }

  const tahunNum = Number(tahun);
  const valid = Number.isInteger(tahunNum) && tahunNum >= TAHUN_MULAI_MIN && tahunNum <= TAHUN_MULAI_MAX;
  const nama = valid ? formatTapel(tahunNum) : null;
  const sudahAda = nama !== null && daftarTapel.includes(nama);

  return (
    <>
      <button
        type="button"
        onClick={buka}
        className={`${tombolKecil} bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/60 hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600 dark:hover:text-white`}
      >
        <i className="fas fa-plus" /> Tambah Tapel
      </button>

      {m.modalVisible && (
        <ModalShell
          icon="fa-calendar-plus"
          title="Tambah Tahun Pelajaran"
          subtitle="Hanya menambah ke daftar. Tapel aktif tidak berubah."
          onClose={m.pending ? () => {} : m.tutup}
        >
          <form action={m.formAction}>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
              Tahun mulai (Juli)
            </label>
            <input
              type="number"
              name="tahun_mulai"
              value={tahun}
              min={TAHUN_MULAI_MIN}
              max={TAHUN_MULAI_MAX}
              onChange={(e) => setTahun(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white rounded-xl text-sm font-bold text-center font-mono focus:border-indigo-500 outline-none transition"
            />
            <div className="mt-3 p-3 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/50 text-center">
              <div className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Akan ditambahkan</div>
              <div className="text-base font-extrabold text-indigo-700 dark:text-indigo-300 mt-0.5">{nama ?? "—"}</div>
            </div>
            {sudahAda && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2 text-center">
                <i className="fas fa-triangle-exclamation mr-1" /> Tahun pelajaran ini sudah ada di daftar.
              </p>
            )}
            <ModalFooter pending={m.pending} disabled={!valid || sudahAda} label="Tambah" onCancel={m.tutup} />
          </form>
        </ModalShell>
      )}

      <NotifModal
        open={m.notifOpen}
        status={m.state.status === "ok" ? "ok" : "error"}
        message={m.state.message}
        onClose={m.tutupNotif}
      />
    </>
  );
}

// ── GANTI TAPEL / SEMESTER AKTIF ────────────────────────────────────────

function UbahPeriodeButton({
  mode,
  tapelAktif,
  semesterAktif,
  daftarTapel,
}: {
  mode: "tapel" | "semester";
  tapelAktif: string;
  semesterAktif: Semester;
  daftarTapel: string[];
}) {
  const m = useModalAction(setPeriodeAktifAction);
  const [tapelPilih, setTapelPilih] = useState(tapelAktif);
  const [semesterPilih, setSemesterPilih] = useState<Semester>(semesterAktif);

  function buka() {
    setTapelPilih(tapelAktif);
    // Mode semester: tawarkan semester yang BERLAWANAN dengan yang aktif (itulah yang mau diganti).
    setSemesterPilih(mode === "semester" ? (semesterAktif === "ganjil" ? "genap" : "ganjil") : semesterAktif);
    m.buka();
  }

  function pilihTapel(t: string) {
    setTapelPilih(t);
    // Pindah ke tapel yang lebih baru → hampir selalu mulai dari Ganjil.
    setSemesterPilih(t > tapelAktif ? "ganjil" : semesterAktif);
  }

  const tidakBerubah = tapelPilih === tapelAktif && semesterPilih === semesterAktif;
  const memundurkan = tapelPilih < tapelAktif;
  const label =
    mode === "tapel" ? `Aktifkan ${tapelPilih}` : `Aktifkan Semester ${labelSemester(semesterPilih)}`;

  return (
    <>
      <button
        type="button"
        onClick={buka}
        className={`${tombolKecil} bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400`}
      >
        <i className={`fas ${mode === "tapel" ? "fa-right-left" : "fa-calendar-days"}`} />
        {mode === "tapel" ? "Ganti Tapel Aktif" : "Ganti Semester"}
      </button>

      {m.modalVisible && (
        <ModalShell
          icon={mode === "tapel" ? "fa-right-left" : "fa-calendar-days"}
          title={mode === "tapel" ? "Ganti Tapel Aktif" : "Ganti Semester Aktif"}
          subtitle={`Saat ini: ${tapelAktif} • Semester ${labelSemester(semesterAktif)}`}
          onClose={m.pending ? () => {} : m.tutup}
        >
          <form action={m.formAction}>
            {mode === "tapel" ? (
              <div className="mb-4">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                  Tahun Pelajaran
                </label>
                <select
                  name="tapel"
                  value={tapelPilih}
                  onChange={(e) => pilihTapel(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white rounded-xl text-sm font-bold focus:border-indigo-500 outline-none transition"
                >
                  {daftarTapel.map((t) => (
                    <option key={t} value={t}>
                      {t}
                      {t === tapelAktif ? " (aktif)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <input type="hidden" name="tapel" value={tapelAktif} />
            )}

            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Semester</label>
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
                  <div className="px-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-bold text-xs text-center transition-all peer-checked:border-indigo-500 peer-checked:bg-indigo-50 peer-checked:dark:bg-indigo-900/20 peer-checked:text-indigo-600 peer-checked:dark:text-indigo-400 group-hover:border-indigo-300">
                    {labelSemester(opt)}
                  </div>
                </label>
              ))}
            </div>

            {!tidakBerubah && (
              <div className="mt-4 p-3 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/50 text-[11px] text-indigo-700 dark:text-indigo-300 leading-relaxed">
                Mulai sekarang <strong>scan QR dan auto-alpha</strong> akan tercatat di{" "}
                <strong>
                  {tapelPilih} semester {labelSemester(semesterPilih)}
                </strong>
                . Data tapel lain tidak berubah.
              </div>
            )}
            {memundurkan && (
              <div className="mt-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                <i className="fas fa-triangle-exclamation mr-1" /> Anda <strong>memundurkan</strong> tahun pelajaran aktif.
                Scan hari ini akan tercatat di tapel lama. Lanjutkan hanya untuk mengoreksi.
              </div>
            )}
            {mode === "tapel" && tapelPilih > tapelAktif && (
              <p className="mt-3 text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
                <i className="fas fa-info-circle mr-1" /> Untuk memulai tahun ajaran baru beserta kenaikan kelas,
                gunakan{" "}
                <Link href="/kenaikan-kelas" className="font-bold text-indigo-600 dark:text-indigo-400 underline">
                  Kenaikan Kelas
                </Link>{" "}
                (kelas siswa ikut disesuaikan otomatis).
              </p>
            )}

            <ModalFooter pending={m.pending} disabled={tidakBerubah} label={label} onCancel={m.tutup} />
          </form>
        </ModalShell>
      )}

      <NotifModal
        open={m.notifOpen}
        status={m.state.status === "ok" ? "ok" : "error"}
        message={m.state.message}
        onClose={m.tutupNotif}
      />
    </>
  );
}

// ── PANEL ───────────────────────────────────────────────────────────────

/**
 * Tapel & semester aktif (khusus admin). Tapel aktif bersifat GLOBAL — dipakai scan QR
 * dan auto-alpha — jadi diubah lewat modal konfirmasi, bukan input biasa. Filter tapel di
 * Rekap/History terpisah dan tidak mengubah apa pun secara global.
 */
export default function TapelAktifPanel({
  tapel,
  semester,
  daftarTapel,
}: {
  tapel: string;
  semester: Semester;
  daftarTapel: string[];
}) {
  return (
    <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-100 dark:border-indigo-800/50">
      <div className="flex justify-between items-center">
        <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">Tapel Aktif</span>
        <span className="text-xs font-extrabold text-indigo-700 dark:text-indigo-300 text-right">
          {tapel} <span className="mx-0.5">•</span> {labelSemester(semester)}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        <TambahTapelButton daftarTapel={daftarTapel} />
        {daftarTapel.length > 1 && (
          <UbahPeriodeButton mode="tapel" tapelAktif={tapel} semesterAktif={semester} daftarTapel={daftarTapel} />
        )}
        <UbahPeriodeButton mode="semester" tapelAktif={tapel} semesterAktif={semester} daftarTapel={daftarTapel} />
      </div>

      <p className="text-[10px] text-indigo-600/70 dark:text-indigo-400/70 mt-2.5 leading-relaxed">
        <i className="fas fa-info-circle mr-1" /> Berlaku untuk seluruh sekolah: scan QR dan auto-alpha tercatat di
        tapel &amp; semester aktif.
      </p>
    </div>
  );
}
