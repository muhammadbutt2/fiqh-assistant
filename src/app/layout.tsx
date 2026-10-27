import type { Metadata } from "next";
import { SiteChrome } from "@/components/SiteChrome";
import "./globals.css";

export const metadata: Metadata = {
  title: "Online Mufti — Islamic Masail & Fiqh Assistant",
  description: "Explore Islamic masail through your selected Hanafi, Maliki, Shafi'i, or Hanbali madhhab, with multilingual explanations and source references.",
  openGraph: {
    title: "Online Mufti — Islamic Masail & Fiqh Assistant",
    description: "Explore Islamic masail through your selected madhhab, with multilingual explanations and source references.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* The App Router root layout is the document. This rule targets the Pages Router. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Literata:opsz,wght@7..72,560;7..72,680&family=Noto+Naskh+Arabic:wght@500;600&family=Noto+Nastaliq+Urdu:wght@500&family=Noto+Sans:wght@400;600&family=Noto+Sans+Bengali:wght@500&family=Noto+Sans+Devanagari:wght@500&family=Noto+Sans+SC:wght@500&family=Source+Sans+3:wght@400;600&display=swap" rel="stylesheet" />
      </head>
      <body>
        <a className="skip" href="#content">Skip to content</a>
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  );
}
