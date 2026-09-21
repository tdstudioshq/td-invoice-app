import type { Metadata, Viewport } from "next";
import { Bebas_Neue, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import { SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from "@/lib/site";

// Canonical public origin; preview hostnames must not replace the business URL.
const siteUrl = SITE_URL;

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
  applicationName: "TD Studios",
  title: {
    default: SITE_TITLE,
    template: "%s · TD Studios",
  },
  description: SITE_DESCRIPTION,
  appleWebApp: {
    capable: true,
    title: "TD Studios",
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
