import { supabaseAdmin } from "@/lib/supabase/server";

export async function getSettingValue(key: string, fallback = ""): Promise<string> {
  const { data } = await supabaseAdmin.from("settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? fallback;
}

export async function setSettingValue(key: string, value: string): Promise<{ error: string | null }> {
  const { error } = await supabaseAdmin.from("settings").upsert({ key, value }, { onConflict: "key" });
  return { error: error?.message ?? null };
}
