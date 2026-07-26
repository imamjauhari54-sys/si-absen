"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UserRow } from "@/types";
import type { MengajarRow } from "@/lib/data/users";
import Portal from "@/components/ui/Portal";
import NotifModal from "@/components/ui/NotifModal";
import FotoUploader from "@/components/siswa/FotoUploader";
import KelasPicker from "@/components/ui/KelasPicker";
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- disimpan buat pengembangan berikutnya, lihat catatan di bawah
import GuruMengajarManager from "./GuruMengajarManager";
import { normalizeKelas } from "@/lib/utils/kelas";

function generatePassword(): string {
  const huruf = "abcdefghjkmnpqrstuvwxyz";
  const angka = "23456789";
  let hasil = "";
  for (let i = 0; i < 5; i++) hasil += huruf[Math.floor(Math.random() * huruf.length)];
  for (let i = 0; i < 3; i++) hasil += angka[Math.floor(Math.random() * angka.length)];
  return hasil;
}

export default function UserFormModal({
  mode,
  initialData,
  semuaKelas,
  currentUserId,
  initialMengajar,
  onClose,
}: {
  mode: "create" | "edit";
  initialData?: UserRow;
  semuaKelas: string[];
  currentUserId: number;
  initialMengajar?: MengajarRow[];
  onClose: () => void;
}) {
  const router = useRouter();
  const isSelf = mode === "edit" && initialData?.id === currentUserId;

  const [name, setName] = useState(initialData?.name ?? "");
  const [username, setUsername] = useState(initialData?.username ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [wajibGanti, setWajibGanti] = useState(mode === "create");
  const [role, setRole] = useState<"admin" | "guru">(initialData?.role ?? "guru");
  const [kelas, setKelas] = useState(initialData?.kelas ?? "");
  const [foto, setFoto] = useState(initialData?.foto ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notif, setNotif] = useState<{ status: "ok" | "error"; message: string } | null>(null);

  function pakaiPasswordAcak() {
    const pw = generatePassword();
    setPassword(pw);
    setShowPassword(true);
    setWajibGanti(true);
  }

  async function simpan() {
    if (!name.trim() || !username.trim()) {
      setError("Nama dan username wajib diisi.");
      return;
    }
    if (mode === "create" && !password) {
      setError("Password wajib diisi untuk pengguna baru.");
      return;
    }
    if (password && password.length < 8) {
      setError("Password minimal 8 karakter.");
      return;
    }
    const kelasBersih = normalizeKelas(kelas);
    if (role === "guru" && !kelasBersih) {
      setError("Pilih kelas yang diampu (wali kelas) untuk role Guru.");
      return;
    }
    if (kelasBersih !== kelas) setKelas(kelasBersih);

    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("name", name.trim());
      fd.append("username", username.trim());
      fd.append("password", password);
      fd.append("wajib_ganti_password", wajibGanti ? "1" : "0");
      fd.append("role", role);
      fd.append("kelas", role === "guru" ? kelasBersih : "");
      fd.append("foto", foto.trim());

      const url = mode === "create" ? "/api/users" : `/api/users/${initialData!.id}`;
      const res = await fetch(url, { method: mode === "create" ? "POST" : "PUT", body: fd });
      const data = await res.json();

      if (data.status === "ok") {
        setNotif({
          status: "ok",
          message: mode === "create" ? "Pengguna baru berhasil ditambahkan." : "Perubahan data pengguna berhasil disimpan.",
        });
      } else {
        setError(data.message || "Terjadi kesalahan.");
      }
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setSaving(false);
    }
  }

  function tutupNotif() {
    setNotif(null);
    router.refresh();
    onClose();
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div className="bg-white dark:bg-[#1e2535] rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700/60 w-full max-w-md overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/50 flex justify-between items-center bg-gray-50 dark:bg-gray-800/30">
            <span className="text-xs font-extrabold text-gray-500 dark:text-gray-400 uppercase tracking-widest flex items-center gap-2">
              <i className={`fas ${mode === "create" ? "fa-user-plus" : "fa-user-pen"} text-indigo-500`} />
              {mode === "create" ? "Tambah Pengguna" : "Edit Pengguna"}
            </span>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center bg-gray-200 hover:bg-red-100 dark:bg-gray-700 dark:hover:bg-red-900/40 text-gray-500 hover:text-red-500 transition"
            >
              <i className="fas fa-times text-xs" />
            </button>
          </div>

          <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
            {error && (
              <div className="flex items-start gap-2 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-300 border border-rose-100 dark:border-rose-900/40 rounded-xl p-3 text-xs font-semibold">
                <i className="fas fa-circle-exclamation mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <FotoUploader value={foto} onChange={setFoto} folder="si-absen/users" label="Foto Profil" />

            <div>
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
                Nama Lengkap
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nama pengguna"
                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="cth: budi.guru"
                autoComplete="off"
                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                  {mode === "create" ? "Password" : "Password Baru"}{" "}
                  {mode === "edit" && <span className="normal-case font-normal">(opsional)</span>}
                </label>
                <button
                  type="button"
                  onClick={pakaiPasswordAcak}
                  className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                >
                  <i className="fas fa-dice" /> Buat Acak
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "edit" ? "Biarkan kosong jika tetap" : "Min. 8 karakter"}
                  autoComplete="new-password"
                  className="w-full px-3 py-2.5 pr-10 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-0 top-0 h-full px-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  tabIndex={-1}
                >
                  <i className={`fas ${showPassword ? "fa-eye-slash" : "fa-eye"} text-xs`} />
                </button>
              </div>
              {password && (
                <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={wajibGanti}
                    onChange={(e) => setWajibGanti(e.target.checked)}
                    className="w-3.5 h-3.5 rounded accent-indigo-600"
                  />
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">
                    Wajib ganti password saat login pertama
                  </span>
                </label>
              )}
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
                Role
              </label>
              <div className="grid grid-cols-2 gap-3">
                {(["guru", "admin"] as const).map((r) => (
                  <label key={r} className="relative cursor-pointer group">
                    <input
                      type="radio"
                      name="role"
                      value={r}
                      checked={role === r}
                      disabled={isSelf}
                      onChange={() => setRole(r)}
                      className="peer hidden"
                    />
                    <div
                      className={`px-4 py-2.5 rounded-xl border-2 font-bold text-sm text-center transition-all ${
                        isSelf ? "opacity-50 cursor-not-allowed" : ""
                      } border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 peer-checked:border-indigo-500 peer-checked:bg-indigo-50 peer-checked:dark:bg-indigo-900/20 peer-checked:text-indigo-600 peer-checked:dark:text-indigo-400 group-hover:border-indigo-300`}
                    >
                      {r === "guru" ? "Guru" : "Admin"}
                    </div>
                  </label>
                ))}
              </div>
              {isSelf && (
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5 ml-1">
                  <i className="fas fa-info-circle mr-1" /> Role akun Anda sendiri tidak bisa diubah dari sini.
                </p>
              )}
            </div>

            {role === "guru" && (
              <div>
                <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
                  Wali Kelas
                </label>
                <KelasPicker
                  value={kelas}
                  onChange={setKelas}
                  options={semuaKelas}
                  helperPilih="Guru hanya bisa login sebagai wali kelas dari kelas yang dipilih di sini."
                />
              </div>
            )}

            {/*
              ── Mengajar Mapel Lain (Opsional) ──
              Untuk versi saat ini, field ini dinonaktifkan. Alasan:
              - SI-ABSEN memakai model absensi harian (masuk & pulang), bukan
                absensi per mata pelajaran.
              - Hak akses guru didasarkan pada kelas yang diampu sebagai wali
                kelas (lihat <KelasPicker> "Wali Kelas" di atas), bukan mapel.
              - Informasi mata pelajaran tidak dipakai di proses absensi
                maupun rekap.
              Komponen <GuruMengajarManager> & endpoint API-nya tetap
              dipertahankan di source code sebagai persiapan pengembangan
              versi berikutnya (mis. absensi per mata pelajaran / jurnal
              mengajar), cuma tidak ditampilkan di UI untuk sekarang.

              {mode === "edit" && role === "guru" && initialData && (
                <GuruMengajarManager guruId={initialData.id} semuaKelas={semuaKelas} initialList={initialMengajar ?? []} />
              )}
            */}
          </div>

          <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-700/50 flex gap-3 bg-gray-50 dark:bg-gray-800/30">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl text-sm font-bold transition"
            >
              Batal
            </button>
            <button
              onClick={simpan}
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl text-sm font-bold shadow-sm transition flex items-center justify-center gap-2 active:scale-95"
            >
              {saving ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-save" />}
              {saving ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </div>
      </div>

      <NotifModal open={!!notif} status={notif?.status ?? "ok"} message={notif?.message ?? ""} onClose={tutupNotif} />
    </Portal>
  );
}
