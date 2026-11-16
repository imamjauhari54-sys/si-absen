import { describe, it, expect, vi } from "vitest";
import { kirimJson, unggahLampiran } from "./pengajuan-klien";

const resp = (status: number, body: unknown) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const berkas = () => new Blob(["x"], { type: "image/jpeg" });
const SIG = { status: "ok", signature: "abc", timestamp: 1700000000, apiKey: "key", cloudName: "demo", folder: "si-absen/pengajuan", allowedFormats: "jpg,jpeg,png,webp" };

describe("kirimJson", () => {
  it("sukses: ok + pesan", async () => {
    const f = vi.fn(async () => resp(201, { status: "ok", message: "Terkirim" }));
    const r = await kirimJson("/x", { a: 1 }, f as unknown as typeof fetch);
    expect(r).toMatchObject({ ok: true, status: 201, pesan: "Terkirim" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/x");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(init.body).toBe('{"a":1}');
  });
  it("galat server: pesan, kode, dan field tambahan dipertahankan", async () => {
    const f = async () => resp(403, { status: "error", message: "PIN salah. Sisa percobaan: 3.", kode: "PIN_SALAH", sisa_percobaan: 3 });
    const r = await kirimJson("/x", {}, f as unknown as typeof fetch);
    expect(r).toMatchObject({ ok: false, status: 403, kode: "PIN_SALAH", pesan: "PIN salah. Sisa percobaan: 3.", data: { sisa_percobaan: 3 } });
  });
  it("401 -> kode SESI dengan petunjuk masuk kembali", async () => {
    const r = await kirimJson("/x", {}, (async () => resp(401, { status: "error", message: "x" })) as unknown as typeof fetch);
    expect(r).toMatchObject({ ok: false, kode: "SESI" });
    expect(r.pesan).toContain("masuk kembali");
  });
  it("jaringan putus -> pesan ramah, bukan exception", async () => {
    const r = await kirimJson("/x", {}, (async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch);
    expect(r).toMatchObject({ ok: false, status: 0, kode: "JARINGAN" });
  });
  it("respons bukan JSON (mis. halaman galat) -> pesan umum", async () => {
    const r = await kirimJson("/x", {}, (async () => new Response("<html>502</html>", { status: 502 })) as unknown as typeof fetch);
    expect(r).toMatchObject({ ok: false, status: 502, pesan: "Terjadi kesalahan. Silakan coba lagi." });
  });
  it("200 tetapi bukan status ok tidak dianggap sukses", async () => {
    const r = await kirimJson("/x", {}, (async () => resp(200, { hello: 1 })) as unknown as typeof fetch);
    expect(r.ok).toBe(false);
  });
});

describe("unggahLampiran", () => {
  it("alur: tanda tangan (dengan PIN) lalu Cloudinary dengan semua parameter yang ditandatangani", async () => {
    const f = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("cloudinary") ? resp(200, { secure_url: "https://res.cloudinary.com/demo/image/upload/v1/si-absen/pengajuan/a.jpg" }) : resp(200, SIG));
    const r = await unggahLampiran(berkas(), "483920", f as unknown as typeof fetch);
    expect(r).toEqual({ ok: true, url: "https://res.cloudinary.com/demo/image/upload/v1/si-absen/pengajuan/a.jpg" });
    const [u1, i1] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(u1).toBe("/portal-siswa/api/lampiran/signature");
    expect(i1.body).toBe('{"pin":"483920"}');
    const [u2, i2] = f.mock.calls[1] as unknown as [string, RequestInit];
    expect(u2).toBe("https://api.cloudinary.com/v1_1/demo/image/upload");
    const fd = i2.body as FormData;
    expect([...fd.keys()].sort()).toEqual(["allowed_formats", "api_key", "file", "folder", "signature", "timestamp"]);
    expect(fd.get("folder")).toBe("si-absen/pengajuan");
    expect(fd.get("signature")).toBe("abc");
    expect(fd.get("timestamp")).toBe("1700000000");
  });
  it("PIN salah: berhenti di tanda tangan, Cloudinary tidak dihubungi", async () => {
    const f = vi.fn(async () => resp(403, { status: "error", message: "PIN salah. Sisa percobaan: 2.", kode: "PIN_SALAH" }));
    const r = await unggahLampiran(berkas(), "000000", f as unknown as typeof fetch);
    expect(r).toEqual({ ok: false, pesan: "PIN salah. Sisa percobaan: 2.", kode: "PIN_SALAH" });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("tanda tangan dengan folder asing ditolak (klien tidak mengunggah ke folder lain)", async () => {
    const f = vi.fn(async () => resp(200, { ...SIG, folder: "si-absen/lain" }));
    const r = await unggahLampiran(berkas(), "483920", f as unknown as typeof fetch);
    expect(r.ok).toBe(false);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("Cloudinary menolak / jaringan putus -> pesan, bukan exception", async () => {
    const tolak = async (url: string | URL | Request) => String(url).includes("cloudinary") ? resp(400, { error: { message: "File format not allowed" } }) : resp(200, SIG);
    const r1 = await unggahLampiran(berkas(), "483920", tolak as unknown as typeof fetch);
    expect(r1).toMatchObject({ ok: false });
    expect((r1 as { pesan: string }).pesan).toContain("File format not allowed");
    const putus = async (url: string | URL | Request) => { if (String(url).includes("cloudinary")) throw new TypeError("x"); return resp(200, SIG); };
    expect((await unggahLampiran(berkas(), "483920", putus as unknown as typeof fetch)).ok).toBe(false);
  });
});
