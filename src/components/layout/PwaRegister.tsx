"use client";

import { useEffect } from "react";

/**
 * Mendaftarkan service worker (public/sw.js hasil build Serwist) di sisi client.
 * Hanya aktif di production build (file sw.js baru di-generate saat `next build`).
 */
export default function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch (err) {
        console.error("Gagal mendaftarkan service worker:", err);
      }
    };

    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
