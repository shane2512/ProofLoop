"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Chevron } from "./Cta";
import { NAV_LINKS, WORKSPACE_LINK } from "./links";
import { LogoMark } from "./Logo";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Fixed nav: logo left, pill tabs centered with a sliding indicator, workspace CTA right. */
export function SiteNav() {
  const pathname = usePathname();
  const pillRef = useRef<HTMLDivElement | null>(null);
  const indicatorRef = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);

  // Move the indicator under the active tab (transform + width, measured from the DOM).
  useIsoLayoutEffect(() => {
    const pill = pillRef.current;
    const indicator = indicatorRef.current;
    if (!pill || !indicator) return;
    const place = () => {
      const active = pill.querySelector<HTMLElement>("a[aria-current='page']");
      if (!active) {
        indicator.style.opacity = "0";
        return;
      }
      indicator.style.opacity = "1";
      indicator.style.width = `${active.offsetWidth}px`;
      indicator.style.transform = `translateX(${active.offsetLeft}px)`;
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(pill);
    return () => ro.disconnect();
  }, [pathname]);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <Link href="/" className="nav-logo nav-logo-fixed" aria-label="ProofLoop home">
        <LogoMark />
        <span>ProofLoop</span>
      </Link>
      <header className="nav">
        <span className="nav-logo-slot" aria-hidden="true" />
        <nav aria-label="Primary">
          <div className="nav-pill" ref={pillRef}>
            <span className="nav-indicator" ref={indicatorRef} aria-hidden="true" />
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} aria-current={isActive(pathname, link.href) ? "page" : undefined}>
                {link.label}
              </Link>
            ))}
          </div>
        </nav>
        <div className="nav-right">
          <Link href={WORKSPACE_LINK.href} className="cta cta-dark" aria-current={isActive(pathname, WORKSPACE_LINK.href) ? "page" : undefined}>
            <span className="cta-sq">
              <Chevron />
            </span>
            {WORKSPACE_LINK.label}
          </Link>
          <button type="button" className="cta cta-dark nav-menu-btn" aria-expanded={open} aria-controls="site-menu" onClick={() => setOpen((v) => !v)}>
            <span className="cta-sq">
              <Chevron />
            </span>
            {open ? "Close" : "Menu"}
          </button>
        </div>
      </header>
      <div id="site-menu" className="menu-overlay" data-open={open} aria-hidden={!open} inert={!open}>
        {[...NAV_LINKS, WORKSPACE_LINK].map((link, i) => (
          <Link key={link.href} href={link.href} className="dot" style={{ transitionDelay: open ? `${0.12 + i * 0.05}s` : "0s" }} aria-current={isActive(pathname, link.href) ? "page" : undefined}>
            {link.label}
          </Link>
        ))}
      </div>
    </>
  );
}
