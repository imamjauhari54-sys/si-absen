"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import jsQR from "jsqr";

const AJAX = "/api/scan-absen/proses";
const CARI = "/api/scan-absen/cari";
const OFFLINE_KEY = "si_absen_offline_queue_";
const SCANNER_ID_KEY = "si_absen_scanner_id";

// Laptop/desktop punya CPU jauh lebih longgar dibanding HP, jadi bisa decode
// lebih sering & tanpa downscale — membantu kompensasi webcam laptop yang
// biasanya fixed-focus (gak bisa fokus dekat kayak HP), yang bikin QR
// kelihatan kurang tajam/kecil di frame kalau jaraknya gak pas.
const isMobileUA = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

const SCAN_CONFIG = isMobileUA
  ? { ROI_SCALE: 0.8, SCAN_INTERVAL: 100, CANVAS_SCALE: 0.75, FRAME_SKIP: 1 }
  : { ROI_SCALE: 0.8, SCAN_INTERVAL: 80, CANVAS_SCALE: 1, FRAME_SKIP: 0 };

interface OfflineItem {
  token: string | null;
  siswa_id: number | null;
  manual: boolean;
  nama: string;
  status: string;
  timestamp: string;
  scannerId: string;
}

interface SiswaResult {
  id: number;
  name: string;
  class: string;
}

type NotifType = "hadir" | "terlambat" | "pulang" | "sudah" | "error" | "offline" | "ignore";

function getScannerId(): string {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem(SCANNER_ID_KEY);
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : `dev-${Date.now()}-${Math.random()}`).replace(/-/g, "");
    localStorage.setItem(SCANNER_ID_KEY, id);
  }
  return id;
}

function getOfflineQueue(scannerId: string): OfflineItem[] {
  const raw = localStorage.getItem(OFFLINE_KEY + scannerId);
  return raw ? JSON.parse(raw) : [];
}
function setOfflineQueue(scannerId: string, queue: OfflineItem[]) {
  localStorage.setItem(OFFLINE_KEY + scannerId, JSON.stringify(queue));
}

