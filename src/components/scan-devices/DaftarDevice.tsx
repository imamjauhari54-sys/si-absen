"use client";

import { useEffect, useState } from "react";
import type { ScanDeviceRow } from "@/types";

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
              return (
                <div key={d.scannerId} className="px-5 py-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-500">
                    <i className="fas fa-tablet-screen-button text-xs" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-gray-700 dark:text-gray-200 leading-snug">
                      {d.namaDevice}
                    </p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 flex items-center gap-1.5">
                      <span>IP {d.ipAddress}</span>
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
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
