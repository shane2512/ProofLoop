import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "ProofLoop",
  description: "Local-first verification workspace for AI-assisted development.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>
        <div role="note" style={{ background: "#fff4ce", padding: "0.5rem 1rem", fontSize: "0.9rem" }}>
          Local-only app. It runs on this machine and is not safe to expose to a network.
        </div>
        <main style={{ maxWidth: 720, margin: "0 auto", padding: "1rem" }}>{children}</main>
      </body>
    </html>
  );
}
