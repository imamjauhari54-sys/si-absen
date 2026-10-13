/**
 * Jenis notifikasi WhatsApp ke orang tua yang bisa diaktifkan/dimatikan admin (tanpa deploy).
 * Modul murni (tanpa akses database) supaya bisa dipakai di server MAUPUN form klien.
 */

export type JenisNotif = "hadir" | "terlambat" | "pulang" | "alpha";
export type PengaturanNotif = Record<JenisNotif, boolean>;

export interface InfoJenisNotif {
  kunci: JenisNotif;
  /** Kunci di tabel settings. Nilainya "true" / "false". */
  settingKey: string;
  label: string;
  kapan: string;
  keterangan: string;
}

export const JENIS_NOTIF: InfoJenisNotif[] = [
  {
    kunci: "hadir",
    settingKey: "wa_notif_hadir",
    label: "Hadir",
    kapan: "Saat siswa scan masuk tepat waktu",
    keterangan: "Orang tua mendapat informasi bahwa anak sudah sampai di sekolah.",
  },
  {
    kunci: "terlambat",
    settingKey: "wa_notif_terlambat",
    label: "Terlambat",
    kapan: "Saat siswa scan masuk setelah batas terlambat",
    keterangan: "Orang tua mendapat informasi bahwa anak datang terlambat.",
  },
  {
    kunci: "pulang",
    settingKey: "wa_notif_pulang",
    label: "Pulang",
    kapan: "Saat siswa scan pulang",
    keterangan: "Orang tua mendapat informasi bahwa anak sudah scan pulang. Ini tidak otomatis berarti anak sudah tiba di rumah.",
  },
  {
    kunci: "alpha",
    settingKey: "wa_notif_alpha",
    label: "Alpha",
    kapan: "Saat siswa ditetapkan tidak hadir (setelah auto-alpha selesai)",
    keterangan: "Orang tua mendapat informasi bahwa anak tercatat tidak hadir hari itu.",
  },
];

/**
 * Bawaan di sisi SERVER: dipakai kalau pengaturan belum pernah disimpan, jadi sistem tetap aman
 * (tidak membanjiri orang tua dengan pesan) walaupun tabel settings masih kosong.
 */
export const DEFAULT_NOTIF: PengaturanNotif = { hadir: false, terlambat: false, pulang: false, alpha: true };

/** Ubah nilai mentah dari tabel settings ("true"/"false"/kosong) menjadi pengaturan; yang tidak jelas → bawaan. */
export function parseNotif(mentah: Partial<Record<JenisNotif, string | null | undefined>>): PengaturanNotif {
  const hasil = { ...DEFAULT_NOTIF };
  for (const j of JENIS_NOTIF) {
    const v = mentah[j.kunci];
    if (v === "true") hasil[j.kunci] = true;
    else if (v === "false") hasil[j.kunci] = false;
  }
  return hasil;
}
