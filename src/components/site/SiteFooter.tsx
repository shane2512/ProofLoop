import Link from "next/link";
import { Halo } from "../visual/Halo";
import { Cta } from "./Cta";
import { NAV_LINKS, WORKSPACE_LINK } from "./links";
import { LogoMark } from "./Logo";

/** Closing call to action plus footer, shared by every page. */
export function SiteFooter() {
  return (
    <>
      <section className="closing" data-scene="closing" aria-labelledby="closing-title">
        <div className="halo-wrap">
          <Halo />
        </div>
        <div className="hero-vignette" aria-hidden="true" />
        <div className="closing-copy">
          <p className="eyebrow" data-split="words">
            Validated on kane-cli 0.10.9
          </p>
          <h2 id="closing-title" className="dot" data-split="chars">
            Run. Read. Fix. Re-run.
          </h2>
          <div className="closing-actions" data-reveal>
            <Cta href={WORKSPACE_LINK.href} variant="accent" large magnetic>
              {WORKSPACE_LINK.label}
            </Cta>
            <Cta href="/docs" variant="dark" large magnetic>
              Read the Setup Guide
            </Cta>
          </div>
        </div>
      </section>
      <footer className="footer">
        <div className="footer-grid">
          <div>
            <Link href="/" className="nav-logo" aria-label="ProofLoop home">
              <LogoMark />
              <span>ProofLoop</span>
            </Link>
            <p>
              Acceptance criteria, real Kane CLI runs, and the evidence to prove a fix. Runs on your machine and keeps every result.
            </p>
          </div>
          <div className="footer-col">
            <h3>Site</h3>
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href}>
                {link.label}
              </Link>
            ))}
          </div>
          <div className="footer-col">
            <h3>Product</h3>
            <Link href={WORKSPACE_LINK.href}>Workspace</Link>
            <Link href="/docs#api">Local API</Link>
            <Link href="/evidence#outcomes">Run outcomes</Link>
            <Link href="/workflow#status">Build status</Link>
          </div>
        </div>
        <p className="footer-word dot" aria-hidden="true" data-footer-word>
          ProofLoop
        </p>
        <div className="footer-base">
          <span className="local-chip">Local only. Binds to 127.0.0.1.</span>
          <span>No hosted service. Kane uploads each run to your own TestMu account.</span>
        </div>
      </footer>
    </>
  );
}
