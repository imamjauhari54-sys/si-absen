export type Role = "admin" | "guru";

export type StatusAbsen = "hadir" | "terlambat" | "izin" | "sakit" | "alpha";

// Payload yang disimpan di dalam JWT cookie sesi.
// Setara dengan $_SESSION di versi PHP.
export interface SessionPayload {
  userId: number;
  username: string;
  nama: string;
  role: Role;
  kelas: string; // kosong untuk admin
  foto: string | null;
}

// Payload sesi khusus Portal Siswa (login pakai NISN saja, read-only).
// SENGAJA dipisah dari SessionPayload di atas (cookie beda, JWT beda) supaya
// sesi siswa tidak pernah bisa disalahgunakan untuk akses halaman admin/guru,
// dan sebaliknya.
export interface StudentSessionPayload {
  siswaId: number;
  nama: string;
  kelas: string;
  nisn: string;
}

export interface UserRow {
  id: number;
  name: string;
  username: string;
  role: Role;
  foto: string | null;
  kelas: string | null; // hanya untuk role guru (wali kelas)
}

export interface Student {
  id: number;
  name: string;
  class: string;
  foto: string | null;
}

export type StatusSiswa = "aktif" | "lulus" | "pindah";

export interface StudentFull extends Student {
  nisn: string | null;
  jenis_kelamin: string | null; // 'L' | 'P'
  token: string | null;
  no_hp_ortu: string | null;
  status?: StatusSiswa;
}

export interface AbsensiSetting {
  jam_masuk: string | null;
  batas_terlambat: string | null;
  jam_pulang_mulai: string | null;
  tapel: string | null;
  semester: string | null;
  durasi_kunci_menit: number | null;
  toleransi_pagi_menit: number | null;
}

export interface AbsensiRow {
  id: number;
  siswa_id: number;
  tanggal: string;
  status: StatusAbsen;
  jam_masuk: string | null;
  keterangan: string | null;
  created_at: string;
}

export interface RecentScan {
  jam_masuk: string | null;
  status: StatusAbsen;
  name: string;
  class: string;
  foto: string | null;
  created_at: string;
}

export interface AlphaBerturut {
  id: number;
  nama: string;
  kelas: string;
  foto: string | null;
  hari: number;
  sejak: string;
  sejakFmt: string;
}

export interface TrenHarian {
  tgl: string;
  n: number;
  total: number;
  isToday: boolean;
}

export type DeviceStatus = "online" | "idle" | "offline";

export interface ScanDeviceRow {
  scannerId: string;
  namaDevice: string;
  namaTampil: string;
  label: string | null;
  ipAddress: string;
  totalScans: number;
  scanHariIni: number;
  antrianOffline: number;
  lastSync: string | null;
  detikLalu: number | null;
  deviceStatus: DeviceStatus;
}

export interface ActivityLog {
  id: number;
  admin_id: number | null;
  siswa_id: number | null;
  status_lama: string | null;
  status_baru: string | null;
  keterangan: string | null;
  created_at: string;
  nama_admin: string;
  foto_admin: string | null;
  nama_siswa: string | null;
  kelas_siswa: string | null;
}
