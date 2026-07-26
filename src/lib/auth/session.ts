import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { SessionPayload } from "@/types";

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "si_absen_session";
const MAX_AGE_SECONDS = 60 * 60 * 8; // 8 jam, samakan/ubah sesuai kebutuhan sekolah

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET belum diset di .env.local");
  }
  return new TextEncoder().encode(secret);
}

/** Buat JWT sesi baru dan simpan sebagai httpOnly cookie. Dipanggil setelah login sukses. */
export async function createSession(payload: SessionPayload) {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(getSecretKey());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

/** Hapus cookie sesi. Dipanggil saat logout. */
export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/** Baca & verifikasi sesi dari cookie request saat ini. Return null kalau tidak login / token invalid. */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * Wajib dipanggil di awal setiap Server Component halaman yang butuh login
 * (setara requireLogin() di includes/config.php). Lempar redirect kalau
 * belum login / role tidak diizinkan.
 */
export async function requireSession(
  allowedRoles: Array<"admin" | "guru"> = ["admin", "guru"]
): Promise<SessionPayload> {
  const session = await getSession();
  if (!session || !allowedRoles.includes(session.role)) {
    redirect("/login");
  }
  return session;
}

export { COOKIE_NAME };
