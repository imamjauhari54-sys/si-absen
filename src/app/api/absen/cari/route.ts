import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { cariSiswaUntukAbsen } from "@/lib/data/scan";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ status: "error", message: "Akses ditolak" }, { status: 403 });
  }

  const q = req.nextUrl.searchParams.get("q") || "";
  const list = await cariSiswaUntukAbsen(q);
  return NextResponse.json(list);
}
