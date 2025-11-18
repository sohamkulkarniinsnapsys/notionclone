// apps/frontend/app/layout.tsx
import "./globals.css";
import "tippy.js/dist/tippy.css";
import React from "react";
import SessionProvider from "@/components/SessionProvider";
import Header from "@/components/Header";
import PerformanceMonitor from "@/components/PerformanceMonitor";
import { Inter } from "next/font/google";
import type { Metadata, Viewport } from "next";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  preload: true,
  adjustFontFallback: true,
});

export const metadata: Metadata = {
  title: {
    default: "Notion Clone - Collaborative Editor",
    template: "%s | Notion Clone",
  },
  description:
    "Real-time collaborative document editor with Notion-like features. Create, edit, and share documents with your team in real-time.",
  keywords: [
    "notion",
    "collaborative editor",
    "real-time",
    "documents",
    "editor",
    "productivity",
  ],
  authors: [{ name: "Notion Clone Team" }],
  creator: "Notion Clone Team",
  publisher: "Notion Clone",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  ),
  openGraph: {
    title: "Notion Clone - Collaborative Editor",
    description:
      "Real-time collaborative document editor with Notion-like features",
    type: "website",
    locale: "en_US",
    siteName: "Notion Clone",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/favicon.ico",
  },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* DNS Prefetch for external resources */}
        <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
        <link rel="dns-prefetch" href="https://fonts.gstatic.com" />

        {/* Preconnect for critical resources */}
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
          crossOrigin="anonymous"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />

        {/* Resource hints */}
        <meta httpEquiv="x-ua-compatible" content="IE=edge" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <PerformanceMonitor />
        <SessionProvider>
          <div
            className="flex min-h-screen flex-col"
            style={{
              containIntrinsicSize: "auto 100vh",
              contentVisibility: "auto",
            }}
          >
            <Header />
            <main
              className="flex flex-1"
              id="main-content"
              role="main"
              aria-label="Main content"
            >
              {children}
            </main>
          </div>
        </SessionProvider>

        {/* Performance monitoring placeholder */}
        <noscript>
          <div
            style={{
              padding: "1rem",
              background: "#fff3cd",
              border: "1px solid #ffc107",
              margin: "1rem",
              borderRadius: "4px",
            }}
          >
            <strong>JavaScript Required:</strong> This application requires
            JavaScript to be enabled for full functionality.
          </div>
        </noscript>
      </body>
    </html>
  );
}
