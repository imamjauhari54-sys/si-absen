"use client";

import { useEffect, useRef, useState } from "react";
import type { ScanDeviceRow } from "@/types";
import Portal from "@/components/ui/Portal";

const POLL_MS = 8000;

const STATUS_CFG: Record<
  ScanDeviceRow["deviceStatus"],
  { dot: string; badge: string; label: string }
> = {
  online: {
    dot: "bg-emerald-500",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    label: "Online",
  },
  idle: {
    dot: "bg-amber-500",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    label: "Idle",
  },
  offline: {
    dot: "bg-gray-400",
    badge: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
    label: "Offline",
  },
};

function formatDurasi(detik: number | null): string {
  if (detik === null) return "belum pernah sync";
  if (detik < 60) return `${detik} detik lalu`;
  const menit = Math.floor(detik / 60);
  if (menit < 60) return `${menit} menit lalu`;
  const jam = Math.floor(menit / 60);
  return `${jam} jam lalu`;
}

export default function DaftarDevice({ initialDevices }: { initialDevices: ScanDeviceRow[] }) {
  const [devices, setDevices] = useState<ScanDeviceRow[]>(initialDevices);
  const [gagalMuat, setGagalMuat] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmHapus, setConfirmHapus] = useState<ScanDeviceRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let hidup = true;
    const ambilData = async () => {
      try {
        const res = await fetch("/api/scan-devices");
        const data = await res.json();
        if (!hidup) return;
        if (data.status === "ok") {
          setDevices(data.data);
          setGagalMuat(false);
        } else {
          setGagalMuat(true);
        }
      } catch {
        if (hidup) setGagalMuat(true);
      }
    };
    const timer = setInterval(ambilData, POLL_MS);
    return () => {
      hidup = false;
      clearInterval(timer);
    };
  }, []);

  function mulaiEdit(d: ScanDeviceRow) {
    setEditId(d.scannerId);
    setEditValue(d.label ?? "");
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function simpanEdit(scannerId: string) {
    setSavingEdit(true);
    try {
      const fd = new FormData();
      fd.append("label", editValue);
      const res = await fetch(`/api/scan-devices/${scannerId}`, { method: "PATCH", body: fd });
      const data = await res.json();
      if (data.status === "ok") {
        setDevices((prev) =>
          prev.map((d) =>
            d.scannerId === scannerId
              ? { ...d, label: editValue.trim() || null, namaTampil: editValue.trim() || d.namaDevice }
              : d
          )
        );
        setEditId(null);
      }
    } finally {
      setSavingEdit(false);
    }
  }

  async function hapusDevice() {
    if (!confirmHapus) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/scan-devices/${confirmHapus.scannerId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.status === "ok") {
        setDevices((prev) => prev.filter((d) => d.scannerId !== confirmHapus.scannerId));
      }
    } finally {
      setDeleting(false);
      setConfirmHapus(null);
    }
  }

  const jumlahOnline = devices.filter((d) => d.deviceStatus === "online").length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 reveal">
        <div className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-gray-400">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          {jumlahOnline} device online sekarang · auto-refresh tiap 8 detik
        </div>
        {gagalMuat && (
          <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider">
            Gagal sinkron, coba lagi...
          </span>
        )}
      </div>

      <div className="section-card shadow-sm overflow-hidden reveal">
        {devices.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <div className="flex flex-col items-center justify-center opacity-60">
              <i className="fas fa-tablet-screen-button text-4xl text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-sm font-bold text-gray-500 dark:text-gray-400">
                Belum ada device yang pernah dipakai scan
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {devices.map((d) => {
              const cfg = STATUS_CFG[d.deviceStatus];
              const sedangEdit = editId === d.scannerId;
              return (
                <div key={d.scannerId} className="px-5 py-4 flex items-center gap-3 group">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-500">
                    <i className="fas fa-tablet-screen-button text-xs" />
                  </div>
                  <div className="min-w-0 flex-1">
                    {sedangEdit ? (
                      <div className="flex items-center gap-2">
                        <input
                          ref={inputRef}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") simpanEdit(d.scannerId);
                            if (e.key === "Escape") setEditId(null);
                          }}
                          placeholder={d.namaDevice}
                          maxLength={60}
                          className="text-sm font-bold bg-gray-50 dark:bg-black/20 border border-indigo-300 dark:border-indigo-700 rounded-lg px-2 py-1 outline-none flex-1 min-w-0 text-gray-700 dark:text-gray-200"
                        />
                        <button
                          onClick={() => simpanEdit(d.scannerId)}
                          disabled={savingEdit}
                          className="text-emerald-500 hover:text-emerald-600 text-xs flex-shrink-0"
                          title="Simpan"
                        >
                          <i className={savingEdit ? "fas fa-spinner fa-spin" : "fas fa-check"} />
                        </button>
                        <button
                          onClick={() => setEditId(null)}
                          className="text-gray-400 hover:text-red-500 text-xs flex-shrink-0"
                          title="Batal"
                        >
                          <i className="fas fa-times" />
                        </button>
                      </div>
                    ) : (
                      <p className="text-sm font-bold text-gray-700 dark:text-gray-200 leading-snug flex items-center gap-2">
                        {d.namaTampil}
                        {d.label && (
                          <span className="text-[9px] font-medium text-gray-400 normal-case">({d.namaDevice})</span>
                        )}
                        <button
                          onClick={() => mulaiEdit(d)}
                          className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-indigo-500 transition-opacity"
                          title="Ganti nama device"
                        >
                          <i className="fas fa-pen text-[10px]" />
                        </button>
                      </p>
                    )}
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 flex items-center gap-1.5 flex-wrap">
                      <span>IP {d.ipAddress}</span>
                      <span>·</span>
                      <span>{d.scanHariIni} scan hari ini</span>
                      <span>·</span>
                      <span>{d.totalScans} total scan</span>
                      <span>·</span>
                      <span>{formatDurasi(d.detikLalu)}</span>
                    </p>
                  </div>
                  {d.antrianOffline > 0 && (
                    <span className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                      <i className="fas fa-cloud-arrow-up" />
                      {d.antrianOffline} antri
                    </span>
                  )}
                  <span
                    className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${cfg.badge}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                    {cfg.label}
                  </span>
                  <button
                    onClick={() => setConfirmHapus(d)}
                    className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity flex-shrink-0"
                    title="Hapus device dari daftar"
                  >
                    <i className="fas fa-trash text-xs" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {confirmHapus && (
        <Portal>
          <div
            className="fixed inset-0 z-[999] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md"
            onClick={() => !deleting && setConfirmHapus(null)}
          >
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
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2 tracking-tight">Hapus Device?</h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed px-2 mb-8">
                <strong className="text-gray-700 dark:text-gray-300">{confirmHapus.namaTampil}</strong> akan hilang
                dari daftar monitoring. Kalau device ini scan lagi, otomatis muncul lagi sebagai device baru.
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
                  onClick={hapusDevice}
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
    </div>
  );
}
