import type { Metadata, Viewport } from "next";
import { Bebas_Neue, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";

// Absolute base for metadata URLs. Set NEXT_PUBLIC_SITE_URL in production;
// falls back to the Vercel-provided URL, then localhost for dev.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");

// Bebas Neue only ships a single 400 weight and has no lowercase — it renders
// everything in caps by design.
const bebasNeue = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-bebas",
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "TD Studios Invoicing",
  title: {
    default: "TD Studios — Invoicing",
    template: "%s · TD Studios",
  },
  description:
    "TD Studios invoicing — manage clients, create invoices, and track payments.",
  appleWebApp: {
    capable: true,
    title: "TD Invoices",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark",
  themeColor: "#18181b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "dark h-full",
        "antialiased",
        geistSans.variable,
        geistMono.variable,
        "font-sans",
        bebasNeue.variable,
      )}
      style={{ colorScheme: "dark" }}
    >
      <body className="bg-background text-foreground min-h-full flex flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
