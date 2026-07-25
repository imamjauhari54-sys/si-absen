"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UserRow } from "@/types";
import type { MengajarRow } from "@/lib/data/users";
import UserFormModal from "./UserFormModal";
import NotifModal from "@/components/ui/NotifModal";
import Portal from "@/components/ui/Portal";

const AV_COLORS = [
  "from-indigo-500 to-purple-600",
  "from-blue-500 to-cyan-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-pink-500 to-rose-500",
];

export default function UserTable({
  list,
  search,
  semuaKelas,
  currentUserId,
  mengajarMap,
}: {
  list: UserRow[];
  search: string;
  semuaKelas: string[];
  currentUserId: number;
  mengajarMap: Record<number, MengajarRow[]>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [confirmHapus, setConfirmHapus] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notif, setNotif] = useState<{ status: "ok" | "error"; message: string } | null>(null);

  async function hapusUser() {
    if (!confirmHapus) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/users/${confirmHapus.id}`, { method: "DELETE" });
      const data = await res.json();
      setConfirmHapus(null);
      if (data.status === "ok") {
        setNotif({ status: "ok", message: `Pengguna "${confirmHapus.name}" berhasil dihapus.` });
      } else {
        setNotif({ status: "error", message: data.message || "Gagal menghapus pengguna." });
      }
    } catch {
      setConfirmHapus(null);
      setNotif({ status: "error", message: "Terjadi kesalahan jaringan." });
    } finally {
      setDeleting(false);
    }
  }

  function tutupNotif() {
    const wasSuccess = notif?.status === "ok";
    setNotif(null);
    if (wasSuccess) router.refresh();
  }

  return (
    <>
      <div className="section-card shadow-sm overflow-hidden reveal">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-white/[0.05] flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/20">
          <h3 className="text-sm font-bold text-gray-800 dark:text-white flex items-center gap-2">
            <i className="fas fa-user-shield text-indigo-500" /> Daftar Pengguna
            <span className="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">({list.length} pengguna)</span>
          </h3>
          {search && (
            <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
              <i className="fas fa-filter text-indigo-400" />
              Hasil pencarian: &quot;<strong className="text-gray-700 dark:text-gray-300">{search}</strong>&quot;
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 text-[10px] uppercase tracking-wider font-extrabold border-b border-gray-200 dark:border-gray-700/50">
              <tr>
                <th className="px-5 py-3 w-12 text-center">No</th>
                <th className="px-5 py-3">Pengguna</th>
                <th className="px-5 py-3 text-center">Role</th>
                <th className="px-5 py-3 text-center">Wali Kelas</th>
                <th className="px-5 py-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {list.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-14 text-center">
                    <div className="flex flex-col items-center justify-center opacity-60">
                      <i className="fas fa-user-slash text-4xl text-gray-300 dark:text-gray-600 mb-3" />
                      <p className="text-sm font-bold text-gray-500 dark:text-gray-400">Tidak ada pengguna ditemukan</p>
                      {search && <p className="text-xs text-gray-400 mt-1">Coba kata kunci yang berbeda</p>}
                    </div>
                  </td>
                </tr>
              ) : (
                list.map((u, i) => {
                  const inisial = u.name.charAt(0).toUpperCase();
                  const avColor = AV_COLORS[i % AV_COLORS.length];
                  const isSelf = u.id === currentUserId;
                  return (
                    <tr key={u.id} className="tbl-row text-gray-700 dark:text-gray-300">
                      <td className="px-5 py-3 text-center text-xs font-bold text-gray-400">{i + 1}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`avatar bg-gradient-to-br ${avColor} shadow-sm`}>
                            {u.foto ? <img src={u.foto} className="w-full h-full object-cover" alt={u.name} /> : inisial}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-gray-800 dark:text-gray-200 truncate text-sm flex items-center gap-1.5">
                              {u.name}
                              {isSelf && (
                                <span className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase">
                                  Anda
                                </span>
                              )}
                            </p>
                            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 font-mono">@{u.username}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-center">
                        {u.role === "admin" ? (
                          <span className="inline-flex items-center gap-1.5 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide">
                            <i className="fas fa-shield-halved" /> Admin
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide">
                            <i className="fas fa-chalkboard-teacher" /> Guru
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-center">
                        {u.kelas ? (
                          <span className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/50 px-2.5 py-1 rounded-md text-xs font-bold">
                            {u.kelas}
                          </span>
                        ) : (
                          <span className="text-gray-300 dark:text-gray-600 text-xs">-</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <div className="flex justify-center items-center gap-2">
                          <button
                            onClick={() => setEditing(u)}
                            title="Edit Pengguna"
                            className="w-8 h-8 rounded-lg flex items-center justify-center bg-violet-50 hover:bg-violet-100 dark:bg-violet-900/20 dark:hover:bg-violet-900/40 text-violet-600 dark:text-violet-400 transition"
                          >
                            <i className="fas fa-user-pen text-xs" />
                          </button>
                          <button
                            onClick={() => !isSelf && setConfirmHapus(u)}
                            disabled={isSelf}
                            title={isSelf ? "Tidak bisa hapus akun sendiri" : "Hapus Pengguna"}
                            className="w-8 h-8 rounded-lg flex items-center justify-center bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-500 transition disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-red-50 dark:disabled:hover:bg-red-900/20"
                          >
                            <i className="fas fa-trash text-xs" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <UserFormModal
          mode="edit"
          initialData={editing}
          semuaKelas={semuaKelas}
          currentUserId={currentUserId}
          initialMengajar={mengajarMap[editing.id] ?? []}
          onClose={() => setEditing(null)}
        />
      )}

      {confirmHapus && (
        <Portal>
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md" onClick={() => !deleting && setConfirmHapus(null)}>
          <div
            className="bg-white dark:bg-[#1e2235] w-full max-w-[320px] rounded-[2.5rem] p-8 border border-gray-200 dark:border-white/10 shadow-2xl relative text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center -mt-16 mb-6">
              <div className="w-16 h-16 bg-white dark:bg-[#1e2235] border-4 border-gray-100 dark:border-[#282d45] rounded-full flex items-center justify-center shadow-xl">
                <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-red-500/40">
                  <i className="fas fa-trash text-sm" />
                </div>
              </div>
            </div>
            <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2 tracking-tight">Hapus Pengguna?</h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed px-2 mb-8">
              Akun <strong className="text-gray-700 dark:text-gray-300">{confirmHapus.name}</strong> (@{confirmHapus.username}) akan
              dihapus permanen dan tidak bisa login lagi.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmHapus(null)}
                disabled={deleting}
                className="flex-1 py-3.5 bg-gray-200 dark:bg-[#282d45] hover:bg-gray-300 dark:hover:bg-[#323858] text-gray-600 dark:text-gray-400 rounded-2xl text-[10px] font-bold transition-all uppercase tracking-widest disabled:opacity-60"
              >
                Batal
              </button>
              <button
                onClick={hapusUser}
                disabled={deleting}
                className="flex-1 py-3.5 bg-red-600 hover:bg-red-700 disabled:opacity-70 text-white rounded-2xl text-[10px] font-bold transition-all uppercase tracking-widest shadow-lg shadow-red-500/20"
              >
                {deleting ? <i className="fas fa-spinner fa-spin" /> : "Ya, Hapus"}
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      <NotifModal open={!!notif} status={notif?.status ?? "ok"} message={notif?.message ?? ""} onClose={tutupNotif} />
    </>
  );
}
