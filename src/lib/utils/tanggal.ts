const HARI: Record<string, string> = {
  Sunday: "Minggu", Monday: "Senin", Tuesday: "Selasa",
  Wednesday: "Rabu", Thursday: "Kamis", Friday: "Jumat", Saturday: "Sabtu",
};

const BULAN: Record<number, string> = {
  1: "Januari", 2: "Februari", 3: "Maret", 4: "April", 5: "Mei", 6: "Juni",
  7: "Juli", 8: "Agustus", 9: "September", 10: "Oktober", 11: "November", 12: "Desember",
};

const BULAN_SINGKAT: Record<number, string> = {
  1: "Jan", 2: "Feb", 3: "Mar", 4: "Apr", 5: "Mei", 6: "Jun",
  7: "Jul", 8: "Agu", 9: "Sep", 10: "Okt", 11: "Nov", 12: "Des",
};

const HARI_SINGKAT: Record<number, string> = {
  0: "Min", 1: "Sen", 2: "Sel", 3: "Rab", 4: "Kam", 5: "Jum", 6: "Sab",
};

/** YYYY-MM-DD di zona waktu Asia/Jakarta (WIB, UTC+7), tanpa lib eksternal. */
export function todayJakarta(): string {
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return wib.toISOString().slice(0, 10);
}

export function addDaysJakarta(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 1 = Senin ... 7 = Minggu (setara date('N') PHP). */
export function isoWeekday(dateStr: string): number {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay(); // 0=Minggu..6=Sabtu
  return day === 0 ? 7 : day;
}

export function todayLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const hariEn = d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  const tgl = String(d.getUTCDate()).padStart(2, "0");
  const bln = BULAN[d.getUTCMonth() + 1];
  return `${HARI[hariEn]}, ${tgl} ${bln} ${d.getUTCFullYear()}`;
}

export function bulanIni(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return BULAN[d.getUTCMonth() + 1];
}

export function hariSingkat(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return HARI_SINGKAT[d.getUTCDay()];
}

/** Contoh: 2026-04-06 → "6 Apr 2026" (port formatTglIndo di cek_alpha.php). */
export function formatTglIndo(dateStr: string | null): string {
  if (!dateStr) return "-";
  const d = new Date(`${dateStr}T00:00:00Z`);
  return `${d.getUTCDate()} ${BULAN_SINGKAT[d.getUTCMonth() + 1]} ${d.getUTCFullYear()}`;
}

export function formatTglPanjang(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const hariEn = d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  return `${HARI[hariEn]}, ${String(d.getUTCDate()).padStart(2, "0")} ${BULAN[d.getUTCMonth() + 1]} ${d.getUTCFullYear()}`;
}

export function jamSingkat(time: string | null): string | null {
  if (!time) return null;
  return time.slice(0, 5);
}

/** Tanggal & jam saat ini di zona Asia/Jakarta (WIB, UTC+7), tanpa lib eksternal. */
export function nowJakarta(): { tanggal: string; jam: string } {
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const tanggal = wib.toISOString().slice(0, 10);
  const jam = wib.toISOString().slice(11, 19); // HH:MM:SS
  return { tanggal, jam };
}

/** Tambah (atau kurangi, kalau menit negatif) menit ke string waktu "HH:MM:SS". */
export function tambahMenit(waktu: string, menit: number): string {
  const [h, m, s] = waktu.split(":").map(Number);
  let total = h * 60 + m + menit;
  total = ((total % 1440) + 1440) % 1440; // wrap 0-1439, aman untuk menit negatif
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  const ss = String(s ?? 0).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}
