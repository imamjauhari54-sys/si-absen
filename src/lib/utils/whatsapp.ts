/**
 * Utilitas kirim WhatsApp lewat gateway generik yang kompatibel dengan format
 * kebanyakan provider populer di Indonesia (Fonnte, Wablas, dll): POST JSON
 * berisi { target, message } dengan header Authorization = API key.
 *
 * Khusus Fonnte ada jalur BATCH (banyak target dalam satu permintaan + jeda acak antar pesan,
 * kirimWhatsAppFonnteBatch). Kalau provider yang dipakai sekolah punya format beda, cukup
 * sesuaikan file ini saja — bagian lain aplikasi tidak perlu diubah.
 */

const TIMEOUT_SATU_MS = 15_000;
const TIMEOUT_BATCH_MS = 30_000;

/** Jeda ACAK (detik) antar pesan di dalam satu batch Fonnte. Harus berupa teks, bukan angka. */
export const DELAY_BATCH_FONNTE = "6-15";
/** Jumlah penerima maksimum per permintaan batch. */
export const MAKS_PENERIMA_BATCH = 100;

export function formatNomorWa(nomorMentah: string): string | null {
  const digits = nomorMentah.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("8")) return "62" + digits;
  return digits;
}

/** Alasan penolakan gateway yang umum → keterangan Indonesia (teks asli tetap disertakan). */
const ALASAN: Record<string, string> = {
  "token invalid": "Token gateway tidak valid",
  "insufficient quota": "Kuota pesan gateway tidak cukup",
  "target invalid": "Nomor tujuan tidak valid",
  "input invalid": "Permintaan ditolak gateway (input tidak valid)",
};

function terjemahkanAlasan(alasan: string): string {
  const hasil = ALASAN[alasan.trim().toLowerCase()];
  return hasil ? `${hasil} (${alasan})` : alasan;
}

/**
 * Menilai balasan gateway. Fonnte (dan kebanyakan gateway lain) mengembalikan kegagalan seperti
 * token salah / kuota habis / perangkat terputus sebagai `status: false` di ISI balasan, jadi
 * memeriksa kode HTTP saja tidak cukup — kegagalan semacam itu akan salah tercatat "terkirim".
 * Balasan yang bukan JSON dianggap berhasil kalau HTTP-nya berhasil.
 */
async function nilaiBalasan(res: Response): Promise<{ ok: boolean; error?: string }> {
  let gagalDiBody = false;
  let alasan: string | null = null;
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object") {
      const b = body as Record<string, unknown>;
      if ((b.status ?? b.Status) === false) gagalDiBody = true;
      const r = b.reason ?? b.message ?? b.detail;
      if (typeof r === "string") alasan = r;
    }
  } catch {
    /* bukan JSON */
  }

  if (!res.ok) {
    return { ok: false, error: `Gateway WA merespons status ${res.status}` + (alasan ? `: ${terjemahkanAlasan(alasan)}` : "") };
  }
  if (gagalDiBody) return { ok: false, error: terjemahkanAlasan(alasan ?? "Gateway WA menolak permintaan.") };
  return { ok: true };
}

function pesanGalat(e: unknown, timeoutMs: number): string {
  if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
    return `Gateway WA tidak merespons dalam ${timeoutMs / 1000} detik.`;
  }
  return e instanceof Error ? e.message : "Gagal menghubungi gateway WA.";
}

export async function kirimWhatsApp(
  gatewayUrl: string,
  apiKey: string,
  nomorMentah: string,
  pesan: string
): Promise<{ ok: boolean; error?: string }> {
  const nomor = formatNomorWa(nomorMentah);
  if (!nomor) return { ok: false, error: "Nomor HP tidak valid." };

  try {
    const res = await fetch(gatewayUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: apiKey },
      body: JSON.stringify({ target: nomor, message: pesan }),
      // Tanpa batas waktu, gateway yang menggantung menahan fungsi sampai dihentikan platform
      // dan percobaan itu hilang tanpa jejak di wa_log.
      signal: AbortSignal.timeout(TIMEOUT_SATU_MS),
    });
    return await nilaiBalasan(res);
  } catch (e) {
    return { ok: false, error: pesanGalat(e, TIMEOUT_SATU_MS) };
  }
}

// ── FONNTE BATCH ────────────────────────────────────────────────────────────

/** Gateway Fonnte? (hostname fonnte.com atau subdomainnya). */
export function isFonnte(gatewayUrl: string): boolean {
  try {
    const host = new URL(gatewayUrl).hostname.toLowerCase();
    return host === "fonnte.com" || host.endsWith(".fonnte.com");
  } catch {
    return false;
  }
}

export interface PenerimaBatch {
  /** Sudah dinormalisasi (62…). */
  nomor: string;
  nama: string;
  kelas: string;
}

/** Koma memisahkan target dan "|" memisahkan variabel di format target Fonnte → keduanya dibuang dari nilai. */
function bersihkanVariabel(teks: string, cadangan: string): string {
  const bersih = teks.replace(/[,|\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  return bersih || cadangan;
}

/** "62812…|Budi Santoso|5A,62813…|Ani|5B" — nama jadi {name}, kelas jadi {var1} di isi pesan. */
export function bangunTargetFonnte(penerima: PenerimaBatch[]): string {
  return penerima.map((p) => `${p.nomor}|${bersihkanVariabel(p.nama, "Siswa")}|${bersihkanVariabel(p.kelas, "-")}`).join(",");
}

/**
 * Kirim satu pesan templat ke banyak penerima dalam SATU permintaan, dengan jeda acak antar pesan
 * yang diatur Fonnte sendiri (parameter `delay`). `pesan` memakai {name} dan {var1}.
 * Catatan: balasan sukses berarti pesan DITERIMA & diantrekan Fonnte, bukan sudah sampai ke HP.
 * Kalau waktu tunggu habis, Fonnte mungkin saja sudah menerima batch-nya (tercatat gagal di sini).
 */
export async function kirimWhatsAppFonnteBatch(
  gatewayUrl: string,
  apiKey: string,
  penerima: PenerimaBatch[],
  pesan: string,
  delay: string = DELAY_BATCH_FONNTE
): Promise<{ ok: boolean; error?: string }> {
  if (penerima.length === 0) return { ok: true };

  try {
    const res = await fetch(gatewayUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: apiKey },
      body: JSON.stringify({ target: bangunTargetFonnte(penerima), message: pesan, delay }),
      signal: AbortSignal.timeout(TIMEOUT_BATCH_MS),
    });
    return await nilaiBalasan(res);
  } catch (e) {
    return { ok: false, error: pesanGalat(e, TIMEOUT_BATCH_MS) };
  }
}
