import type { Metadata } from "next";
import React, { Suspense } from "react";
import { requireSession } from "@/lib/auth/session";
import { getSettingValue } from "@/lib/data/settings";
import { getStudentsForPrint } from "@/lib/data/siswa";
import IdCardVisual from "@/components/siswa/IdCardVisual";
import { AutoPrint, TombolCetak, TombolTutup } from "./print-controls";
import "./print.css";

export const metadata: Metadata = { title: "Cetak ID Card" };
export const dynamic = "force-dynamic";

export default async function CetakIdCardPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; kelas?: string; q?: string; print?: string }>;
}) {
  await requireSession(); // admin & guru sama-sama boleh cetak

  const params = await searchParams;
  const singleId = params.id ? parseInt(params.id, 10) : undefined;
  const kelasFilter = params.kelas ?? "";
  const search = (params.q ?? "").trim();

  const [namaSekolah, alamat, list] = await Promise.all([
    getSettingValue("nama_sekolah", "SI-ABSEN"),
    getSettingValue("alamat_sekolah", ""),
    getStudentsForPrint({ id: singleId, kelas: kelasFilter, search }),
  ]);

  const infoFilter = kelasFilter ? `Kelas ${kelasFilter}` : "Semua Kelas";

  return (
    <div className="cetak-body">
      <Suspense fallback={null}>
        <AutoPrint />
      </Suspense>

      <div className="action-bar">
        <div className="info">
          <strong>{list.length} ID Card</strong> · {infoFilter}
          {search && ` · Filter: "${search}"`}
          &nbsp;·&nbsp; A4 Portrait · 9 kartu/halaman
        </div>
        <div className="btns">
          <TombolTutup />
          <TombolCetak />
        </div>
      </div>
      <div className="spacer" />

      <div className="print-grid">
        {list.length === 0 ? (
          <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "20mm", color: "#94a3b8", fontSize: 14 }}>
            Tidak ada siswa ditemukan.
          </div>
        ) : (
          list.map((s, i) => (
            <React.Fragment key={s.id}>
              {i > 0 && i % 9 === 0 && (
                <div className="page-break-indicator">Halaman {Math.floor(i / 9) + 1}</div>
              )}
              <div className={`id-card-wrap${i > 0 && i % 9 === 0 ? " page-break-before" : ""}`}>
                <IdCardVisual
                  namaSekolah={namaSekolah}
                  alamat={alamat}
                  nama={s.name}
                  kelas={s.class}
                  nisn={s.nisn}
                  foto={s.foto}
                  token={s.token}
                />
              </div>
            </React.Fragment>
          ))
        )}
      </div>
    </div>
  );
}
