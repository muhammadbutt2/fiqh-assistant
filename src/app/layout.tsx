import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Islamic Fiqh Assistant",
  description: "Ask Islamic jurisprudence questions and explore source-supported answers according to your selected Sunni school of thought.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* The App Router root layout is the document. This rule targets the Pages Router. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Literata:opsz,wght@7..72,560;7..72,650&family=Noto+Naskh+Arabic:wght@500;600&family=Noto+Nastaliq+Urdu:wght@500&family=Source+Sans+3:wght@400;600&display=swap" rel="stylesheet" />
      </head>
      <body>
        <a className="skip" href="#content">Skip to content</a>
        <header className="wrap topbar">
          <Link className="brand" href="/">AI Islamic Fiqh Assistant</Link>
          <nav aria-label="Primary">
            <Link href="/ask">Ask</Link>
            <Link href="/sources">Sources</Link>
            <Link href="/account">Account</Link>
            <Link href="/admin">Admin</Link>
          </nav>
        </header>
        <div className="wrap banner" role="note">
          <strong>Not a mufti.</strong>
          <p>This is an AI-assisted research service, not a mufti, and not a substitute for qualified scholarly judgment. It does not issue a binding ruling.</p>
        </div>
        <div id="content">{children}</div>
        <footer className="wrap">Answers stay inside the selected school. The index starts empty until a person approves a source.</footer>
      </body>
    </html>
  );
}
