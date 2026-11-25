import type { Metadata, Viewport } from "next";
import { Doto, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const dot = Doto({ subsets: ["latin"], weight: ["600", "800", "900"], variable: "--font-dot", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "ProofLoop: prove the fix with real Kane CLI runs", template: "%s | ProofLoop" },
  description:
    "ProofLoop maps human-written acceptance criteria to real Kane CLI browser runs, keeps the evidence, and re-verifies every fix. Local-first, single-user.",
};

export const viewport: Viewport = {
  themeColor: "#070708",
};

/**
 * Runs before first paint. Marks the document for motion (content is hidden only until the motion
 * controller reveals it) unless the user prefers reduced motion, and reveals everything after 3.5 s
 * if the scripts never arrive, so content is never stuck invisible.
 */
const motionBoot = `(function(){try{var d=document.documentElement;if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){d.classList.add('has-motion');setTimeout(function(){d.classList.add('motion-ready')},3500)}}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${dot.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: motionBoot }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
