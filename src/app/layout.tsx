import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["500", "700"],
});

export const metadata: Metadata = {
  title: { default: "SI-ABSEN", template: "%s · SI-ABSEN" },
  description: "Sistem Informasi Absensi Siswa",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Default dark, sama seperti header.php: ($_COOKIE['theme'] ?? 'dark') === 'dark'
  const cookieStore = await cookies();
  const theme = cookieStore.get("theme")?.value ?? "dark";
  const isDark = theme === "dark";

  return (
    <html
      lang="id"
      className={`${jakarta.variable} ${jetbrainsMono.variable} ${isDark ? "dark" : ""}`}
    >
      <head>
        {/* Font Awesome dipertahankan dari versi PHP agar ikon konsisten 1:1.
            Bisa diganti ke lucide-react di iterasi berikutnya kalau mau full-React. */}
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
