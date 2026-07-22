import { supabaseAdmin } from "@/lib/supabase/server";

export interface HariLiburRow {
  id: number;
  tanggal: string;
  keterangan: string;
}

/** Map tanggal (YYYY-MM-DD) -> keterangan, buat lookup cepat O(1). */
export async function getHariLiburMap(): Promise<Map<string, string>> {
  const { data } = await supabaseAdmin.from("hari_libur").select("tanggal, keterangan");
  return new Map((data ?? []).map((r) => [r.tanggal, r.keterangan]));
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
  return { ok: true };
}

export async function deleteHariLibur(id: number): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabaseAdmin.from("hari_libur").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
