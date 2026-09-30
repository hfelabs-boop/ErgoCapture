import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "ErgoCapture — camera-based ergonomic assessment",
  description:
    "Record a worker with any camera, estimate body posture in the browser, and score it on RULA, REBA, OWAS, NIOSH, OCRA, Strain Index and ISO 11226 — with a confidence level for every score.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f172a" };

const NAV = [
  { href: "/live", label: "Live" },
  { href: "/analyze", label: "Analyze" },
  { href: "/sync", label: "Sync" },
  { href: "/methods", label: "Methods" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900 text-white">
          <nav className="mx-auto flex max-w-7xl items-center gap-1 px-4 py-2.5 sm:gap-4">
            <Link href="/" className="mr-auto flex items-center gap-2 font-semibold tracking-tight">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="4.5" r="2.5" fill="#38bdf8" />
                <path d="M12 7.5v7m0 0-4 6m4-6 4 6M6 10.5l6-1.5 6 1.5" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />
              </svg>
              ErgoCapture
            </Link>
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-md px-2.5 py-1.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white">
                {n.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-7xl px-4 pb-8 pt-4 text-xs text-slate-500">
          Video is processed on this device and never uploaded. ErgoCapture is a screening tool; results should be reviewed by a
          qualified ergonomist.
        </footer>
      </body>
    </html>
  );
}
