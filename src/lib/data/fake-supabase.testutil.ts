/**
 * Database tiruan di memori untuk tes integrasi lapisan data. Meniru perilaku PostgREST yang relevan:
 *  - filter eq/neq/gt/gte/lt/lte/in/is/not, order, range, limit;
 *  - batas baris per permintaan (default 1000, seperti "Max rows" Supabase): hasil TERPOTONG DIAM-DIAM tanpa galat,
 *    sehingga query tanpa paginasi menghasilkan angka salah — persis seperti di produksi.
 * Hanya dipakai tes (tidak diimpor kode produksi).
 */
export type Baris = Record<string, unknown>;
export type Db = Record<string, Baris[]>;

export interface OpsiFake {
  batasBaris?: number;
  rpc?: Record<string, (args: Record<string, unknown>) => unknown>;
}

export function buatFakeSupabase(db: Db, opsi: OpsiFake = {}) {
  const batas = opsi.batasBaris ?? 1000;
  const log = { permintaan: [] as { tabel: string; jumlah: number; terpotong: boolean }[], rpc: [] as string[] };

  function from(tabel: string) {
    const filters: ((r: Baris) => boolean)[] = [];
    const urut: { c: string; asc: boolean }[] = [];
    let rentang: [number, number] | null = null;
    let batasUser: number | null = null;

    const b: Record<string, unknown> = {};
    const kembalikan = () => b;
    b.select = kembalikan;
    b.eq = (c: string, v: unknown) => (filters.push((r) => r[c] === v), b);
    b.neq = (c: string, v: unknown) => (filters.push((r) => r[c] !== v), b);
    b.gt = (c: string, v: string) => (filters.push((r) => (r[c] as string) > v), b);
    b.gte = (c: string, v: string) => (filters.push((r) => (r[c] as string) >= v), b);
    b.lt = (c: string, v: string) => (filters.push((r) => (r[c] as string) < v), b);
    b.lte = (c: string, v: string) => (filters.push((r) => (r[c] as string) <= v), b);
    b.in = (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), b);
    b.is = (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), b);
    b.not = (c: string, op: string, v: unknown) => (op === "is" ? filters.push((r) => (r[c] ?? null) !== v) : null, b);
    b.order = (c: string, o: { ascending?: boolean } = {}) => (urut.push({ c, asc: o.ascending !== false }), b);
    b.range = (a: number, z: number) => ((rentang = [a, z]), b);
    b.limit = (n: number) => ((batasUser = n), b);
    b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
      let rows = (db[tabel] ?? []).filter((r) => filters.every((f) => f(r)));
      for (const o of [...urut].reverse()) {
        rows = [...rows].sort((x, y) => {
          const a = x[o.c] as string | number, c = y[o.c] as string | number;
          return (a < c ? -1 : a > c ? 1 : 0) * (o.asc ? 1 : -1);
        });
      }
      let diminta = rows.length;
      let keluar: Baris[];
      if (rentang) {
        const [a, z] = rentang;
        diminta = z - a + 1;
        keluar = rows.slice(a, a + Math.min(diminta, batas));
      } else {
        const n = Math.min(batasUser ?? Infinity, batas);
        keluar = rows.slice(0, n);
      }
      log.permintaan.push({ tabel, jumlah: keluar.length, terpotong: !rentang && rows.length > keluar.length && batasUser === null });
      return Promise.resolve({ data: keluar.map((r) => ({ ...r })), error: null }).then(res, rej);
    };
    return b;
  }

  return {
    log,
    client: {
      from,
      rpc: async (nama: string, args: Record<string, unknown>) => {
        log.rpc.push(nama);
        const fn = opsi.rpc?.[nama];
        if (!fn) return { data: null, error: { message: `rpc ${nama} tidak disediakan di fake`, code: "PGRST202" } };
        try {
          return { data: fn(args), error: null };
        } catch (e) {
          return { data: null, error: { message: e instanceof Error ? e.message : String(e), code: "22008" } };
        }
      },
    },
  };
}
