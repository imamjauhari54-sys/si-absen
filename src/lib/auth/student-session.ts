import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { StudentSessionPayload } from "@/types";

// Cookie & secret SENGAJA dipisah dari sesi admin/guru (lihat src/lib/auth/session.ts):
// - Nama cookie beda -> tidak akan pernah ketimpa/campur.
// - Umur sesi jauh lebih pendek (siswa cek dari HP pribadi/warnet, bukan
//   perangkat kerja yang dipercaya seperti scanner tablet admin).
// - Payload JWT beda bentuk (siswaId, bukan userId+role) -> secara desain
//   tidak mungkin dipakai untuk lolos requireSession() di halaman admin/guru
//   walau seandainya field-nya "ditebak".
const COOKIE_NAME = "si_absen_siswa_session";
const MAX_AGE_SECONDS = 60 * 30; // 30 menit — cukup buat sekali cek, auto-logout kalau lupa

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET belum diset di .env.local");
  }
  // Pakai secret yang sama dengan sesi admin/guru (sama-sama env server-only),
  // tapi payload & nama cookie beda sudah cukup untuk isolasi antar sesi.
  return new TextEncoder().encode(secret + ":siswa");
}

export async function createStudentSession(payload: StudentSessionPayload) {
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

export async function destroyStudentSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getStudentSession(): Promise<StudentSessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload as unknown as StudentSessionPayload;
  } catch {
    return null;
  }
}

/** Wajib dipanggil di awal halaman Portal Siswa yang butuh sesi valid. */
export async function requireStudentSession(): Promise<StudentSessionPayload> {
  const session = await getStudentSession();
  if (!session) {
    redirect("/portal-siswa");
  }
  return session;
}

export { COOKIE_NAME as STUDENT_COOKIE_NAME };
