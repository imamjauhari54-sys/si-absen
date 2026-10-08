import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import KpiWidgets from "./KpiWidgets";
import RingChart from "./RingChart";
import BelumAbsen from "./BelumAbsen";

// Kasus nyata: libur dicatat SETELAH auto-alpha jalan -> ada 6 record alpha di tanggal libur.
const stat = { hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpha: 6 };

describe("mode hari libur di kartu dashboard", () => {
  it("KpiWidgets: hari normal menampilkan alpha 6 / 100%", () => {
    const html = renderToStaticMarkup(createElement(KpiWidgets, { totalSiswa: 6, stat, batasTerlambat: "07:15" }));
    expect(html).toContain("100%");
    expect(html).not.toContain("Libur");
  });

  it("KpiWidgets: hari libur tidak menampilkan alpha 6 dan 100%, kartu kehadiran diberi label Libur", () => {
    const html = renderToStaticMarkup(createElement(KpiWidgets, { totalSiswa: 6, stat, batasTerlambat: "07:15", isLibur: true }));
    expect(html).toContain("Libur");
    expect(html).toContain("Terdaftar aktif"); // Total Siswa tetap tampil
    expect(html.match(/Libur/g)?.length).toBe(4); // Hadir, Terlambat, Izin/Sakit, Alpha
    expect(html).not.toContain("Tidak masuk");
    expect(html).toContain("100%"); // hanya badge Total Siswa
    expect(html.match(/100%/g)?.length).toBe(1);
  });

  it("RingChart: hari libur menampilkan Libur, bukan persen hadir", () => {
    const html = renderToStaticMarkup(createElement(RingChart, { totalSiswa: 6, stat, isLibur: true, pesanLibur: "Libur Mendadak" }));
    expect(html).toContain("Libur Mendadak");
    expect(html).not.toContain("Hadir/Telat");
  });

  it("BelumAbsen: hari libur tidak memajang daftar belum absen", () => {
    const html = renderToStaticMarkup(
      createElement(BelumAbsen, { belum: [], belumRecord: 0, pctHadir: 0, today: "2026-10-08", isLibur: true, pesanLibur: "Libur Mendadak" })
    );
    expect(html).toContain("Libur Mendadak");
    expect(html).not.toContain("Perlu Perhatian");
  });
});
