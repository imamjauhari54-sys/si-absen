export default function OfflinePage() {
  return (
    <html lang="id">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.75rem",
          fontFamily: "sans-serif",
          background: "#0b0f1a",
          color: "#f1f5f9",
          textAlign: "center",
          padding: "1.5rem",
        }}
      >
        <div style={{ fontSize: "3rem" }}>📡</div>
        <h1 style={{ fontSize: "1.25rem", margin: 0 }}>Tidak Ada Koneksi Internet</h1>
        <p style={{ color: "#64748b", maxWidth: 360, margin: 0 }}>
          SI-ABSEN memerlukan koneksi internet untuk memuat data. Silakan periksa
          jaringan kamu lalu coba lagi.
        </p>
      </body>
    </html>
  );
}
