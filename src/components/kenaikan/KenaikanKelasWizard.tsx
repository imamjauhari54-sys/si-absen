"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useModalAction } from "@/lib/hooks/useModalAction";
import { jalankanKenaikanAction, batalkanKenaikanAction } from "@/lib/actions/kenaikan-kelas";
import {
  KONFIRMASI_KENAIKAN,
  LULUS,
  buatPayload,
  kelasTujuanBaru,
  opsiTujuanKelas,
  pengecualianSah,
  petaEfektif,
  ringkasKenaikan,
  tingkatAkhirDefault,
  urutKelas,
  type SiswaKenaikan,
} from "@/lib/utils/kenaikan";
import type { Semester } from "@/lib/utils/tapel";
import type { KenaikanTerakhir } from "@/lib/data/kenaikan-kelas";
import { TambahTapelButton } from "@/components/setting/TapelAktifPanel";
import Portal from "@/components/ui/Portal";
import NotifModal from "@/components/ui/NotifModal";

const labelSemester = (s: string) => (s === "ganjil" ? "Ganjil" : "Genap");

const inputCls =
  "w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white rounded-xl text-sm font-bold focus:border-indigo-500 outline-none transition";

function Modal({ title, icon, onClose, children }: { title: string; icon: string; onClose: () => void; children: ReactNode }) {
  return (
    <Portal>
      <div
        className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div className="bg-white dark:bg-[#1e2235] w-full max-w-[600px] max-h-[88vh] overflow-y-auto rounded-3xl p-6 sm:p-8 border border-gray-200 dark:border-white/10 shadow-2xl">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
              <i className={`fas ${icon} text-indigo-500`} />
            </div>
            <h3 className="text-lg font-extrabold text-gray-800 dark:text-white">{title}</h3>
          </div>
          {children}
        </div>
      </div>
    </Portal>
  );
}

function tanggalIndo(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });
}

