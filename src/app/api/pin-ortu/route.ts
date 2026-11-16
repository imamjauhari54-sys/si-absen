import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getBatasKelas } from "@/lib/auth/akses-kelas";
import { supabaseAdmin } from "@/lib/supabase/server";
import { ambilStatusPinKelas, GalatBaca } from "@/lib/data/pengajuan";
import { catatLog } from "@/lib/data/log-aktivitas";
import { jawabGalat, jawabOk } from "@/lib/api/respons";
import { bolehScanSiswa } from "@/lib/utils/absen-scan";
import { bacaBodyJson, GALAT_BODY, parseAksiPin, petakanGalatDb } from "@/lib/utils/pengajuan";

/**
 * Kelola PIN orang tua (wali kelas: kelasnya; admin: semua).
 *
 *  GET  /api/pin-ortu?kelas=5   status per siswa (sudah ada PIN? sudah dibagikan? terkunci?). HASH/PIN TIDAK PERNAH dikirim.
 *  POST { action: "buat" | "reset" | "tandai_dibagikan", siswa_ids: number[] }
 *    buat             PIN acak hanya untuk siswa yang BELUM punya PIN (yang sudah punya dilewati, jadi PIN yang
 *                     sudah dibagikan tidak mati tanpa sengaja).
 *    reset            PIN acak BARU untuk siswa terpilih: PIN lama langsung mati, kunci dibuka, status "dibagikan" dikosongkan.
 *    tandai_dibagikan wali kelas menyatakan PIN sudah diberikan ke orang tua. Tidak pernah otomatis.
 *  PIN polos HANYA ada di respons buat/reset, sekali ini saja (Cache-Control: no-store). Yang tersimpan hanya hash bcrypt,
 *  dan PIN tidak pernah masuk log.
 */

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "guru")) {
    return jawabGalat({ ok: false, status: 403, message: "Unauthorized" });
  }
  const batas = await getBatasKelas(session);
  let kelas: string;
  if (batas.semua) {
    kelas = (req.nextUrl.searchParams.get("kelas") ?? "").trim();
    if (!kelas) return jawabGalat({ ok: false, status: 400, message: "Pilih kelas terlebih dahulu." });
  } else {
    if (!batas.kelas) return jawabGalat({ ok: false, status: 403, message: "Anda belum menjadi wali kelas." });
    kelas = batas.kelas;
  }
  try {
    return jawabOk({ kelas, siswa: await ambilStatusPinKelas(kelas) });
  } catch (e) {
    console.error("[api/pin-ortu GET] gagal:", e instanceof Error ? e.message : e);
    return jawabGalat(petakanGalatDb({ code: e instanceof GalatBaca ? e.kodeDb : null }));
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "guru")) {
    return jawabGalat({ ok: false, status: 403, message: "Unauthorized" });
  }
  const body = await bacaBodyJson(req);
  if (!body) return jawabGalat(GALAT_BODY);
  const p = parseAksiPin(body);
  if (!p.ok) return jawabGalat(p);

  try {
    // Otorisasi SEMUA siswa sekaligus, sebelum menulis apa pun: satu saja di luar kelas wali -> seluruh permintaan ditolak.
    const batas = await getBatasKelas(session);
    if (!batas.semua && !batas.kelas) return jawabGalat({ ok: false, status: 403, message: "Anda belum menjadi wali kelas." });

    const { data: baris, error: errSiswa } = await supabaseAdmin
      .from("students")
      .select("id, name, class, status")
      .in("id", p.siswaIds);
    if (errSiswa) {
      console.error("[api/pin-ortu] baca siswa gagal:", errSiswa.message);
      return jawabGalat(petakanGalatDb(errSiswa));
    }
    const siswa = (baris ?? []) as { id: number; name: string; class: string; status: string | null }[];
    if (siswa.length !== p.siswaIds.length) {
      // Guru: sama dengan "kelas lain" (tidak membedakan, supaya ID tidak bisa ditebak). Admin: 404 jelas.
      return batas.semua
        ? jawabGalat({ ok: false, status: 404, message: "Ada siswa yang tidak ditemukan." })
        : jawabGalat({ ok: false, status: 403, message: "Siswa ini bukan kelas Anda." });
    }
    if (!batas.semua && !siswa.every((s) => bolehScanSiswa("guru", batas.kelas, s.class))) {
      return jawabGalat({ ok: false, status: 403, message: "Siswa ini bukan kelas Anda." });
    }
    const nama = new Map(siswa.map((s) => [s.id, s]));
    const kelasLog = [...new Set(siswa.map((s) => s.class))].sort().join(", ");

    if (p.aksi === "tandai_dibagikan") {
      const { data, error } = await supabaseAdmin.rpc("tandai_pin_dibagikan", { p_siswa_ids: p.siswaIds });
      if (error) {
        console.error("[api/pin-ortu] tandai_pin_dibagikan gagal:", { code: error.code, message: error.message });
        return jawabGalat(petakanGalatDb(error));
      }
      const jumlah = typeof data === "number" ? data : 0;
      if (jumlah > 0) await catatLog(session.userId, "bagikan_pin_ortu", `Kelas ${kelasLog}`, `Menandai PIN orang tua sudah dibagikan untuk ${jumlah} siswa.`);
      return jawabOk({ message: `${jumlah} siswa ditandai sudah dibagikan.`, ditandai: jumlah });
    }

    // buat / reset: siswa yang tidak aktif tidak mendapat PIN (dilewati oleh SQL juga; di sini dilaporkan).
    let sasaran = siswa.filter((s) => s.status === "aktif");
    const dilewati: { siswaId: number; nama: string; alasan: string }[] = siswa
      .filter((s) => s.status !== "aktif")
      .map((s) => ({ siswaId: s.id, nama: s.name, alasan: "Siswa tidak aktif" }));

    if (p.aksi === "buat" && sasaran.length > 0) {
      const { data: sudah, error: errKunci } = await supabaseAdmin
        .from("kunci_ortu")
        .select("siswa_id")
        .in("siswa_id", sasaran.map((s) => s.id))
        .not("pin_hash", "is", null);
      if (errKunci) {
        console.error("[api/pin-ortu] baca kunci_ortu gagal:", errKunci.message);
        return jawabGalat(petakanGalatDb(errKunci));
      }
      const sudahAda = new Set(((sudah ?? []) as { siswa_id: number }[]).map((r) => r.siswa_id));
      for (const s of sasaran.filter((x) => sudahAda.has(x.id))) dilewati.push({ siswaId: s.id, nama: s.name, alasan: "PIN sudah dibuat (gunakan Reset bila perlu PIN baru)" });
      sasaran = sasaran.filter((s) => !sudahAda.has(s.id));
    }

    if (sasaran.length === 0) {
      return jawabOk({ message: "Tidak ada PIN yang dibuat.", pin: [], dilewati });
    }

    const { data: hasil, error } = await supabaseAdmin.rpc("buat_pin_acak_ortu", { p_siswa_ids: sasaran.map((s) => s.id) });
    if (error) {
      console.error("[api/pin-ortu] buat_pin_acak_ortu gagal:", { code: error.code, message: error.message });
      return jawabGalat(petakanGalatDb(error));
    }
    const dibuat = ((hasil ?? []) as { siswa_id: number; pin: string }[])
      .map((r) => ({ siswaId: r.siswa_id, nama: nama.get(r.siswa_id)?.name ?? "", kelas: nama.get(r.siswa_id)?.class ?? "", pin: r.pin }))
      .sort((a, b) => a.nama.localeCompare(b.nama, "id"));

    // Log TANPA PIN.
    await catatLog(
      session.userId,
      p.aksi === "reset" ? "reset_pin_ortu" : "buat_pin_ortu",
      `Kelas ${kelasLog}`,
      `${p.aksi === "reset" ? "Mereset" : "Membuat"} PIN acak orang tua untuk ${dibuat.length} siswa.`
    );
    return jawabOk({
      message: `${dibuat.length} PIN dibuat. Catat/cetak sekarang: PIN tidak dapat ditampilkan lagi.`,
      pin: dibuat,
      dilewati,
    });
  } catch (e) {
    console.error("[api/pin-ortu POST] gagal:", e instanceof Error ? e.message : e);
    return jawabGalat(petakanGalatDb({ code: e instanceof GalatBaca ? e.kodeDb : null }));
  }
}
