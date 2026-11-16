/**
 * Tiruan supabaseAdmin untuk tes route (hanya dipakai tes). Dua hal penting:
 *  1. rpc() otomatis memeriksa NAMA parameter terhadap tanda tangan fungsi di file migrasi SQL (kontrak): salah ketik
 *     p_... atau parameter wajib yang tertinggal langsung membuat tes gagal, bukan baru ketahuan di produksi.
 *  2. from() merekam semua operasi (select/eq/not/...) agar tes bisa memastikan mis. kolom pin_hash tidak pernah dibaca.
 */
import fs from "fs";
import path from "path";

type Hasil = { data: unknown; error: { message: string; code?: string; details?: string; hint?: string } | null; count?: number | null };

export interface OperasiQuery {
  tabel: string;
  ops: [string, unknown[]][];
}

export interface Konteks {
  rpcCalls: { name: string; args: Record<string, unknown> }[];
  /** nama fungsi -> hasil. Tanpa entri: { data: null, error: null }. */
  rpc: Record<string, (args: Record<string, unknown>) => Hasil>;
  query: OperasiQuery[];
  /** nama tabel -> hasil query (maybeSingle mengambil elemen pertama bila data berupa array). */
  tabel: Record<string, Hasil>;
}

export function konteksBaru(): Konteks {
  return { rpcCalls: [], rpc: {}, query: [], tabel: {} };
}

export function resetKonteks(h: Konteks): void {
  h.rpcCalls = [];
  h.rpc = {};
  h.query = [];
  h.tabel = {};
}

const SQL_DIR = path.join(process.cwd(), "supabase", "migrations");

export function bacaMigrasi(nama: string): string {
  return fs.readFileSync(path.join(SQL_DIR, nama), "utf8");
}

export interface ParamSql { nama: string; wajib: boolean }

/** Parameter fungsi `public.<nama>(...)` dari migrasi (parameter ber-default = tidak wajib). */
export function paramFungsiSql(sql: string, nama: string): ParamSql[] {
  const re = new RegExp(`create or replace function public\\.${nama}\\(([\\s\\S]*?)\\)\\s*returns`, "i");
  const m = sql.match(re);
  if (!m) throw new Error(`fungsi ${nama} tidak ditemukan di migrasi`);
  return m[1]
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => ({ nama: x.split(/\s+/)[0], wajib: !/\bdefault\b/i.test(x) }));
}

let cacheSql: string | null = null;

export function kontrakRpc(nama: string, args: Record<string, unknown>): void {
  cacheSql ??= bacaMigrasi("027_pengajuan_izin.sql");
  const param = paramFungsiSql(cacheSql, nama);
  const kunci = Object.keys(args);
  const asing = kunci.filter((k) => !param.some((p) => p.nama === k));
  if (asing.length) throw new Error(`KONTRAK RPC ${nama}: parameter tidak dikenal di SQL: ${asing.join(", ")}`);
  const hilang = param.filter((p) => p.wajib && !kunci.includes(p.nama)).map((p) => p.nama);
  if (hilang.length) throw new Error(`KONTRAK RPC ${nama}: parameter wajib tidak dikirim: ${hilang.join(", ")}`);
}

export function buatTiruan(h: Konteks) {
  return {
    from(tabel: string) {
      const op: OperasiQuery = { tabel, ops: [] };
      h.query.push(op);
      const ambil = (): Hasil => h.tabel[tabel] ?? { data: [], error: null, count: 0 };
      const rantai: unknown = new Proxy(
        {},
        {
          get(_t, k) {
            if (k === "then") return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(ambil()).then(res, rej);
            if (k === "maybeSingle" || k === "single") {
              return async () => {
                op.ops.push([String(k), []]);
                const r = ambil();
                return { ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data };
              };
            }
            return (...a: unknown[]) => {
              op.ops.push([String(k), a]);
              return rantai;
            };
          },
        }
      );
      return rantai;
    },
    async rpc(name: string, args: Record<string, unknown>) {
      h.rpcCalls.push({ name, args });
      kontrakRpc(name, args);
      const f = h.rpc[name];
      return f ? f(args) : { data: null, error: null };
    },
  };
}

/** Semua argumen `select` yang pernah dikirim ke sebuah tabel (untuk memastikan kolom sensitif tidak dibaca). */
export function kolomDipilih(h: Konteks, tabel: string): string[] {
  return h.query.filter((q) => q.tabel === tabel).flatMap((q) => q.ops.filter(([m]) => m === "select").map(([, a]) => String(a[0] ?? "")));
}
