/// <reference lib="webworker" />
// Project tsconfig pakai lib "dom" (bukan "webworker") karena semua file lain
// berjalan di browser biasa. Baris di atas cuma nambahin tipe webworker
// (ServiceWorkerGlobalScope, dll) KHUSUS untuk file ini, tanpa ubah tsconfig
// global — jadi file lain tetap dapat tipe DOM normal.

import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

// Tipe untuk service worker (self bukan Window, tapi ServiceWorkerGlobalScope)
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  // Halaman fallback saat offline & belum pernah dibuka/di-cache
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
