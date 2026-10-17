import type { Metadata, Viewport } from "next";
import { Outfit, Sora } from "next/font/google";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const sora = Sora({ subsets: ["latin"], weight: ["700", "800"], variable: "--font-sora" });

export const metadata: Metadata = {
  title: "Paternity Leave Account Search",
  description: "Look up Tom's GOAL accounts from Notion",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${sora.variable}`}>
      <body className="min-h-screen bg-ground text-ink antialiased">{children}</body>
    </html>
  );
}
