"use client";

import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";
import type { ChartBulanan } from "@/lib/data/history";

export default function HistoryChart({ data }: { data: ChartBulanan[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current || data.length === 0) return;

    const isDark = document.documentElement.classList.contains("dark");
    const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
    const labelColor = isDark ? "#94a3b8" : "#64748b";

    chartRef.current?.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      type: "bar",
      data: {
        labels: data.map((d) => d.label),
        datasets: [
          { label: "Hadir", data: data.map((d) => d.hadir), backgroundColor: "rgba(16,185,129,0.80)", borderRadius: 5, borderSkipped: false },
          { label: "Alpha", data: data.map((d) => d.alpha), backgroundColor: "rgba(239,68,68,0.65)", borderRadius: 5, borderSkipped: false },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: isDark ? "#1e2535" : "#0f172a", titleColor: "#fff", bodyColor: "#94a3b8", padding: 10, cornerRadius: 10 },
        },
        scales: {
          x: { grid: { color: gridColor }, ticks: { color: labelColor, font: { size: 10, weight: 600 } } },
          y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: labelColor, font: { size: 10 }, stepSize: 1 } },
        },
      },
    });

    return () => chartRef.current?.destroy();
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-10 opacity-50">
        <i className="fas fa-chart-bar text-3xl text-gray-300 dark:text-gray-600 mb-2" />
        <p className="text-xs text-gray-400">Belum ada data grafik</p>
      </div>
    );
  }

  return (
    <>
      <div style={{ position: "relative", height: 200, flex: 1 }}>
        <canvas ref={canvasRef} />
      </div>
      <div className="flex justify-center gap-4 mt-3">
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500 dark:text-gray-400">
          <span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" /> Hadir
        </span>
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500 dark:text-gray-400">
          <span className="w-3 h-3 rounded-sm bg-red-400 inline-block" /> Alpha
        </span>
      </div>
    </>
  );
}
