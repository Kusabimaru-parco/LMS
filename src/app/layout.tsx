import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";

// Fonts are downloaded at build time and served from this server: no requests to Google from
// students' browsers (privacy), and nothing external for the Content Security Policy to allow.
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin", "latin-ext"], variable: "--font-jakarta", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin", "latin-ext"], variable: "--font-fraunces", display: "swap", axes: ["SOFT", "opsz"] });

export const metadata: Metadata = {
  title: { default: "Campus LMS", template: "%s · Campus LMS" },
  description: "A simple, modern learning management system for schools.",
  icons: { icon: "/api/pwa-icon/192", apple: "/api/pwa-icon/180" },
  appleWebApp: { capable: true, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f6f4ef",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${fraunces.variable}`}>
      <body className="min-h-dvh font-sans">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
