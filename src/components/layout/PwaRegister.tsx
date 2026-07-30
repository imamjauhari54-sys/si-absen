"use client";

import { useEffect } from "react";

/**
 * Mendaftarkan service worker (public/sw.js hasil build Serwist) di sisi client.
 * Hanya aktif di production build (file sw.js baru di-generate saat `next build`;
 * di `next dev` file itu memang sengaja tidak ada — lihat next.config.ts).
 */
export default function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const register = async () => {
      try {
        // Cek dulu file-nya benar-benar ada & bukan hasil redirect (mis. ke
        // /login kalau suatu saat proxy.ts berubah lagi) sebelum register —
        // browser bakal lempar SecurityError yang membingungkan kalau kita
        // langsung register ke response yang di-redirect.
        const res = await fetch("/sw.js", { cache: "no-store" });
        if (!res.ok || res.redirected) {
          console.warn("Service worker tidak bisa didaftarkan: /sw.js tidak dapat diakses langsung.");
          return;
        }
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