export default function KenaikanKelasWizard({
  tapelAktif,
  semesterAktif,
  siswa,
  kelasMaster,
  daftarTapel,
  terakhir,
}: {
  tapelAktif: string;
  semesterAktif: Semester;
  siswa: SiswaKenaikan[];
  kelasMaster: string[];
  /** Semua tahun pelajaran yang sudah dibuat (master), terbaru dulu. */
  daftarTapel: string[];
  terakhir: KenaikanTerakhir | null;
}) {
  const kelasAda = useMemo(() => [...new Set(siswa.map((s) => s.class))].sort(urutKelas), [siswa]);

  const [tapelPilih, setTapelPilih] = useState("");
  const [semester, setSemester] = useState<Semester>("ganjil");
  const [tingkatAkhir, setTingkatAkhir] = useState(() => tingkatAkhirDefault([...kelasAda, ...kelasMaster]));
  const [override, setOverride] = useState<Record<string, string>>({});
  const [pengecualian, setPengecualian] = useState<Record<number, string>>({});
  const [terbuka, setTerbuka] = useState<Record<string, boolean>>({});
  const [konfirmasi, setKonfirmasi] = useState("");

  const jalan = useModalAction(jalankanKenaikanAction);
  const batal = useModalAction(batalkanKenaikanAction);

  const peta = useMemo(() => petaEfektif(kelasAda, override, tingkatAkhir), [kelasAda, override, tingkatAkhir]);
  // Pengecualian yang sudah tidak sah (mis. sesudah "kelas terakhir" diubah) otomatis diabaikan.
  const peng = useMemo(() => pengecualianSah(siswa, pengecualian, tingkatAkhir), [siswa, pengecualian, tingkatAkhir]);
  const ringkas = useMemo(() => ringkasKenaikan(siswa, peta, peng), [siswa, peta, peng]);
  const kelasBaru = useMemo(() => kelasTujuanBaru(siswa, peta, peng, kelasMaster), [siswa, peta, peng, kelasMaster]);
  const opsiKelas = useMemo(
    () =>
      [...new Set([...kelasMaster, ...kelasAda, ...Object.values(peta).filter((v) => v && v !== LULUS)])].sort(urutKelas),
    [kelasMaster, kelasAda, peta]
  );

  // Hanya tahun pelajaran yang SUDAH DIBUAT dan LEBIH BARU dari yang aktif (yang lama tidak ditawarkan).
  const opsiTapel = useMemo(() => daftarTapel.filter((t) => t > tapelAktif).sort(), [daftarTapel, tapelAktif]);
  const tapelTujuan = opsiTapel.includes(tapelPilih) ? tapelPilih : (opsiTapel[0] ?? null);
  const bisaLanjut = siswa.length > 0 && tapelTujuan !== null && ringkas.total.belum === 0;

  const payload = JSON.stringify({
    tapel_tujuan: tapelTujuan ?? "",
    semester,
    jumlah_aktif: siswa.length,
    ...buatPayload(siswa, peta, peng),
  });

  /**
   * Pilihan dropdown. Normalnya hanya DUA: naik ke kelas berikutnya (atau Lulus di tingkat akhir)
   * dan tidak naik. Kelas bernama tidak berangka (mis. "Pelangi") tidak bisa ditebak kelas
   * berikutnya, jadi memakai daftar lengkap.
   */
  function opsi(dari: string, perSiswa: boolean, ikuti?: string): ReactNode {
    const dua = opsiTujuanKelas(dari, tingkatAkhir, kelasMaster);
    const ikutiOpt = perSiswa ? (
      <option value="">Ikuti kelas ({ikuti === LULUS ? "Lulus" : ikuti === dari ? "Tidak naik" : ikuti ? `Naik ke Kelas ${ikuti}` : "belum dipilih"})</option>
    ) : (
      !peta[dari] && <option value="">— pilih tujuan —</option>
    );

    if (dua) {
      // Per siswa: yang sama dengan pilihan kelasnya sudah diwakili "Ikuti kelas", tampilkan sisanya saja.
      const daftar = perSiswa ? dua.filter((o) => o.value !== ikuti) : dua;
      return (
        <>
          {ikutiOpt}
          {daftar.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </>
      );
    }

    return (
      <>
        {ikutiOpt}
        <option value={dari}>Tidak naik (tetap Kelas {dari})</option>
        <option value={LULUS}>Lulus</option>
        {opsiKelas
          .filter((o) => o !== dari)
          .map((o) => (
            <option key={o} value={o}>
              Naik ke Kelas {o}
              {kelasMaster.includes(o) ? "" : " (baru)"}
            </option>
          ))}
      </>
    );
  }

  function ubahPengecualian(id: number, nilai: string) {
    setPengecualian((prev) => {
      const next = { ...prev };
      if (nilai) next[id] = nilai;
      else delete next[id];
      return next;
    });
  }

  function bukaPratinjau() {
    setKonfirmasi("");
    jalan.buka();
  }

  const labelTujuan = (ke: string, dari: string) =>
    !ke ? "belum dipilih" : ke === LULUS ? "Lulus" : ke === dari ? `tetap Kelas ${dari}` : `Kelas ${ke}`;

  return (
    <div className="space-y-6">
      {/* KENAIKAN TERAKHIR */}
      {terakhir && (
        <div className="section-card p-5 reveal shadow-sm border-l-4 border-l-indigo-500">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Kenaikan terakhir</div>
              <div className="text-sm font-extrabold text-gray-800 dark:text-white mt-1">
                {terakhir.tapelAsal} <i className="fas fa-arrow-right text-[10px] mx-1 text-gray-400" /> {terakhir.tapelTujuan}
                <span className="font-medium text-gray-500 dark:text-gray-400"> • semester {labelSemester(terakhir.semesterTujuan)}</span>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {terakhir.naik} naik, {terakhir.tetap} tidak naik, {terakhir.lulus} lulus • {tanggalIndo(terakhir.dibuatPada)}
              </div>
            </div>
            {terakhir.bisaDibatalkan ? (
              <button
                type="button"
                onClick={batal.buka}
                className="px-4 py-2 rounded-xl text-xs font-bold border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition flex items-center gap-2 self-start"
              >
                <i className="fas fa-rotate-left" /> Batalkan
              </button>
            ) : (
              <p className="text-[11px] text-gray-400 max-w-xs">
                Tidak bisa dibatalkan lagi: tahun pelajaran baru sudah dipakai (ada absensi) atau tapel aktif sudah berpindah.
              </p>
            )}
          </div>
        </div>
      )}

      {/* 1. TAHUN AJARAN BARU */}
      <div className="section-card p-5 sm:p-6 reveal shadow-sm">
        <h3 className="text-sm font-extrabold text-gray-800 dark:text-white mb-1">1. Tahun ajaran baru</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Saat ini aktif: <strong>{tapelAktif}</strong> semester {labelSemester(semesterAktif)}. Tahun ajaran tujuan akan menjadi aktif begitu kenaikan dijalankan.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Tahun pelajaran tujuan</label>
            <select
              value={tapelTujuan ?? ""}
              onChange={(e) => setTapelPilih(e.target.value)}
              disabled={opsiTapel.length === 0}
              className={`${inputCls} disabled:opacity-60`}
            >
              {opsiTapel.length === 0 ? (
                <option value="">Belum ada tapel yang lebih baru</option>
              ) : (
                opsiTapel.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))
              )}
            </select>
            {/* Tombol hanya muncul saat dropdown kosong (kondisi yang paling sering di akhir tahun ajaran).
                Kalau tapel tujuan sudah ada, tidak ada alasan menambah tapel lagi dari sini. */}
            {opsiTapel.length === 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <TambahTapelButton daftarTapel={daftarTapel} />
                <span className="text-[11px] text-rose-500 font-semibold">Buat dulu tahun pelajaran setelah {tapelAktif}.</span>
              </div>
            )}
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Semester awal</label>
            <select value={semester} onChange={(e) => setSemester(e.target.value as Semester)} className={inputCls}>
              <option value="ganjil">Ganjil</option>
              <option value="genap">Genap</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Kelas terakhir (lulus)</label>
            <input type="number" value={tingkatAkhir} min={1} max={20} onChange={(e) => setTingkatAkhir(Math.max(1, Number(e.target.value) || 6))} className={`${inputCls} font-mono text-center`} />
            <div className="text-[10px] text-gray-400 mt-1.5">Kelas ini diusulkan Lulus. Usulan bisa diubah per kelas.</div>
          </div>
        </div>
      </div>

      {/* 2. PEMETAAN */}
      <div className="section-card p-5 sm:p-6 reveal shadow-sm">
        <h3 className="text-sm font-extrabold text-gray-800 dark:text-white mb-1">2. Pemetaan kelas</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Setiap kelas hanya punya dua pilihan: naik ke kelas berikutnya (kelas terakhir: Lulus) atau tidak naik. Untuk satu-dua siswa yang berbeda dari kelasnya, buka <strong>Atur per siswa</strong>.
        </p>

        {siswa.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-400">Belum ada siswa aktif.</div>
        ) : (
          <div className="space-y-3">
            {ringkas.perKelas.map((r) => {
              const siswaKelas = siswa.filter((s) => s.class === r.dari);
              const jumlahPeng = siswaKelas.filter((s) => peng[s.id]).length;
              return (
                <div key={r.dari} className="rounded-2xl border border-gray-200 dark:border-gray-700/60 overflow-hidden">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 sm:p-4 bg-gray-50/60 dark:bg-gray-800/40">
                    <div className="sm:w-40">
                      <div className="text-sm font-extrabold text-gray-800 dark:text-white">Kelas {r.dari}</div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400">{r.jumlah} siswa</div>
                    </div>
                    <i className="fas fa-arrow-right text-gray-300 hidden sm:block" />
                    <select
                      value={peta[r.dari] ?? ""}
                      onChange={(e) => setOverride((prev) => ({ ...prev, [r.dari]: e.target.value }))}
                      className={`${inputCls} sm:flex-1 ${!peta[r.dari] ? "border-rose-300 dark:border-rose-700" : ""}`}
                    >
                      {opsi(r.dari, false)}
                    </select>
                    <button
                      type="button"
                      onClick={() => setTerbuka((p) => ({ ...p, [r.dari]: !p[r.dari] }))}
                      className="px-3 py-2 rounded-xl text-[11px] font-bold border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-indigo-400 hover:text-indigo-600 transition flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <i className={`fas ${terbuka[r.dari] ? "fa-chevron-up" : "fa-chevron-down"} text-[9px]`} /> Atur per siswa
                      {jumlahPeng > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px]">{jumlahPeng}</span>}
                    </button>
                  </div>

                  {terbuka[r.dari] && (
                    <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                      {siswaKelas.map((s) => (
                        <div key={s.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-2.5">
                          <div className="sm:flex-1 text-sm text-gray-700 dark:text-gray-200 truncate">{s.name}</div>
                          <select value={peng[s.id] ?? ""} onChange={(e) => ubahPengecualian(s.id, e.target.value)} className={`${inputCls} sm:w-64 !py-1.5 !text-xs ${peng[s.id] ? "border-amber-400 dark:border-amber-600" : ""}`}>
                            {opsi(r.dari, true, peta[r.dari])}
                          </select>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {siswa.length} siswa aktif • <strong className="text-emerald-600">{ringkas.total.naik} naik</strong> •{" "}
            <strong className="text-amber-600">{ringkas.total.tetap} tidak naik</strong> • <strong className="text-indigo-600">{ringkas.total.lulus} lulus</strong>
            {ringkas.total.belum > 0 && <strong className="text-rose-500"> • {ringkas.total.belum} belum dipilih</strong>}
          </div>
          <button
            type="button"
            onClick={bukaPratinjau}
            disabled={!bisaLanjut}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold shadow-lg transition flex items-center justify-center gap-2"
          >
            <i className="fas fa-eye" /> Lihat Pratinjau
          </button>
        </div>
      </div>

      {/* PRATINJAU + KONFIRMASI */}
      {jalan.modalVisible && (
        <Modal title="Pratinjau Kenaikan Kelas" icon="fa-graduation-cap" onClose={jalan.pending ? () => {} : jalan.tutup}>
          <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/50 text-sm font-extrabold text-indigo-700 dark:text-indigo-300 text-center">
            {tapelAktif} <i className="fas fa-arrow-right text-xs mx-2" /> {tapelTujuan} <span className="font-medium"> • semester {labelSemester(semester)}</span>
          </div>

          <div className="mt-4 rounded-2xl border border-gray-200 dark:border-gray-700/60 divide-y divide-gray-100 dark:divide-gray-700/50 text-sm">
            {ringkas.perKelas.map((r) => (
              <div key={r.dari} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="text-gray-700 dark:text-gray-200">
                  <strong>Kelas {r.dari}</strong> <span className="text-gray-400">({r.jumlah})</span> <i className="fas fa-arrow-right text-[10px] mx-1 text-gray-400" />{" "}
                  {labelTujuan(r.ke, r.dari)}
                </div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400 text-right whitespace-nowrap">
                  {[r.naik > 0 && `${r.naik} naik`, r.tetap > 0 && `${r.tetap} tidak naik`, r.lulus > 0 && `${r.lulus} lulus`].filter(Boolean).join(" • ")}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 py-2.5"><div className="text-lg font-extrabold text-emerald-600">{ringkas.total.naik}</div><div className="text-[10px] font-bold text-emerald-700/70 uppercase">Naik</div></div>
            <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 py-2.5"><div className="text-lg font-extrabold text-amber-600">{ringkas.total.tetap}</div><div className="text-[10px] font-bold text-amber-700/70 uppercase">Tidak naik</div></div>
            <div className="rounded-xl bg-indigo-50 dark:bg-indigo-900/20 py-2.5"><div className="text-lg font-extrabold text-indigo-600">{ringkas.total.lulus}</div><div className="text-[10px] font-bold text-indigo-700/70 uppercase">Lulus</div></div>
          </div>

          {ringkas.jumlahPengecualian > 0 && (
            <p className="mt-3 text-[11px] text-amber-700 dark:text-amber-400">
              <i className="fas fa-user-pen mr-1" /> {ringkas.jumlahPengecualian} siswa diatur manual (di luar pemetaan kelasnya).
            </p>
          )}
          {kelasBaru.length > 0 && (
            <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
              <i className="fas fa-plus mr-1" /> Kelas baru yang akan didaftarkan: <strong>{kelasBaru.join(", ")}</strong>.
            </p>
          )}

          <ul className="mt-4 space-y-1.5 text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
            <li><i className="fas fa-circle-info mr-1.5 text-indigo-400" />Tahun pelajaran aktif langsung berpindah: scan QR dan auto-alpha berikutnya tercatat di {tapelTujuan}.</li>
            <li><i className="fas fa-circle-info mr-1.5 text-indigo-400" />Siswa yang lulus berstatus <strong>Lulus</strong>: tidak lagi muncul di daftar aktif dan tidak bisa scan, tapi history-nya tetap ada.</li>
            <li><i className="fas fa-circle-info mr-1.5 text-indigo-400" />History dan rekap tahun lama tetap menampilkan kelas lama.</li>
            <li><i className="fas fa-circle-info mr-1.5 text-indigo-400" />Wali kelas terikat nama kelas, jadi tidak ikut berpindah. Periksa di Manajemen Pengguna setelahnya.</li>
            <li><i className="fas fa-circle-info mr-1.5 text-indigo-400" />Bisa dibatalkan selama {tapelTujuan} belum punya absensi.</li>
          </ul>

          <form action={jalan.formAction} className="mt-5">
            <input type="hidden" name="payload" value={payload} />
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
              Ketik <span className="text-rose-500">{KONFIRMASI_KENAIKAN}</span> untuk melanjutkan
            </label>
            <input
              type="text"
              name="konfirmasi"
              value={konfirmasi}
              onChange={(e) => setKonfirmasi(e.target.value)}
              autoComplete="off"
              placeholder={KONFIRMASI_KENAIKAN}
              className={`${inputCls} text-center tracking-widest`}
            />
            <div className="flex gap-3 mt-5">
              <button type="button" onClick={jalan.tutup} disabled={jalan.pending} className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-60 rounded-2xl text-[11px] font-bold uppercase transition">
                Kembali
              </button>
              <button
                type="submit"
                disabled={jalan.pending || konfirmasi !== KONFIRMASI_KENAIKAN}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl text-[11px] font-bold uppercase transition shadow-lg flex items-center justify-center gap-2"
              >
                {jalan.pending ? "Memproses..." : "Jalankan Kenaikan"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* KONFIRMASI BATAL */}
      {batal.modalVisible && terakhir && (
        <Modal title="Batalkan Kenaikan Kelas?" icon="fa-rotate-left" onClose={batal.pending ? () => {} : batal.tutup}>
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
            Kelas dan status siswa dikembalikan seperti sebelum kenaikan, dan tahun pelajaran aktif kembali ke <strong>{terakhir.tapelAsal}</strong> semester {labelSemester(terakhir.semesterAsal)}.
            Siswa yang kelasnya sudah Anda ubah manual sesudah kenaikan tidak ikut dikembalikan.
          </p>
          <form action={batal.formAction} className="flex gap-3 mt-6">
            <button type="button" onClick={batal.tutup} disabled={batal.pending} className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-60 rounded-2xl text-[11px] font-bold uppercase transition">
              Tidak
            </button>
            <button type="submit" disabled={batal.pending} className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white rounded-2xl text-[11px] font-bold uppercase transition shadow-lg flex items-center justify-center gap-2">
              {batal.pending ? "Memproses..." : "Ya, batalkan"}
            </button>
          </form>
        </Modal>
      )}

      <NotifModal open={jalan.notifOpen} status={jalan.state.status === "ok" ? "ok" : "error"} message={jalan.state.message} onClose={jalan.tutupNotif} autoCloseMs={null} />
      <NotifModal open={batal.notifOpen} status={batal.state.status === "ok" ? "ok" : "error"} message={batal.state.message} onClose={batal.tutupNotif} autoCloseMs={null} />
    </div>
  );
}
