"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import jsQR from "jsqr";

const AJAX_SCAN = "/api/absen/scan";
const AJAX_CARI = "/api/absen/cari";
const OFFLINE_KEY = "si_absen_offline_queue_";
const SCANNER_ID_KEY = "si_absen_scanner_id";

const SCAN_CONFIG = {
  ROI_SCALE: 0.6,
  SCAN_INTERVAL: 100,
  CANVAS_SCALE: 0.75,
};

type NotifType = "hadir" | "terlambat" | "pulang" | "sudah" | "error" | "offline";

interface NotifState {
  show: boolean;
  type: NotifType;
  icon: string;
  nama: string;
  info: string;
  kelas: string;
}

interface OfflineItem {
  token: string | null;
  siswa_id: number | null;
  manual: boolean;
  nama: string;
  timestamp: string;
}

interface SiswaCari {
  id: number;
  name: string;
  class: string;
}

/** ID scanner persisten per perangkat, dibuat sekali & disimpan di localStorage (pengganti md5(userAgent+ip) di PHP yang server-side). Di-cache di module scope (bukan ref) supaya aman dibaca saat render. */
let cachedScannerId: string | null = null;
function getScannerId(): string {
  if (cachedScannerId) return cachedScannerId;
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem(SCANNER_ID_KEY);
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`).replace(/-/g, "");
    localStorage.setItem(SCANNER_ID_KEY, id);
  }
  cachedScannerId = id;
  return id;
}

export default function ScannerClient({ namaSekolah }: { namaSekolah: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const roiCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const notifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processingRef = useRef<string | null>(null);
  const lastScanAtRef = useRef(0);
  const frameCountRef = useRef(0);
  const syncingRef = useRef(false);

  const [jam, setJam] = useState("00:00:00");
  const [online, setOnline] = useState(() => (typeof navigator !== "undefined" ? navigator.onLine : true));
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [paused, setPaused] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [cnt, setCnt] = useState({ hadir: 0, terlambat: 0, pulang: 0 });
  const [notif, setNotif] = useState<NotifState>({
    show: false,
    type: "hadir",
    icon: "✅",
    nama: "",
    info: "",
    kelas: "",
  });
  const [flash, setFlash] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualQuery, setManualQuery] = useState("");
  const [manualResults, setManualResults] = useState<SiswaCari[] | null>(null);
  const [manualLoading, setManualLoading] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [syncQueueLen, setSyncQueueLen] = useState(() => {
    if (typeof window === "undefined") return 0;
    const raw = localStorage.getItem(OFFLINE_KEY + getScannerId());
    return raw ? (JSON.parse(raw) as unknown[]).length : 0;
  });
  const [camError, setCamError] = useState<string | null>(null);

  // ─────────────────────────────────────────────
  // JAM REALTIME
  // ─────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setJam(new Date().toTimeString().slice(0, 8)), 1000);
    return () => clearInterval(t);
  }, []);

  // Canvas ROI in-memory untuk crop area scan sebelum di-decode jsQR (tidak pernah dirender ke DOM).
  useEffect(() => {
    roiCanvasRef.current = document.createElement("canvas");
  }, []);

  // ─────────────────────────────────────────────
  // NOTIFIKASI
  // ─────────────────────────────────────────────
  const showNotif = useCallback((type: NotifType, icon: string, nama: string, info: string, kelas = "") => {
    setNotif({ show: true, type, icon, nama, info, kelas });
    if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
    notifTimerRef.current = setTimeout(() => setNotif((n) => ({ ...n, show: false })), 4000);
  }, []);

  // ─────────────────────────────────────────────
  // SUARA (Web Audio API, tanpa file eksternal)
  // ─────────────────────────────────────────────
  const initAudio = useCallback(() => {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new Ctx();
    }
  }, []);

  const playBeep = useCallback(
    (type: "success" | "error" | "offline" = "success") => {
      if (!soundEnabled || !audioCtxRef.current) return;
      try {
        const ctx = audioCtxRef.current;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        if (type === "success") {
          osc.frequency.value = 800;
          gain.gain.setValueAtTime(0.3, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
          osc.start(now);
          osc.stop(now + 0.2);
        } else if (type === "error") {
          osc.frequency.value = 300;
          gain.gain.setValueAtTime(0.3, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
          osc.start(now);
          osc.stop(now + 0.3);
        } else {
          osc.frequency.setValueAtTime(600, now);
          osc.frequency.setValueAtTime(400, now + 0.1);
          gain.gain.setValueAtTime(0.2, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
          osc.start(now);
          osc.stop(now + 0.2);
        }
      } catch {
        // abaikan error audio, tidak kritikal
      }
    },
    [soundEnabled]
  );

  // ─────────────────────────────────────────────
  // OFFLINE QUEUE (localStorage, disinkronkan tiap 30 detik / saat online kembali)
  // ─────────────────────────────────────────────
  const getQueue = useCallback((): OfflineItem[] => {
    const raw = localStorage.getItem(OFFLINE_KEY + getScannerId());
    return raw ? JSON.parse(raw) : [];
  }, []);

  const setQueue = useCallback((q: OfflineItem[]) => {
    localStorage.setItem(OFFLINE_KEY + getScannerId(), JSON.stringify(q));
    setSyncQueueLen(q.length);
  }, []);

  const addToQueue = useCallback(
    (item: Omit<OfflineItem, "timestamp">) => {
      const q = getQueue();
      q.push({ ...item, timestamp: new Date().toISOString() });
      setQueue(q);
    },
    [getQueue, setQueue]
  );

  const syncOfflineData = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return;
    syncingRef.current = true;
    setSyncing(true);
    const q = getQueue();

    while (q.length > 0) {
      const item = q[0];
      try {
        const fd = new FormData();
        if (item.token) fd.append("token", item.token);
        if (item.siswa_id) fd.append("siswa_id", String(item.siswa_id));
        if (item.manual) fd.append("manual", "1");
        fd.append("scanner_id", getScannerId());

        const res = await fetch(AJAX_SCAN, { method: "POST", body: fd });
        if (!res.ok) break;
        q.shift();
        setQueue([...q]);
      } catch {
        break;
      }
    }

    syncingRef.current = false;
    setSyncing(false);
  }, [getQueue, setQueue]);

  // ─────────────────────────────────────────────
  // ONLINE / OFFLINE STATE
  // ─────────────────────────────────────────────
  useEffect(() => {
    function handleOnline() {
      setOnline(true);
      syncOfflineData();
    }
    function handleOffline() {
      setOnline(false);
      showNotif("offline", "📡", "Mode Offline", "Data akan disinkronkan otomatis");
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    const syncInterval = setInterval(syncOfflineData, 30000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(syncInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─────────────────────────────────────────────
  // HASIL SCAN
  // ─────────────────────────────────────────────
  const handleResult = useCallback(
    (d: { status: string; nama?: string; kelas?: string; jam?: string; keterangan?: string; message?: string }) => {
      if (d.status === "hadir") {
        setCnt((c) => ({ ...c, hadir: c.hadir + 1 }));
        showNotif("hadir", "✅", d.nama ?? "-", `Hadir · ${d.jam}`, d.kelas ?? "");
        playBeep("success");
      } else if (d.status === "terlambat") {
        setCnt((c) => ({ ...c, terlambat: c.terlambat + 1 }));
        showNotif("terlambat", "⏰", d.nama ?? "-", `Terlambat · ${d.jam}`, d.kelas ?? "");
        playBeep("success");
      } else if (d.status === "pulang") {
        setCnt((c) => ({ ...c, pulang: c.pulang + 1 }));
        showNotif("pulang", "🏠", d.nama ?? "-", `Pulang · ${d.jam}`, d.kelas ?? "");
        playBeep("success");
      } else if (d.status === "sudah" || d.status === "ignore") {
        showNotif("sudah", "📋", d.nama ?? "-", d.keterangan ?? d.message ?? "Sudah absen", "");
        playBeep("success");
      } else {
        showNotif("error", "❌", "Gagal", d.message ?? "Error");
        playBeep("error");
      }
    },
    [playBeep, showNotif]
  );

  // ─────────────────────────────────────────────
  // PROSES QR
  // ─────────────────────────────────────────────
  const doFlash = useCallback(() => {
    setFlash(true);
    setTimeout(() => setFlash(false), 200);
  }, []);

  const prosesQR = useCallback(
    async (raw: string) => {
      if (processingRef.current) return;
      processingRef.current = raw;

      const token = raw.startsWith("SIELISA:") ? raw : `SIELISA:${raw}`;

      doFlash();
      try {
        navigator.vibrate?.([80, 40, 80]);
      } catch {
        // abaikan, tidak semua perangkat dukung vibrate
      }

      try {
        const fd = new FormData();
        fd.append("token", token);
        fd.append("scanner_id", getScannerId());

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(AJAX_SCAN, { method: "POST", body: fd, signal: controller.signal });
        clearTimeout(timeoutId);

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = await res.json();
        handleResult(d);
      } catch {
        if (navigator.onLine) {
          showNotif("error", "❌", "Error", "Gagal menghubungi server");
          playBeep("error");
        } else {
          addToQueue({ token, siswa_id: null, manual: false, nama: "Scan Offline" });
          showNotif("offline", "📡", "Offline Mode", "Data disimpan untuk disinkronkan");
          playBeep("offline");
        }
      } finally {
        setTimeout(() => {
          processingRef.current = null;
        }, 2000);
      }
    },
    [addToQueue, doFlash, handleResult, playBeep, showNotif]
  );

  // ─────────────────────────────────────────────
  // KAMERA & SCAN LOOP
  // ─────────────────────────────────────────────
  const doScan = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const roiCanvas = roiCanvasRef.current;
    if (!video || !canvas || !roiCanvas) return;
    if (paused || video.readyState !== video.HAVE_ENOUGH_DATA) return;

    frameCountRef.current++;

    const ctx = canvas.getContext("2d", { willReadFrequently: true, alpha: false });
    const roiCtx = roiCanvas.getContext("2d", { willReadFrequently: true, alpha: false });
    if (!ctx || !roiCtx) return;

    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const roiX = (canvas.width - roiCanvas.width) / 2;
      const roiY = (canvas.height - roiCanvas.height) / 2;
      roiCtx.drawImage(canvas, roiX, roiY, roiCanvas.width, roiCanvas.height, 0, 0, roiCanvas.width, roiCanvas.height);

      const imageData = roiCtx.getImageData(0, 0, roiCanvas.width, roiCanvas.height);
      // grayscale, mempercepat deteksi jsQR
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        data[i] = avg;
        data[i + 1] = avg;
        data[i + 2] = avg;
      }
      roiCtx.putImageData(imageData, 0, 0);

      const finalData = roiCtx.getImageData(0, 0, roiCanvas.width, roiCanvas.height);
      const qr = jsQR(finalData.data, finalData.width, finalData.height, { inversionAttempts: "attemptBoth" });

      if (qr?.data) {
        const now = Date.now();
        if (processingRef.current !== qr.data || now - lastScanAtRef.current > 1500) {
          lastScanAtRef.current = now;
          prosesQR(qr.data);
        }
      }
    } catch {
      // frame gagal diproses, lanjut ke frame berikutnya
    }
  }, [paused, prosesQR]);

  const scanLoop = useCallback(() => {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    scanIntervalRef.current = setInterval(doScan, SCAN_CONFIG.SCAN_INTERVAL);
  }, [doScan]);

  const startCam = useCallback(async () => {
    setCamError(null);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 640, max: 800 },
          height: { ideal: 480, max: 600 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: false,
      });

      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();

      const initCanvas = () => {
        const canvas = canvasRef.current;
        const roiCanvas = roiCanvasRef.current;
        if (!canvas || !roiCanvas) return;
        const W = Math.floor(video.videoWidth * SCAN_CONFIG.CANVAS_SCALE);
        const H = Math.floor(video.videoHeight * SCAN_CONFIG.CANVAS_SCALE);
        canvas.width = W;
        canvas.height = H;
        const roiSize = Math.min(W, H);
        roiCanvas.width = Math.floor(roiSize * SCAN_CONFIG.ROI_SCALE);
        roiCanvas.height = roiCanvas.width;
      };
      video.addEventListener("canplay", initCanvas, { once: true });
      scanLoop();
    } catch (e) {
      setCamError(e instanceof Error ? e.message : "Tidak bisa mengakses kamera");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  useEffect(() => {
    initAudio();
    const resumeAudio = () => {
      if (audioCtxRef.current?.state === "suspended") audioCtxRef.current.resume();
    };
    document.addEventListener("click", resumeAudio);
    // startCam async & setState-nya terjadi setelah await getUserMedia, bukan cascading render sinkron.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    startCam();

    return () => {
      document.removeEventListener("click", resumeAudio);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
      if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  function switchCam() {
    setFacing((f) => (f === "environment" ? "user" : "environment"));
  }

  function togglePause() {
    if (processingRef.current) {
      showNotif("sudah", "⏳", "Tunggu", "Sedang memproses...");
      return;
    }
    setPaused((p) => {
      const next = !p;
      if (next) {
        if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
      } else {
        scanLoop();
      }
      return next;
    });
  }

  function toggleSound() {
    setSoundEnabled((s) => {
      const next = !s;
      if (next) {
        initAudio();
        showNotif("hadir", "🔔", "Pengaturan", "Suara: AKTIF");
      } else {
        showNotif("error", "🔕", "Pengaturan", "Suara: DIMATIKAN");
      }
      return next;
    });
  }

  // ─────────────────────────────────────────────
  // ABSEN MANUAL
  // ─────────────────────────────────────────────
  function bukaManual() {
    setManualOpen(true);
    setManualQuery("");
    setManualResults(null);
    setConfirmId(null);
  }

  function tutupManual() {
    setManualOpen(false);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
  }

  async function cariSiswa(q: string) {
    setManualLoading(true);
    try {
      const res = await fetch(`${AJAX_CARI}?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list: SiswaCari[] = await res.json();
      setManualResults(list);
    } catch {
      setManualResults([]);
    } finally {
      setManualLoading(false);
    }
  }

  function handleSearchInput(v: string) {
    setManualQuery(v);
    setConfirmId(null);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const trimmed = v.trim();
    if (trimmed.length < 2) {
      setManualResults(null);
      return;
    }
    searchTimerRef.current = setTimeout(() => cariSiswa(trimmed), 400);
  }

  async function absenManual(id: number, nama: string) {
    if (!navigator.onLine) {
      addToQueue({ token: null, siswa_id: id, manual: true, nama });
      tutupManual();
      showNotif("offline", "📡", nama, "Disimpan untuk offline");
      playBeep("offline");
      return;
    }

    try {
      const fd = new FormData();
      fd.append("siswa_id", String(id));
      fd.append("manual", "1");
      fd.append("scanner_id", getScannerId());

      const res = await fetch(AJAX_SCAN, { method: "POST", body: fd });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      tutupManual();
      handleResult({ ...d, nama: d.nama ?? nama, kelas: d.kelas ?? "" });
    } catch {
      showNotif("error", "❌", "Gagal", "Kesalahan jaringan");
      playBeep("error");
    }
  }

  function klikAbsenManual(s: SiswaCari) {
    if (confirmId !== s.id) {
      setConfirmId(s.id);
      setTimeout(() => setConfirmId((c) => (c === s.id ? null : c)), 3000);
      return;
    }
    setConfirmId(null);
    absenManual(s.id, s.name);
  }

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────
  return (
    <div id="scanner-app">
      {!online && (
        <div className="offline-banner show">
          <i className="fas fa-wifi" /> Offline Mode - Data akan disinkronkan saat terhubung
        </div>
      )}

      <div id="topbar">
        <div className="topbar-left">
          <div className="topbar-brand">
            <div className="topbar-logo">📋</div>
            <div className="topbar-info">
              <div className="topbar-title">SI-ABSEN</div>
              <div className="topbar-sub">Scanner</div>
            </div>
          </div>
          <div className="topbar-divider" />
          <div className="topbar-school">
            <span className="live-dot" />
            {namaSekolah}
          </div>
        </div>

        <div className="topbar-right">
          <div className={`status-badge ${online ? "online" : "offline"}`}>
            <span className={`status-dot ${online ? "online" : "offline"}`} />
            <span>{online ? "Online" : "Offline"}</span>
          </div>
          <div id="topbar-jam">{jam}</div>
          <Link href="/dashboard" className="topbar-btn">
            <i className="fas fa-arrow-left" /> Kembali
          </Link>
        </div>
      </div>

      <div id="video-wrap">
        <video ref={videoRef} id="video" playsInline autoPlay muted />
        <canvas ref={canvasRef} id="canvas" style={{ display: "none" }} />
        <div className="vignette" />

        <div className="scan-overlay">
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2.5rem" }}>
            <div className="scan-frame">
              <div className="sf-corner sf-tl" />
              <div className="sf-corner sf-tr" />
              <div className="sf-corner sf-bl" />
              <div className="sf-corner sf-br" />
              <div className="laser" style={{ animationPlayState: paused ? "paused" : "running" }} />
              <div className="scan-label">Arahkan QR Code ke sini</div>
            </div>
          </div>
        </div>

        <div className={`scan-flash ${flash ? "show" : ""}`} />
        {paused && (
          <div id="paused-overlay" style={{ display: "flex" }}>
            <i className="fas fa-pause" style={{ marginRight: ".75rem" }} />
            Dijeda
          </div>
        )}
        {camError && (
          <div id="paused-overlay" style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
            <i className="fas fa-video-slash" />
            <span style={{ fontSize: ".8rem", textTransform: "none", letterSpacing: "normal", textAlign: "center", padding: "0 1rem" }}>
              {camError}
            </span>
          </div>
        )}

        <div id="stats-strip">
          <div className="sstat green">
            <span className="sstat-dot" style={{ background: "#10b981" }} />
            {cnt.hadir} Hadir
          </div>
          <div className="sstat orange">
            <span className="sstat-dot" style={{ background: "#f59e0b" }} />
            {cnt.terlambat} Terlambat
          </div>
          <div className="sstat purple">
            <span className="sstat-dot" style={{ background: "#6366f1" }} />
            <i className="fas fa-check-circle sstat-icon" />
            {cnt.pulang} Pulang
          </div>
        </div>

        <div id="notif" className={`${notif.type} ${notif.show ? "show" : ""}`}>
          <div className="notif-icon">{notif.icon}</div>
          <div className="notif-content">
            <div className="notif-nama">{notif.nama}</div>
            <div className="notif-info">{notif.info}</div>
            {notif.kelas && <div className="notif-kelas">Kelas {notif.kelas}</div>}
          </div>
        </div>

        {manualOpen && (
          <div id="modal-manual" onClick={(e) => e.target === e.currentTarget && tutupManual()}>
            <div className="manual-sheet">
              <div className="manual-handle" />
              <div className="manual-title">
                <i className="fas fa-keyboard" />
                Absen Manual
              </div>
              <input
                type="text"
                className="manual-search"
                placeholder="Cari nama siswa..."
                autoFocus
                value={manualQuery}
                onChange={(e) => handleSearchInput(e.target.value)}
              />
              <div id="manual-list">
                {manualQuery.trim().length < 2 ? (
                  <div className="manual-empty">
                    <i className="fas fa-arrow-down" />
                    Mulai ketik nama siswa
                  </div>
                ) : manualLoading ? (
                  <div className="manual-empty" style={{ color: "#6366f1" }}>
                    <i className="fas fa-spinner spin" />
                    Mencari...
                  </div>
                ) : !manualResults || manualResults.length === 0 ? (
                  <div className="manual-empty" style={{ color: "var(--red)" }}>
                    <i className="fas fa-inbox" />
                    Tidak ada hasil
                  </div>
                ) : (
                  manualResults.map((s) => (
                    <div key={s.id} className="manual-item" onClick={() => klikAbsenManual(s)}>
                      <div className="manual-item-info">
                        <div className="manual-item-name">{s.name}</div>
                        <div className="manual-item-kelas">Kelas {s.class}</div>
                      </div>
                      <button className={`manual-btn-absen ${confirmId === s.id ? "confirm" : ""}`}>
                        {confirmId === s.id ? (
                          <>
                            <i className="fas fa-check-double" /> Yakin?
                          </>
                        ) : (
                          "Absen"
                        )}
                      </button>
                    </div>
                  ))
                )}
              </div>
              <button className="manual-close-btn" onClick={tutupManual}>
                <i className="fas fa-times" style={{ marginRight: ".4rem" }} />
                Tutup
              </button>
            </div>
          </div>
        )}
      </div>

      {syncQueueLen > 0 && (
        <div id="sync-modal" className="show">
          <div className={`sync-status ${syncing ? "syncing" : ""}`}>
            <i className="fas fa-spinner spin" />
            <div>Menyinkronkan...</div>
          </div>
          <div className="sync-queue">
            <div className="sync-queue-title">
              Antrian: <span>{syncQueueLen}</span>
            </div>
          </div>
        </div>
      )}

      <div id="bottombar">
        <div className="mode-badge">
          <i className="fas fa-robot" /> Otomatis
        </div>
        <button className="ctrl-btn" onClick={switchCam} title="Tukar kamera">
          <i className="fas fa-camera-rotate" />
          <span className="ctrl-btn-label">{facing === "user" ? "Belakang" : "Depan"}</span>
        </button>
        <button className="ctrl-btn" onClick={togglePause} title="Jeda/Lanjutkan">
          <i className={`fas fa-${paused ? "play" : "pause"}`} />
          <span className="ctrl-btn-label">{paused ? "Lanjut" : "Jeda"}</span>
        </button>
        <button className="ctrl-btn" onClick={bukaManual} title="Absen manual" style={{ borderColor: "rgba(99,102,241,.3)" }}>
          <i className="fas fa-keyboard" />
          <span className="ctrl-btn-label">Manual</span>
        </button>
        <button className="ctrl-btn" onClick={toggleSound} title="Pengaturan Suara">
          <i className={`fas fa-volume-${soundEnabled ? "up" : "mute"}`} />
          <span className="ctrl-btn-label">Suara: {soundEnabled ? "ON" : "OFF"}</span>
        </button>
      </div>
    </div>
  );
}
