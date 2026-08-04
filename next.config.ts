import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const nextConfig: NextConfig = {
  /* config options here */
  // @serwist/next selalu nyisipin config `webpack` (dipakai pas `next build
  // --webpack` buat generate service worker), meskipun `disable: true` pas
  // dev. Next.js 16 defaultnya pakai Turbopack di `next dev`, jadi tanpa
  // baris ini muncul error "using Turbopack with a webpack config". Kasih
  // tahu Turbopack "nggak ada config khusus, itu normal" biar nggak dianggap
  // kesalahan.
  turbopack: {},
};

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // Jangan register SW otomatis saat dev (bikin cache stale saat coding).
  // Register manual dilakukan lewat komponen PwaRegister di production.
  disable: process.env.NODE_ENV === "development",
});

export default withSerwist(nextConfig);