export default function Scanner({ namaSekolah }: { namaSekolah: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const roiCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const zoomCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const processingTokenRef = useRef<string | null>(null);
  const lastScanAtRef = useRef(0);
  const frameCountRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const notifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scannerIdRef = useRef<string>("");
  const laserRef = useRef<HTMLDivElement>(null);
  const scanningRef = useRef(true); // dijeda karena sedang proses hasil scan (bukan tombol jeda user)
  const pausedRef = useRef(false); // dijeda oleh tombol user

  const [jam, setJam] = useState("00:00:00");
  const [isOnline, setIsOnline] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [paused, setPaused] = useState(false);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [stats, setStats] = useState({ hadir: 0, terlambat: 0, pulang: 0 });
  const [flash, setFlash] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);

  const [notif, setNotif] = useState<{ show: boolean; type: NotifType; icon: string; nama: string; info: string; kelas: string }>({
    show: false,
    type: "hadir",
    icon: "",
    nama: "",
    info: "",
    kelas: "",
  });

  const [manualOpen, setManualOpen] = useState(false);
  const [manualQuery, setManualQuery] = useState("");
  const [manualResults, setManualResults] = useState<SiswaResult[] | null>(null);
  const [manualLoading, setManualLoading] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [syncCount, setSyncCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState<"syncing" | "success" | null>(null);
  const [syncItems, setSyncItems] = useState<OfflineItem[]>([]);
  const syncingRef = useRef(false);

  // ── SUARA ──────────────────────────────────────────────────────────
  const initAudio = useCallback(() => {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new Ctx();
    }
  }, []);

  const playBeep = useCallback(
    (type: "success" | "error" | "offline") => {
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
        // abaikan error audio
      }
    },
    [soundEnabled]
  );

  // ── NOTIFIKASI ─────────────────────────────────────────────────────
  const showNotif = useCallback((type: NotifType, icon: string, nama: string, info: string, kelas = "") => {
    setNotif({ show: true, type, icon, nama, info, kelas });
    if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
    notifTimerRef.current = setTimeout(() => setNotif((n) => ({ ...n, show: false })), 4000);
  }, []);

  const doFlash = useCallback(() => {
    setFlash(true);
    setTimeout(() => setFlash(false), 200);
  }, []);

  // ── OFFLINE QUEUE ──────────────────────────────────────────────────
  const refreshSyncModal = useCallback(() => {
    const queue = getOfflineQueue(scannerIdRef.current);
    setSyncCount(queue.length);
    setSyncItems(queue.slice(-3));
  }, []);

  const addToOfflineQueue = useCallback(
    (data: { token: string | null; siswa_id: number | null; manual: boolean; nama: string; status: string }) => {
      const queue = getOfflineQueue(scannerIdRef.current);
      queue.push({ ...data, timestamp: new Date().toISOString(), scannerId: scannerIdRef.current });
      setOfflineQueue(scannerIdRef.current, queue);
      refreshSyncModal();
    },
    [refreshSyncModal]
  );

  const syncOfflineData = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return;
    syncingRef.current = true;

    const queue = getOfflineQueue(scannerIdRef.current);
    if (queue.length === 0) {
      syncingRef.current = false;
      return;
    }

    setSyncStatus("syncing");
    let synced = 0;

    for (const item of queue) {
      try {
        const fd = new FormData();
        fd.append("token", item.token || "");
        fd.append("siswa_id", item.siswa_id ? String(item.siswa_id) : "");
        fd.append("manual", item.manual ? "1" : "");
        fd.append("scanner_id", scannerIdRef.current);
        // -1 karena item ini lagi diproses & bakal di-shift kalau berhasil
        fd.append("offline_queue_count", String(Math.max(0, queue.length - 1)));

        const res = await fetch(AJAX, { method: "POST", body: fd, credentials: "same-origin", signal: AbortSignal.timeout(10000) });
        if (res.ok) {
          synced++;
          queue.shift();
          setOfflineQueue(scannerIdRef.current, queue);
        } else {
          break;
        }
      } catch {
        break;
      }
    }

    if (synced > 0) {
      setSyncStatus("success");
      playBeep("success");
      setTimeout(() => {
        if (getOfflineQueue(scannerIdRef.current).length === 0) setSyncStatus(null);
      }, 2000);
    } else {
      setSyncStatus(null);
    }

    syncingRef.current = false;
    refreshSyncModal();
  }, [playBeep, refreshSyncModal]);

  // ── ONLINE/OFFLINE ─────────────────────────────────────────────────
  useEffect(() => {
    function onOnline() {
      setIsOnline(true);
      syncOfflineData();
    }
    function onOffline() {
      setIsOnline(false);
      showNotif("offline", "📡", "Mode Offline", "Data akan disinkronkan otomatis");
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- nilai navigator.onLine cuma ada di client, wajib disinkronkan di effect
    setIsOnline(navigator.onLine);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [syncOfflineData, showNotif]);

  // ── HASIL SCAN ─────────────────────────────────────────────────────
  const handleResult = useCallback(
    (d: { status: string; nama?: string; kelas?: string; jam?: string; keterangan?: string; message?: string }) => {
      if (d.status === "hadir") {
        setStats((s) => ({ ...s, hadir: s.hadir + 1 }));
        showNotif("hadir", "✅", d.nama || "-", `Hadir · ${d.jam}`, d.kelas || "");
        playBeep("success");
      } else if (d.status === "terlambat") {
        setStats((s) => ({ ...s, terlambat: s.terlambat + 1 }));
        showNotif("terlambat", "⏰", d.nama || "-", `Terlambat · ${d.jam}`, d.kelas || "");
        playBeep("success");
      } else if (d.status === "pulang") {
        setStats((s) => ({ ...s, pulang: s.pulang + 1 }));
        showNotif("pulang", "🏠", d.nama || "-", `Pulang · ${d.jam}`, d.kelas || "");
        playBeep("success");
      } else if (d.status === "sudah") {
        showNotif("sudah", "📋", d.nama || "-", `Sudah absen · ${d.keterangan || ""}`, "");
        playBeep("success");
      } else if (d.status === "ignore") {
        showNotif("ignore", "⏳", d.nama || "-", d.message || "Tunggu sebentar", "");
      } else {
        showNotif("error", "❌", "Gagal", d.message || "Error");
        playBeep("error");
      }
    },
    [showNotif, playBeep]
  );

  // ── PROSES QR ──────────────────────────────────────────────────────
  const prosesQR = useCallback(
    async (raw: string) => {
      if (processingTokenRef.current) return;
      processingTokenRef.current = raw;

      let token = raw;
      if (!token.startsWith("SIELISA:")) token = "SIELISA:" + token;

      scanningRef.current = false;
      doFlash();
      try {
        if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
      } catch {
        // abaikan
      }
      if (laserRef.current) laserRef.current.style.animationPlayState = "paused";

      try {
        const fd = new FormData();
        fd.append("token", token);
        fd.append("scanner_id", scannerIdRef.current);
        fd.append("offline_queue_count", String(getOfflineQueue(scannerIdRef.current).length));

        const res = await fetch(AJAX, { method: "POST", body: fd, credentials: "same-origin", signal: AbortSignal.timeout(15000) });
        if (!res.ok && res.status !== 400 && res.status !== 403) throw new Error(`HTTP ${res.status}`);

        const d = await res.json();
        handleResult(d);
      } catch {
        if (navigator.onLine) {
          showNotif("error", "❌", "Error", "Gagal menghubungi server");
          playBeep("error");
        } else {
          addToOfflineQueue({ token, siswa_id: null, manual: false, nama: "Scan Offline", status: "pending" });
          showNotif("offline", "📡", "Offline Mode", "Data disimpan untuk disinkronkan");
          playBeep("offline");
        }
      } finally {
        setTimeout(() => {
          processingTokenRef.current = null;
          scanningRef.current = true;
          if (laserRef.current) laserRef.current.style.animationPlayState = "running";
        }, 2000);
      }
    },
    [doFlash, handleResult, showNotif, playBeep, addToOfflineQueue]
  );

  // ── SCAN LOOP ──────────────────────────────────────────────────────
  const doScan = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const roiCanvas = roiCanvasRef.current;
    if (!video || !canvas || !roiCanvas) return;
    if (pausedRef.current || !scanningRef.current || video.readyState !== video.HAVE_ENOUGH_DATA) return;

    frameCountRef.current++;
    if (frameCountRef.current % (SCAN_CONFIG.FRAME_SKIP + 1) !== 0) return;

    try {
      const ctx = canvas.getContext("2d", { willReadFrequently: true, alpha: false });
      const roiCtx = roiCanvas.getContext("2d", { willReadFrequently: true, alpha: false });
      if (!ctx || !roiCtx) return;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const roiX = (canvas.width - roiCanvas.width) / 2;
      const roiY = (canvas.height - roiCanvas.height) / 2;
      roiCtx.drawImage(canvas, roiX, roiY, roiCanvas.width, roiCanvas.height, 0, 0, roiCanvas.width, roiCanvas.height);

      const imageData = roiCtx.getImageData(0, 0, roiCanvas.width, roiCanvas.height);
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
        if (processingTokenRef.current !== qr.data || now - lastScanAtRef.current > 1500) {
          lastScanAtRef.current = now;
          prosesQR(qr.data);
        }
        return;
      }

      // Fallback khusus desktop: kalau QR gak kebaca di ROI penuh, coba lagi
      // dengan crop tengah yang di-"zoom" 2x. Webcam laptop sering gak bisa
      // fokus dekat, jadi user harus jaga jarak kartu agak jauh biar tetep
      // tajam — akibatnya QR jadi kecil di frame. Zoom digital ini bantu
      // jsQR baca QR yang kecil itu tanpa user harus mepetin kartu ke kamera.
      if (!isMobileUA) {
        if (!zoomCanvasRef.current) zoomCanvasRef.current = document.createElement("canvas");
        const zoomCanvas = zoomCanvasRef.current;
        zoomCanvas.width = roiCanvas.width;
        zoomCanvas.height = roiCanvas.height;
        const zctx = zoomCanvas.getContext("2d", { willReadFrequently: true, alpha: false });
        if (zctx) {
          const quarter = roiCanvas.width / 4;
          const half = roiCanvas.width / 2;
          zctx.drawImage(canvas, roiX + quarter, roiY + quarter, half, half, 0, 0, zoomCanvas.width, zoomCanvas.height);
          const zoomData = zctx.getImageData(0, 0, zoomCanvas.width, zoomCanvas.height);
          const qr2 = jsQR(zoomData.data, zoomData.width, zoomData.height, { inversionAttempts: "attemptBoth" });
          if (qr2?.data) {
            const now = Date.now();
            if (processingTokenRef.current !== qr2.data || now - lastScanAtRef.current > 1500) {
              lastScanAtRef.current = now;
              prosesQR(qr2.data);
            }
          }
        }
      }
    } catch {
      // abaikan error frame tunggal, lanjut ke frame berikutnya
    }
  }, [prosesQR]);

  const scanLoop = useCallback(() => {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    scanIntervalRef.current = setInterval(doScan, SCAN_CONFIG.SCAN_INTERVAL);
  }, [doScan]);

  // ── KAMERA ─────────────────────────────────────────────────────────
  const initCanvas = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return false;

    // Sebagian device (terutama kamera belakang di beberapa Android) sempat
    // menembak event "canplay" sebelum videoWidth/videoHeight kebaca (masih 0).
    // Kalau diterima mentah-mentah, canvas & roiCanvas jadi 0x0 permanen
    // (listener canplay cuma sekali pakai) dan scan loop gagal terus tanpa
    // ada tanda error yang kelihatan. Makanya di-guard: jangan resize kalau
    // dimensinya belum valid, biar pemanggil bisa retry.
    if (!video.videoWidth || !video.videoHeight) return false;

    const W = Math.floor(video.videoWidth * SCAN_CONFIG.CANVAS_SCALE);
    const H = Math.floor(video.videoHeight * SCAN_CONFIG.CANVAS_SCALE);
    canvas.width = W;
    canvas.height = H;

    if (!roiCanvasRef.current) roiCanvasRef.current = document.createElement("canvas");
    const roiSize = Math.min(W, H);
    const roi = roiCanvasRef.current;
    roi.width = Math.floor(roiSize * SCAN_CONFIG.ROI_SCALE);
    roi.height = roi.width;
    return true;
  }, []);

  // Nunggu sampai videoWidth/videoHeight beneran valid sebelum initCanvas,
  // dengan polling ringan (bukan cuma andalkan sekali event "canplay").
  const waitForVideoReady = useCallback(
    (maxRetries = 20, delayMs = 100): Promise<boolean> => {
      return new Promise((resolve) => {
        let tries = 0;
        const attempt = () => {
          if (initCanvas()) {
            resolve(true);
            return;
          }
          tries++;
          if (tries >= maxRetries) {
            resolve(false);
            return;
          }
          setTimeout(attempt, delayMs);
        };
        attempt();
      });
    },
    [initCanvas]
  );

  const startCam = useCallback(
    async (facingMode: "environment" | "user") => {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
      setCamError(null);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode,
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            frameRate: { ideal: 30, max: 30 },
          },
          audio: false,
        });
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const ready = await waitForVideoReady();
        if (!ready) {
          setCamError("Kamera tidak mengirim gambar, coba ganti kamera atau muat ulang halaman");
          return;
        }
        // Beri jeda sebentar biar autofocus & auto-exposure kamera sempat
        // settle dulu sebelum mulai nyoba decode, terutama pas jarak dekat (macro).
        setTimeout(scanLoop, 400);
      } catch (e) {
        setCamError(e instanceof Error ? e.message : "Tidak bisa mengakses kamera");
      }
    },
    [waitForVideoReady, scanLoop]
  );

  const switchingCamRef = useRef(false);

  async function switchCam() {
    if (switchingCamRef.current) return;
    switchingCamRef.current = true;
    const next = facing === "environment" ? "user" : "environment";
    setFacing(next);
    await startCam(next);
    switchingCamRef.current = false;
  }

  function togglePause() {
    if (processingTokenRef.current) {
      showNotif("sudah", "⏳", "Tunggu", "Sedang memproses...");
      return;
    }
    const next = !paused;
    pausedRef.current = next;
    setPaused(next);
    if (next) {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
      if (laserRef.current) laserRef.current.style.animationPlayState = "paused";
    } else {
      if (laserRef.current) laserRef.current.style.animationPlayState = "running";
      scanLoop();
    }
  }

  // ── MANUAL ABSEN ───────────────────────────────────────────────────
  function bukaManual() {
    setManualOpen(true);
    setManualQuery("");
    setManualResults(null);
    setConfirmId(null);
  }
  function tutupManual() {
    setManualOpen(false);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
  }

  async function cariSiswa(q: string) {
    setManualLoading(true);
    try {
      const res = await fetch(`${CARI}?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error();
      const list = await res.json();
      setManualResults(Array.isArray(list) ? list : []);
    } catch {
      setManualResults([]);
    } finally {
      setManualLoading(false);
    }
  }

  function handleSearchInput(q: string) {
    setManualQuery(q);
    const trimmed = q.trim();
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (trimmed.length < 2) {
      setManualResults(null);
      return;
    }
    searchDebounceRef.current = setTimeout(() => cariSiswa(trimmed), 400);
  }

  function konfirmasiManual(s: SiswaResult) {
    if (confirmId !== s.id) {
      setConfirmId(s.id);
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = setTimeout(() => setConfirmId(null), 3000);
      return;
    }
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    absenManual(s.id, s.name);
  }

  async function absenManual(id: number, nama: string) {
    if (!navigator.onLine) {
      addToOfflineQueue({ token: null, siswa_id: id, manual: true, nama, status: "pending" });
      tutupManual();
      showNotif("offline", "📡", nama, "Disimpan untuk offline");
      playBeep("offline");
      return;
    }

    const fd = new FormData();
    fd.append("siswa_id", String(id));
    fd.append("manual", "1");
    fd.append("scanner_id", scannerIdRef.current);
    fd.append("offline_queue_count", String(getOfflineQueue(scannerIdRef.current).length));

    try {
      const res = await fetch(AJAX, { method: "POST", body: fd, signal: AbortSignal.timeout(10000) });
      const d = await res.json();
      tutupManual();
      handleResult({ ...d, nama, kelas: "" });
    } catch {
      showNotif("error", "❌", "Gagal", "Kesalahan jaringan");
      playBeep("error");
    }
  }

  function toggleSound() {
    setSoundEnabled((prev) => {
      const next = !prev;
      if (next) {
        initAudio();
        showNotif("hadir", "🔔", "Pengaturan", "Suara: AKTIF");
      } else {
        showNotif("error", "🔕", "Pengaturan", "Suara: DIMATIKAN");
      }
      return next;
    });
  }

  // ── INIT ───────────────────────────────────────────────────────────
  useEffect(() => {
    scannerIdRef.current = getScannerId();
    initAudio();

    function resumeAudio() {
      if (audioCtxRef.current?.state === "suspended") audioCtxRef.current.resume();
    }
    document.addEventListener("click", resumeAudio);

    refreshSyncModal();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- akses kamera browser: aksi imperatif sekali saat mount, bukan derived state
    startCam("environment");

    const clockId = setInterval(() => setJam(new Date().toTimeString().slice(0, 8)), 1000);
    const syncId = setInterval(syncOfflineData, 30000);

    return () => {
      document.removeEventListener("click", resumeAudio);
      clearInterval(clockId);
      clearInterval(syncId);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
      if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="scan-page">
      <div id="scan-app">
        <div id="offline-banner" className={isOnline ? "" : "show"}>
          <i className="fas fa-wifi" /> Offline Mode - Data akan disinkronkan saat terhubung
        </div>

        <div id="topbar">
          <div className="topbar-left">
            <div className="topbar-brand">
              <div className="topbar-logo"><i className="fas fa-qrcode" /></div>
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
            <div className={`status-badge ${isOnline ? "online" : "offline"}`}>
              <span className={`status-dot ${isOnline ? "online" : "offline"}`} />
              <span>{isOnline ? "Online" : "Offline"}</span>
            </div>
            <div id="topbar-jam">{jam}</div>
            <Link href="/dashboard" className="topbar-btn">
              <i className="fas fa-arrow-left" /> Kembali
            </Link>
          </div>
        </div>

        <div id="video-wrap">
          <video ref={videoRef} id="video" playsInline autoPlay muted />
          <canvas ref={canvasRef} id="canvas" />
          <div className="vignette" />

          <div className="scan-overlay">
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2.5rem" }}>
              <div className="scan-frame">
                <div className="sf-corner sf-tl" />
                <div className="sf-corner sf-tr" />
                <div className="sf-corner sf-bl" />
                <div className="sf-corner sf-br" />
                <div className="laser" ref={laserRef} />
                <div className="scan-label">{camError ? camError : "Arahkan QR Code ke sini"}</div>
              </div>
            </div>
          </div>

          <div className={`scan-flash ${flash ? "show" : ""}`} />
          <div id="paused-overlay" className={paused ? "show" : ""}>
            <i className="fas fa-pause" style={{ marginRight: ".75rem" }} />
            Dijeda
          </div>

          <div id="stats-strip">
            <div className="sstat green">
              <span className="sstat-dot" style={{ background: "#10b981" }} />
              <span>{stats.hadir}</span> Hadir
            </div>
            <div className="sstat orange">
              <span className="sstat-dot" style={{ background: "#f59e0b" }} />
              <span>{stats.terlambat}</span> Terlambat
            </div>
            <div className="sstat purple">
              <span className="sstat-dot" style={{ background: "#6366f1" }} />
              <i className="fas fa-check-circle sstat-icon" />
              <span>{stats.pulang}</span> Pulang
            </div>
          </div>

          <div id="notif" className={`${notif.type} ${notif.show ? "show" : ""}`}>
            <div className="notif-icon">{notif.icon}</div>
            <div className="notif-content">
              <div className="notif-nama">{notif.nama}</div>
              <div className="notif-info">{notif.info}</div>
              <div className="notif-kelas">{notif.kelas ? `Kelas ${notif.kelas}` : ""}</div>
            </div>
          </div>

          <div id="modal-manual" className={manualOpen ? "show" : ""} onClick={(e) => e.target === e.currentTarget && tutupManual()}>
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
                value={manualQuery}
                onChange={(e) => handleSearchInput(e.target.value)}
                autoFocus={manualOpen}
              />
              <div id="manual-list">
                {manualLoading ? (
                  <div style={{ color: "#6366f1", fontSize: ".85rem", textAlign: "center", padding: "2rem" }}>
                    <i className="fas fa-spinner spin" style={{ fontSize: "1.5rem", display: "block", marginBottom: ".5rem" }} />
                    Mencari...
                  </div>
                ) : manualResults === null ? (
                  <div style={{ color: "var(--muted)", fontSize: ".8rem", textAlign: "center", padding: "2rem" }}>
                    <i className="fas fa-arrow-down" style={{ display: "block", fontSize: "1.5rem", marginBottom: ".5rem", opacity: 0.5 }} />
                    Mulai ketik nama siswa
                  </div>
                ) : manualResults.length === 0 ? (
                  <div style={{ color: "var(--red)", fontSize: ".85rem", textAlign: "center", padding: "2rem" }}>
                    <i className="fas fa-inbox" style={{ display: "block", fontSize: "1.5rem", marginBottom: ".5rem", opacity: 0.5 }} />
                    Tidak ada hasil
                  </div>
                ) : (
                  manualResults.map((s) => (
                    <div key={s.id} className="manual-item" onClick={() => konfirmasiManual(s)}>
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
        </div>

        <div id="sync-modal" className={syncCount > 0 ? "show" : ""}>
          <div className={`sync-status ${syncStatus ?? "syncing"}`}>
            <i className={`fas ${syncStatus === "success" ? "fa-check-circle" : "fa-spinner spin"}`} />
            <div>{syncStatus === "success" ? "Tersinkronkan" : "Menyinkronkan..."}</div>
          </div>
          <div className="sync-queue">
            <div className="sync-queue-title">
              Antrian: <span>{syncCount}</span>
            </div>
            <div>
              {syncItems.map((item, i) => (
                <div key={i} className="sync-queue-item">
                  {i + 1}. {item.nama} - {item.status}
                </div>
              ))}
            </div>
          </div>
        </div>

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
    </div>
  );
}
