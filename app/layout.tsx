import "./globals.css";
import "tippy.js/dist/tippy.css";
import React from "react";
import SessionProvider from "@/components/SessionProvider";
import Header from "@/components/Header";
import PerformanceMonitor from "@/components/PerformanceMonitor";
import type { Metadata, Viewport } from "next";

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
    { media: "(prefers-color-scheme: dark)", color: "#191919" },
  ],
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
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

        {/* Inline script to set theme immediately - prevents flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  document.documentElement.setAttribute('data-theme', 'dark');
                  document.documentElement.style.backgroundColor = '#191919';
                  document.documentElement.style.colorScheme = 'dark';
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body
        suppressHydrationWarning
        style={{
          backgroundColor: "#191919",
          color: "rgba(255, 255, 255, 0.9)",
        }}
      >
        <PerformanceMonitor />
        <SessionProvider>
          <div className="flex flex-col h-screen overflow-hidden">
            <Header />
            <div className="flex flex-1 overflow-hidden">
              <main
                className="flex-1 overflow-y-auto"
                id="main-content"
                role="main"
                aria-label="Main content"
              >
                {children}
              </main>
            </div>
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
