/**
 * Utilitas kirim WhatsApp lewat gateway generik yang kompatibel dengan format
 * kebanyakan provider populer di Indonesia (Fonnte, Wablas, dll): POST JSON
 * berisi { target, message } dengan header Authorization = API key.
 *
 * Kalau provider yang dipakai sekolah punya format beda, cukup sesuaikan
 * fungsi kirimWhatsApp() di file ini saja — bagian lain aplikasi tidak perlu
 * diubah.
 */

export function formatNomorWa(nomorMentah: string): string | null {
  const digits = nomorMentah.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("8")) return "62" + digits;
  return digits;
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
    });
    if (!res.ok) return { ok: false, error: `Gateway WA merespons status ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Gagal menghubungi gateway WA." };
  }
}
