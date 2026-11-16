import { NextResponse } from "next/server";
import type { Galat } from "@/lib/utils/pengajuan";

/** Respons JSON yang tidak boleh disimpan cache (data pribadi, PIN polos, status keputusan). */
const TANPA_CACHE = { "Cache-Control": "no-store" } as const;

export function jawabOk(data: Record<string, unknown> = {}, status = 200): NextResponse {
  return NextResponse.json({ status: "ok", ...data }, { status, headers: TANPA_CACHE });
}

/** Bentuk galat seragam dengan route lain: { status: "error", message, kode? }. */
export function jawabGalat(g: Galat): NextResponse {
  const headers: Record<string, string> = { ...TANPA_CACHE };
  if (g.retryAfter) headers["Retry-After"] = String(g.retryAfter);
  return NextResponse.json(
    { status: "error", message: g.message, ...(g.kode ? { kode: g.kode } : {}), ...(g.tambahan ?? {}) },
    { status: g.status, headers }
  );
}
