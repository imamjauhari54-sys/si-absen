"use server";

import { getSession } from "@/lib/auth/session";
import { getStudentSession } from "@/lib/auth/student-session";

/**
 * Cek ringan: apakah browser ini sudah punya sesi admin/guru dan/atau sesi siswa?
 * Dipakai kartu login supaya klik tab yang sudah punya sesi langsung diarahkan
 * ke dashboard-nya (page.tsx tetap punya guard sendiri saat di-refresh).
 */
export async function checkExistingSessions(): Promise<{
  masuk: boolean;
  siswa: boolean;
}> {
  const [admin, siswa] = await Promise.all([getSession(), getStudentSession()]);
  return { masuk: !!admin, siswa: !!siswa };
}
