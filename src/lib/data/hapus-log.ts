import { supabaseAdmin } from "@/lib/supabase/server";
import { ambilSemua } from "@/lib/utils/ambil-semua";
import { formatWaktuWib } from "@/lib/utils/tanggal";
import { barisCsv, rentangWaktuWib, type JenisLog } from "@/lib/utils/hapus-log";

export interface OpsiHapusLog {
  /** Hanya WA: hapus yang terkirim saja, log gagal disisakan (berguna menelusuri nomor HP yang salah). */
  hanyaBerhasil?: boolean;
}

function param(jenis: JenisLog, dari: string, sampai: string, opsi: OpsiHapusLog) {
  const { mulai, sebelum } = rentangWaktuWib(dari, sampai);
  return { mulai, sebelum, hanyaTerkirim: jenis === "wa" && !!opsi.hanyaBerhasil };
}

/** Jumlah baris yang akan terhapus (untuk pratinjau sebelum konfirmasi). */
export async function hitungLogRentang(jenis: JenisLog, dari: string, sampai: string, opsi: OpsiHapusLog = {}): Promise<number> {
  const p = param(jenis, dari, sampai, opsi);
  let q = supabaseAdmin
    .from(jenis === "aktivitas" ? "log_aktivitas" : "wa_log")
    .select("id", { count: "exact", head: true })
    .gte("created_at", p.mulai)
    .lt("created_at", p.sebelum);
  if (p.hanyaTerkirim) q = q.eq("status", "terkirim");
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Hapus permanen; mengembalikan jumlah baris yang terhapus. */
export async function hapusLogRentang(jenis: JenisLog, dari: string, sampai: string, opsi: OpsiHapusLog = {}): Promise<number> {
  const p = param(jenis, dari, sampai, opsi);
  let q = supabaseAdmin
    .from(jenis === "aktivitas" ? "log_aktivitas" : "wa_log")
    .delete({ count: "exact" })
    .gte("created_at", p.mulai)
    .lt("created_at", p.sebelum);
  if (p.hanyaTerkirim) q = q.eq("status", "terkirim");
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** CSV isi log pada rentang itu (arsip sebelum dihapus). Kolom waktu dalam WIB. */
export async function buatCsvLogRentang(jenis: JenisLog, dari: string, sampai: string, opsi: OpsiHapusLog = {}): Promise<string> {
  const p = param(jenis, dari, sampai, opsi);
  if (jenis === "aktivitas") {
    const rows = await ambilSemua<{ created_at: string; aksi: string; target: string | null; keterangan: string | null; users: { name: string } | { name: string }[] | null }>(
      (a, b) =>
        supabaseAdmin
          .from("log_aktivitas")
          .select("id, created_at, aksi, target, keterangan, users(name)")
          .gte("created_at", p.mulai)
          .lt("created_at", p.sebelum)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(a, b)
    );
    let csv = barisCsv(["Waktu (WIB)", "Admin", "Aksi", "Target", "Keterangan"]);
    for (const r of rows) {
      const admin = Array.isArray(r.users) ? r.users[0] : r.users;
      csv += barisCsv([formatWaktuWib(r.created_at), admin?.name ?? "Sistem", r.aksi, r.target, r.keterangan]);
    }
    return csv;
  }
  const rows = await ambilSemua<{ created_at: string; nama_siswa: string; nomor_hp: string | null; tipe: string; status: string; error_message: string | null }>(
    (a, b) => {
      let q = supabaseAdmin
        .from("wa_log")
        .select("id, created_at, nama_siswa, nomor_hp, tipe, status, error_message")
        .gte("created_at", p.mulai)
        .lt("created_at", p.sebelum);
      if (p.hanyaTerkirim) q = q.eq("status", "terkirim");
      return q.order("created_at", { ascending: true }).order("id", { ascending: true }).range(a, b);
    }
  );
  let csv = barisCsv(["Waktu (WIB)", "Nama Siswa", "Nomor HP", "Tipe", "Status", "Pesan Error"]);
  for (const r of rows) {
    csv += barisCsv([formatWaktuWib(r.created_at), r.nama_siswa, r.nomor_hp ? `'${r.nomor_hp}` : "", r.tipe, r.status, r.error_message]);
  }
  return csv;
}
