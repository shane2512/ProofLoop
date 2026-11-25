import type { ReactNode } from "react";
import { Halo } from "../visual/Halo";
import { Starfield } from "../visual/Starfield";
import { Cta } from "./Cta";

interface Props {
  eyebrow: string;
  title: string;
  /** Text under the bottom-left of the hero. */
  note: ReactNode;
  cta?: { href: string; label: string };
  compact?: boolean;
  children?: ReactNode;
}

/**
 * Dark hero shared by every page: starfield, halo ring, a decoded dot-matrix headline, a note at the
 * bottom-left and an accent CTA at the bottom-right (the reference layout).
 */
export function PageHero({ eyebrow, title, note, cta, compact = false, children }: Props) {
  return (
    <section className={`hero${compact ? " hero-compact" : ""}`} data-scene="hero" aria-labelledby="hero-title">
      <div className="hero-stars">
        <Starfield count={compact ? 180 : 280} />
      </div>
      <div className="halo-wrap" data-halo-wrap>
        <Halo />
      </div>
      <div className="hero-vignette" aria-hidden="true" />
      <div className="hero-copy" data-hero-copy>
        <p className="eyebrow" data-split="words" data-split-on="load" data-split-delay="0.5">
          {eyebrow}
        </p>
        <h1 id="hero-title" className="hero-title dot" data-split="chars" data-split-on="load" data-split-delay="0.75">
          {title}
        </h1>
        {children}
      </div>
      <div className="hero-bottom" data-hero-bottom>
        <p data-intro>{note}</p>
        {cta ? (
          <div data-intro>
            <Cta href={cta.href} variant="accent" magnetic>
              {cta.label}
            </Cta>
          </div>
        ) : null}
      </div>
      {!compact ? <span className="hero-cue" aria-hidden="true" /> : null}
    </section>
  );
}
