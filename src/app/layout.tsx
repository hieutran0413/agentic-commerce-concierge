import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Concierge — Agentic Commerce with PayPal",
  description:
    "An AI concierge that shops and pays on your behalf via PayPal — small purchases auto-pay within your daily limit, bigger ones wait for your one-tap approval. Every decision is logged.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
            <Link href="/" className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-navy text-lg font-bold text-white shadow-sm">
                C
              </span>
              <span className="leading-tight">
                <span className="block text-[17px] font-bold tracking-tight text-ink">
                  Concierge
                </span>
                <span className="block text-[11px] font-medium tracking-wide text-ink-faint">
                  AGENTIC COMMERCE · PAYPAL
                </span>
              </span>
            </Link>
            <nav className="flex items-center gap-1 text-sm font-medium">
              <Link
                href="/"
                className="rounded-full px-3.5 py-2 text-ink-soft transition hover:bg-black/5 hover:text-ink"
              >
                Chat
              </Link>
              <Link
                href="/dashboard"
                className="rounded-full px-3.5 py-2 text-ink-soft transition hover:bg-black/5 hover:text-ink"
              >
                Dashboard
              </Link>
              <a
                href="https://github.com/hieutran0413/agentic-commerce-concierge"
                target="_blank"
                rel="noreferrer"
                className="ml-1 hidden rounded-full border border-line bg-white px-3.5 py-2 text-ink-soft transition hover:text-ink sm:block"
              >
                GitHub ↗
              </a>
            </nav>
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 sm:px-6">
          {children}
        </main>
        <footer className="border-t border-line py-5">
          <p className="mx-auto max-w-6xl px-4 text-center text-xs text-ink-faint sm:px-6">
            Agentic Commerce Concierge — PayPal AI Hackathon 2026 · PayPal sandbox · Built with
            Claude / rule-based agent · MIT License
          </p>
        </footer>
      </body>
    </html>
  );
}
