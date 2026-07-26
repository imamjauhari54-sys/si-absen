"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="id">
      <body style={{ fontFamily: "sans-serif", background: "#0b0f1a", color: "#f1f5f9" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
          <div style={{ textAlign: "center", maxWidth: 420 }}>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 800, marginBottom: "0.5rem" }}>Terjadi Kesalahan Fatal</h1>
            <p style={{ fontSize: "0.875rem", color: "#94a3b8", marginBottom: "1.5rem" }}>
              Aplikasi gagal dimuat. Coba muat ulang halaman.
            </p>
            <button
              onClick={reset}
              style={{
                padding: "0.65rem 1.5rem",
                background: "#6366f1",
                color: "white",
                border: "none",
                borderRadius: "0.75rem",
                fontWeight: 700,
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              Muat Ulang
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
