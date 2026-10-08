import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import { cookies } from "next/headers";
import PwaRegister from "@/components/layout/PwaRegister";
import FontAwesomeLoader from "@/components/layout/FontAwesomeLoader";
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
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SI-ABSEN",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport = {
  themeColor: "#6366f1",
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
            Bisa diganti ke lucide-react di iterasi berikutnya kalau mau full-React.

            `preload` di sini cuma resource hint (nyuruh browser mulai
            download di background, nggak nahan render). Yang benar-benar
            masang-nya jadi stylesheet aktif itu <FontAwesomeLoader /> di
            bawah — soalnya trik `onload="..."` di HTML biasa ternyata
            di-strip sama React/Next punya penanganan khusus buat tag
            <link>, jadi nggak pernah ke-apply (makanya ikon sempat hilang).
            <noscript> jaga-jaga kalau JS mati. */}
        <link
          rel="preload"
          as="style"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"
        />
        <noscript>
          <link
            rel="stylesheet"
            href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"
          />
        </noscript>
      </head>
      <body className="antialiased">
        <FontAwesomeLoader />
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
