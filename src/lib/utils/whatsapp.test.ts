import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  DELAY_BATCH_FONNTE,
  bangunTargetFonnte,
  formatNomorWa,
  isFonnte,
  kirimWhatsApp,
  kirimWhatsAppFonnteBatch,
} from "./whatsapp";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("formatNomorWa", () => {
  it("menormalkan ke 62…", () => {
    expect(formatNomorWa("0812-3456-7890")).toBe("6281234567890");
    expect(formatNomorWa("+62 812 3456 7890")).toBe("6281234567890");
    expect(formatNomorWa("81234567890")).toBe("6281234567890");
  });
  it("kosong / tanpa angka → null", () => {
    expect(formatNomorWa("")).toBeNull();
    expect(formatNomorWa("abc")).toBeNull();
  });
});

describe("isFonnte", () => {
  it("mengenali fonnte.com dan subdomainnya saja", () => {
    expect(isFonnte("https://api.fonnte.com/send")).toBe(true);
    expect(isFonnte("https://fonnte.com/x")).toBe(true);
    expect(isFonnte("https://api.wablas.com/send")).toBe(false);
    expect(isFonnte("https://fonnte.com.penipu.example/send")).toBe(false);
    expect(isFonnte("bukan url")).toBe(false);
  });
});

describe("bangunTargetFonnte", () => {
  it("format nomor|nama|kelas dipisah koma", () => {
    expect(
      bangunTargetFonnte([
        { nomor: "6281", nama: "Budi", kelas: "5A" },
        { nomor: "6282", nama: "Ani", kelas: "6" },
      ])
    ).toBe("6281|Budi|5A,6282|Ani|6");
  });

  it("koma, pipa, dan baris baru di nama/kelas dibuang (merusak pemisah target)", () => {
    expect(bangunTargetFonnte([{ nomor: "6281", nama: "Ahmad, S.Pd | Jr\nIII", kelas: "5,A" }])).toBe("6281|Ahmad S.Pd Jr III|5 A");
  });

  it("nama/kelas kosong diberi cadangan", () => {
    expect(bangunTargetFonnte([{ nomor: "6281", nama: "  ", kelas: "" }])).toBe("6281|Siswa|-");
  });
});

describe("kirimWhatsApp", () => {
  it("bentuk permintaan: POST JSON {target,message} + Authorization + batas waktu", async () => {
    fetchMock.mockResolvedValue(json({ status: true }));
    const hasil = await kirimWhatsApp("https://api.fonnte.com/send", "TOKEN", "0812 3456 7890", "halo");
    expect(hasil).toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.fonnte.com/send");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: "TOKEN", "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({ target: "6281234567890", message: "halo" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("nomor tidak valid → tidak memanggil gateway", async () => {
    const hasil = await kirimWhatsApp("https://x", "T", "abc", "halo");
    expect(hasil).toEqual({ ok: false, error: "Nomor HP tidak valid." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("HTTP 200 tapi status:false di isi balasan = GAGAL (token salah)", async () => {
    fetchMock.mockResolvedValue(json({ status: false, reason: "token invalid" }));
    const hasil = await kirimWhatsApp("https://x", "T", "0812345678", "halo");
    expect(hasil.ok).toBe(false);
    expect(hasil.error).toContain("Token gateway tidak valid");
    expect(hasil.error).toContain("token invalid"); // teks asli tetap ada
  });

  it("kunci 'Status' berhuruf besar juga dikenali", async () => {
    fetchMock.mockResolvedValue(json({ Status: false, reason: "insufficient quota" }));
    const hasil = await kirimWhatsApp("https://x", "T", "0812345678", "halo");
    expect(hasil.ok).toBe(false);
    expect(hasil.error).toContain("Kuota pesan gateway tidak cukup");
  });

  it("status:false tanpa alasan → pesan umum", async () => {
    fetchMock.mockResolvedValue(json({ status: false }));
    expect((await kirimWhatsApp("https://x", "T", "0812345678", "halo")).error).toBe("Gateway WA menolak permintaan.");
  });

  it("HTTP error disertai alasan dari isi balasan", async () => {
    fetchMock.mockResolvedValue(json({ reason: "target invalid" }, 400));
    const hasil = await kirimWhatsApp("https://x", "T", "0812345678", "halo");
    expect(hasil.ok).toBe(false);
    expect(hasil.error).toContain("status 400");
    expect(hasil.error).toContain("Nomor tujuan tidak valid");
  });

  it("HTTP error dengan isi bukan JSON tetap gagal", async () => {
    fetchMock.mockResolvedValue(new Response("Bad Gateway", { status: 502 }));
    const hasil = await kirimWhatsApp("https://x", "T", "0812345678", "halo");
    expect(hasil).toEqual({ ok: false, error: "Gateway WA merespons status 502" });
  });

  it("balasan sukses yang bukan JSON dianggap berhasil (gateway lain)", async () => {
    fetchMock.mockResolvedValue(new Response("OK", { status: 200 }));
    expect(await kirimWhatsApp("https://x", "T", "0812345678", "halo")).toEqual({ ok: true });
  });

  it("gateway tidak merespons (timeout) → gagal dengan keterangan jelas", async () => {
    fetchMock.mockRejectedValue(new DOMException("The operation timed out.", "TimeoutError"));
    const hasil = await kirimWhatsApp("https://x", "T", "0812345678", "halo");
    expect(hasil).toEqual({ ok: false, error: "Gateway WA tidak merespons dalam 15 detik." });
  });

  it("galat jaringan dilaporkan, tidak dilempar", async () => {
    fetchMock.mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));
    expect(await kirimWhatsApp("https://x", "T", "0812345678", "halo")).toEqual({ ok: false, error: "getaddrinfo ENOTFOUND" });
  });
});

describe("kirimWhatsAppFonnteBatch", () => {
  const penerima = [
    { nomor: "6281", nama: "Budi", kelas: "5" },
    { nomor: "6282", nama: "Ani", kelas: "6" },
  ];

  it("satu permintaan: banyak target, templat, dan delay berupa TEKS", async () => {
    fetchMock.mockResolvedValue(json({ status: true, process: "pending" }));
    const hasil = await kirimWhatsAppFonnteBatch("https://api.fonnte.com/send", "TOKEN", penerima, "Halo {name} kelas {var1}");
    expect(hasil).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ target: "6281|Budi|5,6282|Ani|6", message: "Halo {name} kelas {var1}", delay: DELAY_BATCH_FONNTE });
    expect(typeof body.delay).toBe("string"); // Fonnte: angka biasa tidak berfungsi
    expect(body.delay).toMatch(/^\d+-\d+$/);
  });

  it("daftar kosong → berhasil tanpa memanggil gateway", async () => {
    expect(await kirimWhatsAppFonnteBatch("https://x", "T", [], "x")).toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("kuota tidak cukup → gagal untuk seluruh batch dengan alasan jelas", async () => {
    fetchMock.mockResolvedValue(json({ status: false, reason: "insufficient quota" }));
    const hasil = await kirimWhatsAppFonnteBatch("https://x", "T", penerima, "x");
    expect(hasil.ok).toBe(false);
    expect(hasil.error).toContain("Kuota pesan gateway tidak cukup");
  });

  it("timeout batch menyebut 30 detik", async () => {
    fetchMock.mockRejectedValue(new DOMException("t", "TimeoutError"));
    expect((await kirimWhatsAppFonnteBatch("https://x", "T", penerima, "x")).error).toBe("Gateway WA tidak merespons dalam 30 detik.");
  });
});
