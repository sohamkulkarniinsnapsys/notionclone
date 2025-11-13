// apps/frontend/app/layout.tsx
import "./globals.css";
import "tippy.js/dist/tippy.css";
import React from "react";
import SessionProvider from "@/components/SessionProvider";
import Header from "@/components/Header";
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata = {
  title: "Notion Clone - Collaborative Editor",
  description:
    "Real-time collaborative document editor with Notion-like features",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </head>
      <body className={inter.className}>
        <SessionProvider>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              minHeight: "100vh",
            }}
          >
            <Header />
            <main style={{ flex: 1, display: "flex" }}>{children}</main>
          </div>
        </SessionProvider>
      </body>
    </html>
  );
}
