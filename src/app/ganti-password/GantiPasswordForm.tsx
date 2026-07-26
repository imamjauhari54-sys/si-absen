"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function GantiPasswordForm({ wajib }: { wajib: boolean }) {
  const router = useRouter();
  const [passwordLama, setPasswordLama] = useState("");
  const [passwordBaru, setPasswordBaru] = useState("");
  const [konfirmasi, setKonfirmasi] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sukses, setSukses] = useState(false);

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    if (passwordBaru !== konfirmasi) {
      setError("Konfirmasi password baru tidak cocok.");
      return;
    }
    if (passwordBaru.length < 8) {
      setError("Password baru minimal 8 karakter.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("password_lama", passwordLama);
      fd.append("password_baru", passwordBaru);
      const res = await fetch("/api/auth/ganti-password", { method: "POST", body: fd });
      const data = await res.json();

      if (data.status === "ok") {
        setSukses(true);
        setTimeout(() => {
          router.push("/dashboard");
          router.refresh();
        }, 1200);
      } else {
        setError(data.message || "Terjadi kesalahan.");
      }
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setSaving(false);
    }
  }

  if (sukses) {
    return (
      <div className="py-6">
        <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xl">
          <i className="fas fa-check" />
        </div>
        <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">Password berhasil diubah!</p>
        <p className="text-xs text-slate-400 mt-1">Mengarahkan ke dashboard...</p>
      </div>
    );
  }

  return (
    <form onSubmit={simpan} className="space-y-3 text-left">
      {error && (
        <div className="flex items-start gap-2 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-300 border border-rose-100 dark:border-rose-900/40 rounded-xl p-3 text-xs font-semibold">
          <i className="fas fa-circle-exclamation mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div>
        <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5">
          Password Saat Ini
        </label>
        <input
          type="password"
          value={passwordLama}
          onChange={(e) => setPasswordLama(e.target.value)}
          required
          autoComplete="current-password"
          className="w-full px-3 py-2.5 bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 outline-none"
        />
      </div>

      <div>
        <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5">
          Password Baru
        </label>
        <input
          type="password"
          value={passwordBaru}
          onChange={(e) => setPasswordBaru(e.target.value)}
          required
          autoComplete="new-password"
          placeholder="Min. 8 karakter"
          className="w-full px-3 py-2.5 bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 outline-none"
        />
      </div>

      <div>
        <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5">
          Konfirmasi Password Baru
        </label>
        <input
          type="password"
          value={konfirmasi}
          onChange={(e) => setKonfirmasi(e.target.value)}
          required
          autoComplete="new-password"
          className="w-full px-3 py-2.5 bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 outline-none"
        />
      </div>

      <button
        type="submit"
        disabled={saving}
        className="w-full py-3 bg-gradient-to-br from-teal-600 to-cyan-500 hover:opacity-90 disabled:opacity-60 text-white rounded-xl text-sm font-bold shadow-lg shadow-teal-600/20 transition flex items-center justify-center gap-2 mt-2"
      >
        {saving ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-key" />}
        {saving ? "Menyimpan..." : "Simpan Password Baru"}
      </button>

      {!wajib && (
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="w-full py-2.5 text-slate-500 dark:text-slate-400 text-xs font-bold hover:underline"
        >
          Batal, kembali ke Dashboard
        </button>
      )}
    </form>
  );
}
