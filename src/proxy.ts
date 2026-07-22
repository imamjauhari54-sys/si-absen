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

// Lindungi semua halaman & API kecuali /login, static asset, dan file publik.
export const config = {
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico|api/auth/logout).*)"],
};
