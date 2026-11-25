import type { ReactNode } from "react";
import { PageMotion } from "@/components/motion/PageMotion";
import { SmoothScroll } from "@/components/motion/SmoothScroll";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SmoothScroll />
      <SiteNav />
      <div data-page>
        <main id="main">{children}</main>
        <SiteFooter />
      </div>
      <div className="grain" aria-hidden="true" />
      <PageMotion />
    </>
  );
}
