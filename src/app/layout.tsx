import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { BRAND } from "@/lib/config";

export const metadata: Metadata = {
  title: { default: `${BRAND.name} — ${BRAND.tagline}`, template: `%s · ${BRAND.name}` },
  description: "AI-powered event planning, verified vendors and escrow payments in Nigeria.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { themeColor: "#065f46", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Nav />
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <footer className="no-print mx-auto max-w-6xl px-4 py-10 text-xs text-stone-400">
          © {new Date().getFullYear()} {BRAND.name}. Payments are processed and held by licensed partners.
        </footer>
      </body>
    </html>
  );
}
