import { unstable_cache, revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";
import { addDaysJakarta } from "@/lib/utils/tanggal";

export interface HariLiburRow {
  id: number;
  tanggal: string;
  keterangan: string;
}

// KATEGORI A (data master): kalender hari libur cuma berubah lewat CRUD di
// halaman Rekap ("Kelola Hari Libur") atau sinkronisasi tahunan, tapi
// dipanggil di SETIAP kali buka halaman Rekap Absensi (harian & bulanan).
// Di-cache tag "hari-libur", di-invalidate di semua fungsi mutasi di bawah.
async function _getHariLiburMap(): Promise<[string, string][]> {
  const { data } = await supabaseAdmin.from("hari_libur").select("tanggal, keterangan");
  return (data ?? []).map((r) => [r.tanggal, r.keterangan] as [string, string]);
}
/** Map tanggal (YYYY-MM-DD) -> keterangan, buat lookup cepat O(1). */
export async function getHariLiburMap(): Promise<Map<string, string>> {
  const entries = await unstable_cache(_getHariLiburMap, ["hari-libur-map"], { tags: ["hari-libur"] })();
  return new Map(entries);
}

export async function getHariLiburList(): Promise<HariLiburRow[]> {
  const { data } = await supabaseAdmin.from("hari_libur").select("id, tanggal, keterangan").order("tanggal", { ascending: false });
  return data ?? [];
}

export async function addHariLibur(tanggal: string, keterangan: string): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabaseAdmin
    .from("hari_libur")
    .upsert({ tanggal, keterangan }, { onConflict: "tanggal" });
  if (error) return { ok: false, message: error.message };
  revalidateTag("hari-libur", "max");
  return { ok: true };
}

const MAX_RENTANG_HARI = 366; // batas wajar (maks ~1 tahun), jaga-jaga input keliru dari user

/**
 * Tambah hari libur untuk 1 hari (kalau sampaiTanggal kosong) atau sekaligus
 * untuk rentang tanggal dariTanggal..sampaiTanggal (inklusif), keterangan
 * sama untuk semua tanggal di rentang itu — cocok buat "Cuti Bersama Idul
 * Fitri" yang biasanya beberapa hari sekaligus.
 */
export async function addHariLiburRange(
  dariTanggal: string,
  sampaiTanggal: string,
  keterangan: string
): Promise<{ ok: boolean; message?: string; jumlah?: number }> {
  const akhir = sampaiTanggal || dariTanggal;
  if (akhir < dariTanggal) {
    return { ok: false, message: '"Sampai Tanggal" tidak boleh sebelum "Tanggal".' };
  }

  const rows: { tanggal: string; keterangan: string }[] = [];
  let cur = dariTanggal;
  let pengaman = 0;
  while (cur <= akhir) {
    rows.push({ tanggal: cur, keterangan });
    cur = addDaysJakarta(cur, 1);
    pengaman++;
    if (pengaman > MAX_RENTANG_HARI) {
      return { ok: false, message: `Rentang tanggal terlalu panjang (maks ${MAX_RENTANG_HARI} hari).` };
    }
  }

  const { error } = await supabaseAdmin.from("hari_libur").upsert(rows, { onConflict: "tanggal" });
  if (error) return { ok: false, message: error.message };
  revalidateTag("hari-libur", "max");
  return { ok: true, jumlah: rows.length };
}

export async function deleteHariLibur(id: number): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabaseAdmin.from("hari_libur").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidateTag("hari-libur", "max");
  return { ok: true };
}

/**
 * Sinkronisasi hari libur nasional Indonesia dari kalender publik Google
 * ("Indonesian Holidays" — id.indonesian#holiday@group.v.calendar.google.com).
 * Kalender ini gratis & tanpa perlu OAuth, tapi endpoint Calendar API-nya
 * tetap mensyaratkan API key Google Cloud biasa (bukan credential akun
 * pribadi, cukup "API key" yang dibatasi ke Calendar API saja).
 *
 * Perlu env var GOOGLE_CALENDAR_API_KEY diisi — beda dari versi PHP
 * sebelumnya, sengaja TIDAK di-hardcode di source code.
 */
export async function syncLiburNasional(
  tahun: number
): Promise<{ ok: boolean; message?: string; jumlah?: number }> {
  const apiKey = process.env.GOOGLE_CALENDAR_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      message: "GOOGLE_CALENDAR_API_KEY belum diisi di environment variable server.",
    };
  }

  const calendarId = encodeURIComponent("id.indonesian#holiday@group.v.calendar.google.com");
  const timeMin = encodeURIComponent(`${tahun}-01-01T00:00:00Z`);
  const timeMax = encodeURIComponent(`${tahun}-12-31T23:59:59Z`);
  const url =
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events` +
    `?key=${apiKey}&timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=100`;

  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (e) {
    return { ok: false, message: "Koneksi ke Google Calendar gagal: " + (e instanceof Error ? e.message : "unknown") };
  }

  if (!res.ok) {
    let pesanError = `HTTP ${res.status}`;
    try {
      const errBody = await res.json();
      pesanError = errBody?.error?.message ?? pesanError;
    } catch {
      // respons bukan JSON, biarkan pesanError apa adanya
    }
    return { ok: false, message: "Google API Error: " + pesanError };
  }

  const result = await res.json();
  const items: Array<{ start?: { date?: string }; summary?: string }> = result.items ?? [];

  const rows: { tanggal: string; keterangan: string }[] = [];
  for (const item of items) {
    const tglEvent = item.start?.date; // all-day event -> start.date (bukan start.dateTime)
    const namaEvent = item.summary;
    if (!tglEvent || !namaEvent) continue;
    if (!tglEvent.startsWith(String(tahun))) continue; // jaga-jaga event nyebrang tahun
    rows.push({ tanggal: tglEvent, keterangan: namaEvent });
  }

  if (rows.length === 0) {
    return { ok: false, message: `Tidak ada data libur dari Google Calendar untuk tahun ${tahun}.` };
  }

  const { error } = await supabaseAdmin.from("hari_libur").upsert(rows, { onConflict: "tanggal" });
  if (error) return { ok: false, message: error.message };

  revalidateTag("hari-libur", "max");
  return { ok: true, jumlah: rows.length };
}
