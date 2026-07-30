import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const nextConfig: NextConfig = {
  /* config options here */
};

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // Jangan register SW otomatis saat dev (bikin cache stale saat coding).
  // Register manual dilakukan lewat komponen PwaRegister di production.
  disable: process.env.NODE_ENV === "development",
});

export default withSerwist(nextConfig);
