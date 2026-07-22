import { supabaseAdmin } from "@/lib/supabase/server";

export async function getSettingValue(key: string, fallback = ""): Promise<string> {
  const { data } = await supabaseAdmin.from("settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? fallback;
}
