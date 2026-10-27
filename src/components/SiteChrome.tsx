"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";

const LINKS = [
  ["/", "Home"],
  ["/ask", "Ask a Masla"],
  ["/#explore", "Explore Masail"],
  ["/methodology", "Our Methodology"],
  ["/sources", "Sources"],
] as const;

export function SiteChrome({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const saved = window.localStorage.getItem("fiqh.theme");
    const next = saved === "dark" || saved === "light" ? saved : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(next);
    document.documentElement.dataset.theme = next;
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("fiqh.theme", next);
  }

  return (
    <>
      <header className="site-header">
        <div className="wrap header-bar">
          <Link className="brand" href="/" onClick={() => setOpen(false)}>
            <Logo />
            <span>
              <strong>Online Mufti</strong>
              <small>Islamic Masail & Fiqh</small>
            </span>
          </Link>
          <nav className="desktop-nav" aria-label="Primary">
            {LINKS.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
          </nav>
          <div className="header-actions">
            <Link className="text-link" href="/#language">Language</Link>
            <button type="button" className="secondary" aria-pressed={theme === "dark"} onClick={toggleTheme}>{theme === "dark" ? "Light" : "Dark"}</button>
            <Link className="button" href="/ask">Ask Your Masla</Link>
            <button type="button" className="secondary menu-button" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen((value) => !value)}>Menu</button>
          </div>
        </div>
        {open ? (
          <nav id="mobile-nav" className="mobile-nav wrap" aria-label="Mobile">
            {LINKS.map(([href, label]) => <Link key={href} href={href} onClick={() => setOpen(false)}>{label}</Link>)}
          </nav>
        ) : null}
      </header>
      <div className="wrap trust-note" role="note">AI-Powered Fiqh Assistant · Not a Human Mufti</div>
      <div id="content">{children}</div>
      <footer className="site-footer">
        <div className="wrap footer-grid">
          <div>
            <Link className="brand" href="/"><Logo size={28} /><strong>Online Mufti</strong></Link>
            <p>Your Masail, Explained with Evidence. An AI research assistant for four Sunni schools. It is not a human mufti.</p>
          </div>
          <nav aria-label="Footer">
            <Link href="/ask">Ask Your Masla</Link>
            <Link href="/#explore">Explore Masail</Link>
            <Link href="/methodology">Our Methodology</Link>
            <Link href="/sources">Sources</Link>
            <Link href="/privacy">Privacy Policy</Link>
            <Link href="/terms">Terms of Use</Link>
            <Link href="/account">Account</Link>
          </nav>
        </div>
        <p className="wrap disclaimer">Online Mufti is an AI-powered fiqh research assistant, not a replacement for a qualified scholar. Verify important, personal, or high-stakes religious matters with a qualified mufti.</p>
        <p className="wrap meta">© {new Date().getFullYear()} Online Mufti</p>
      </footer>
    </>
  );
}
