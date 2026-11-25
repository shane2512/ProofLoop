import Link from "next/link";
import type { ReactNode } from "react";

export function Chevron() {
  return (
    <svg viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M4.5 2.5 8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
    </svg>
  );
}

type Variant = "dark" | "light" | "accent";

/** Pill link with a square chevron, matching the reference's "Request a Demo" buttons. */
export function Cta({ href, children, variant = "dark", large = false, magnetic = false }: { href: string; children: ReactNode; variant?: Variant; large?: boolean; magnetic?: boolean }) {
  return (
    <Link href={href} className={`cta cta-${variant}${large ? " cta-lg" : ""}`} data-magnetic={magnetic ? "0.18" : undefined}>
      <span className="cta-sq">
        <Chevron />
      </span>
      {children}
    </Link>
  );
}

/** Square icon link used inside cards. */
export function IconLink({ href, label, accent = false }: { href: string; label: string; accent?: boolean }) {
  return (
    <Link href={href} className={`icon-btn${accent ? " icon-btn-accent" : ""}`} aria-label={label}>
      <Chevron />
    </Link>
  );
}
