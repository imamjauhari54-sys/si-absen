"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export function AutoPrint() {
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get("print") === "1") {
      const t = setTimeout(() => window.print(), 600);
      return () => clearTimeout(t);
    }
  }, [searchParams]);
  return null;
}

export function TombolCetak() {
  return (
    <button onClick={() => window.print()} className="btn-print">
      🖨️ Cetak / Simpan PDF
    </button>
  );
}

export function TombolTutup() {
  return (
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault();
        window.close();
      }}
      className="btn-back"
    >
      Tutup
    </a>
  );
}
