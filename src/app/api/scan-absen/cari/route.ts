import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 50);
  if (q.length < 2) return NextResponse.json([]);

  // Escape wildcard ilike (% dan _) supaya input user diperlakukan sebagai
  // teks literal, bukan pattern — mencegah query yang nggak diinginkan
  // (mis. user cuma ngetik "%" buat nampilin semua siswa).
  const qEscaped = q.replace(/[%_]/g, (c) => `\\${c}`);

  const { data, error } = await supabaseAdmin
    .from("students")
    .select("id, name, class")
    .ilike("name", `%${qEscaped}%`)
    .order("name")
    .limit(10);

  if (error) return NextResponse.json({ error: "Search failed" }, { status: 500 });
  return NextResponse.json(data ?? []);
}
