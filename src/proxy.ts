import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "si_absen_session";
const PUBLIC_PATHS = ["/login"];

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET belum diset di .env.local");
  return new TextEncoder().encode(secret);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  let loggedIn = false;

  if (token) {
    try {
      await jwtVerify(token, getSecretKey());
      loggedIn = true;
    } catch {
      loggedIn = false;
    }
  }

  if (!loggedIn) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// Lindungi semua halaman & API kecuali /login, /portal-siswa (sesi siswa
// terpisah, dijaga sendiri lewat requireStudentSession() di halamannya),
// aset PWA (sw.js, manifest.json, icons — WAJIB bisa diakses tanpa login,
// browser menolak register service worker kalau responsnya di-redirect),
// api/absen/auto-alpha (dipanggil Vercel Cron TANPA cookie session sama
// sekali — otentikasinya sendiri lewat header "Authorization: Bearer
// CRON_SECRET" yang dicek di dalam route handler-nya, BUKAN cookie. Kalau
// path ini ikut ke-lock di sini, proxy bakal redirect ke /login duluan
// sebelum request sempat sampai ke pengecekan CRON_SECRET, dan cron-nya
// diam-diam nggak pernah benar-benar jalan setiap hari), static asset, dan
// file publik.
export const config = {
  matcher: [
    "/((?!login|portal-siswa|sw\\.js|manifest\\.json|icons/|api/absen/auto-alpha|_next/static|_next/image|favicon.ico|api/auth/logout).*)",
  ],
};
