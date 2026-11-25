"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { finePointer, getGsap, prefersReducedMotion } from "./gsap";

/**
 * One motion controller per page. Pages stay server-rendered and opt in with data attributes:
 *
 *   data-scene="hero"        load intro (halo, stars, decoded headline) + scroll parallax
 *   data-scene="bloom"       pinned scene: bloom grows, statement rises, bloom drifts away (desktop)
 *   data-scene="closing"     halo scales with scroll
 *   data-split="chars|words" decoded characters or masked word rise (data-split-on="load" to skip scroll)
 *   data-lines               rise each .line-inner through its mask
 *   data-reveal              fade up with a short blur (data-reveal-delay="0.2")
 *   data-reveal-group        stagger its [data-reveal-item] children
 *   data-stack / -card       sticky cards recede as the next one arrives (desktop)
 *   data-parallax="0.12"     vertical parallax within [data-parallax-section]
 *   data-footer-word         oversized footer word slides up
 *   data-magnetic            buttons pull toward a fine pointer
 *
 * Everything is created inside a gsap.context and reverted (including split text) on route change.
 * Reduced-motion users get the static page.
 */
export function PageMotion() {
  const pathname = usePathname();

  useEffect(() => {
    const html = document.documentElement;
    const root = document.querySelector<HTMLElement>("[data-page]");
    if (!root || prefersReducedMotion()) {
      html.classList.add("motion-ready");
      return;
    }

    const { gsap, ScrollTrigger } = getGsap();
    const restores: Array<() => void> = [];
    const listeners: Array<() => void> = [];

    const splitChars = (el: HTMLElement): HTMLElement[] => {
      const original = el.innerHTML;
      const text = el.textContent ?? "";
      restores.push(() => {
        el.innerHTML = original;
        el.removeAttribute("aria-label");
      });
      el.setAttribute("aria-label", text.trim());
      el.textContent = "";
      const chars: HTMLElement[] = [];
      // Characters are grouped per word so lines only break between words.
      for (const part of text.split(/(\s+)/)) {
        if (!part.trim()) {
          if (part) el.appendChild(document.createTextNode(part));
          continue;
        }
        const word = document.createElement("span");
        word.className = "split-word";
        word.setAttribute("aria-hidden", "true");
        for (const ch of part) {
          const span = document.createElement("span");
          span.className = "split-char";
          span.textContent = ch;
          word.appendChild(span);
          chars.push(span);
        }
        el.appendChild(word);
      }
      return chars;
    };

    const splitWords = (el: HTMLElement): HTMLElement[] => {
      const original = el.innerHTML;
      const text = el.textContent ?? "";
      restores.push(() => {
        el.innerHTML = original;
        el.removeAttribute("aria-label");
      });
      el.setAttribute("aria-label", text.trim());
      el.textContent = "";
      const words: HTMLElement[] = [];
      for (const part of text.split(/(\s+)/)) {
        if (!part.trim()) {
          el.appendChild(document.createTextNode(part));
          continue;
        }
        const mask = document.createElement("span");
        mask.className = "split-mask";
        mask.setAttribute("aria-hidden", "true");
        const word = document.createElement("span");
        word.className = "split-unit";
        word.textContent = part;
        mask.appendChild(word);
        el.appendChild(mask);
        words.push(word);
      }
      return words;
    };

    const ctx = gsap.context(() => {
      // ---- Split text ----
      root.querySelectorAll<HTMLElement>("[data-split]").forEach((el) => {
        const mode = el.dataset.split;
        const onLoad = el.dataset.splitOn === "load";
        const delay = Number(el.dataset.splitDelay ?? 0);
        gsap.set(el, { autoAlpha: 1 });
        const trigger = onLoad ? undefined : { trigger: el, start: "top 86%", once: true };
        if (mode === "chars") {
          const chars = splitChars(el);
          gsap.fromTo(
            chars,
            { autoAlpha: 0 },
            {
              keyframes: { autoAlpha: [0, 1, 0.2, 1] },
              duration: 0.55,
              ease: "none",
              delay,
              stagger: { each: 0.028, from: "random" },
              scrollTrigger: trigger,
            },
          );
        } else {
          const words = splitWords(el);
          gsap.fromTo(
            words,
            { yPercent: 110, autoAlpha: 0, filter: "blur(6px)" },
            {
              yPercent: 0,
              autoAlpha: 1,
              filter: "blur(0px)",
              duration: 0.95,
              ease: "power4.out",
              delay,
              stagger: 0.045,
              scrollTrigger: trigger,
            },
          );
        }
      });

      // ---- Line masks (scene lines are driven by their scene on desktop) ----
      root.querySelectorAll<HTMLElement>("[data-lines]:not([data-lines='scene'])").forEach((el) => {
        gsap.fromTo(
          el.querySelectorAll(".line-inner"),
          { yPercent: 110 },
          { yPercent: 0, duration: 1.05, ease: "power4.out", stagger: 0.1, scrollTrigger: { trigger: el, start: "top 86%", once: true } },
        );
      });

      // ---- Reveals ----
      root.querySelectorAll<HTMLElement>("[data-reveal-group]").forEach((group) => {
        const items = group.querySelectorAll<HTMLElement>("[data-reveal-item]");
        gsap.fromTo(
          items,
          { y: 48, autoAlpha: 0, scale: 0.985 },
          { y: 0, autoAlpha: 1, scale: 1, duration: 1.1, ease: "power4.out", stagger: 0.085, scrollTrigger: { trigger: group, start: "top 86%", once: true } },
        );
      });
      root.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
        gsap.fromTo(
          el,
          { y: 28, autoAlpha: 0, filter: "blur(6px)" },
          {
            y: 0,
            autoAlpha: 1,
            filter: "blur(0px)",
            duration: 0.95,
            ease: "power4.out",
            delay: Number(el.dataset.revealDelay ?? 0),
            scrollTrigger: el.dataset.revealOn === "load" ? undefined : { trigger: el, start: "top 88%", once: true },
          },
        );
      });

      // ---- Hero: intro on load, parallax on scroll ----
      root.querySelectorAll<HTMLElement>("[data-scene='hero']").forEach((hero) => {
        const halo = hero.querySelector("[data-halo]");
        // Scroll and pointer move the wrapper, so they never fight the intro tween on the halo itself.
        const haloWrap = hero.querySelector("[data-halo-wrap]");
        const stars = hero.querySelector(".hero-stars");
        const copy = hero.querySelector("[data-hero-copy]");
        const bottom = hero.querySelector("[data-hero-bottom]");
        const intro = gsap.timeline({ defaults: { ease: "expo.out" } });
        if (halo) intro.fromTo(halo, { autoAlpha: 0, scale: 0.9 }, { autoAlpha: 1, scale: 1, duration: 2.2 }, 0);
        if (stars) intro.fromTo(stars, { autoAlpha: 0 }, { autoAlpha: 1, duration: 1.6, ease: "power2.out" }, 0.2);
        const introItems = hero.querySelectorAll("[data-intro]");
        if (introItems.length) intro.fromTo(introItems, { y: 18, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 1.1, stagger: 0.1 }, 1.1);

        const scroll = { trigger: hero, start: "top top", end: "bottom top", scrub: 1.1 };
        if (copy) gsap.to(copy, { y: () => -window.innerHeight * 0.22, autoAlpha: 0.15, ease: "none", scrollTrigger: scroll });
        if (haloWrap) gsap.to(haloWrap, { y: () => window.innerHeight * 0.12, scale: 1.07, ease: "none", scrollTrigger: { ...scroll } });
        if (stars) gsap.to(stars, { y: () => window.innerHeight * 0.06, ease: "none", scrollTrigger: { ...scroll } });
        if (bottom) gsap.to(bottom, { y: () => -window.innerHeight * 0.08, ease: "none", scrollTrigger: { ...scroll } });

        // Barely visible pointer depth on the halo.
        if (halo && finePointer()) {
          const xTo = gsap.quickTo(halo, "x", { duration: 1.2, ease: "power3.out" });
          const yTo = gsap.quickTo(halo, "y", { duration: 1.2, ease: "power3.out" });
          const onMove = (e: PointerEvent) => {
            const r = hero.getBoundingClientRect();
            xTo(((e.clientX - r.left) / r.width - 0.5) * 26);
            yTo(((e.clientY - r.top) / r.height - 0.5) * 14);
          };
          hero.addEventListener("pointermove", onMove);
          listeners.push(() => hero.removeEventListener("pointermove", onMove));
        }
      });

      // ---- Closing halo ----
      root.querySelectorAll<HTMLElement>("[data-scene='closing']").forEach((scene) => {
        const halo = scene.querySelector("[data-halo]");
        if (!halo) return;
        gsap.fromTo(halo, { scale: 0.82, autoAlpha: 0.4 }, { scale: 1.05, autoAlpha: 1, ease: "none", scrollTrigger: { trigger: scene, start: "top bottom", end: "bottom top", scrub: 1.2 } });
      });

      // ---- Parallax ----
      root.querySelectorAll<HTMLElement>("[data-parallax]").forEach((layer) => {
        const speed = Number(layer.dataset.parallax || 0.12);
        const section = layer.closest("[data-parallax-section]") ?? layer;
        gsap.to(layer, {
          y: () => -window.innerHeight * speed,
          ease: "none",
          scrollTrigger: { trigger: section, start: "top bottom", end: "bottom top", scrub: 1.2, invalidateOnRefresh: true },
        });
      });

      // ---- Footer word ----
      document.querySelectorAll<HTMLElement>("[data-footer-word]").forEach((word) => {
        gsap.fromTo(word, { yPercent: 55, autoAlpha: 0.3 }, { yPercent: 0, autoAlpha: 1, ease: "none", scrollTrigger: { trigger: word, start: "top bottom", end: "bottom bottom", scrub: 1 } });
      });

      // ---- Magnetic buttons ----
      if (finePointer()) {
        document.querySelectorAll<HTMLElement>("[data-magnetic]").forEach((el) => {
          const strength = Number(el.dataset.magnetic || 0.2);
          const xTo = gsap.quickTo(el, "x", { duration: 0.5, ease: "power3.out" });
          const yTo = gsap.quickTo(el, "y", { duration: 0.5, ease: "power3.out" });
          const move = (e: PointerEvent) => {
            const r = el.getBoundingClientRect();
            xTo((e.clientX - r.left - r.width / 2) * strength);
            yTo((e.clientY - r.top - r.height / 2) * strength);
          };
          const leave = () => {
            xTo(0);
            yTo(0);
          };
          el.addEventListener("pointermove", move);
          el.addEventListener("pointerleave", leave);
          listeners.push(() => {
            el.removeEventListener("pointermove", move);
            el.removeEventListener("pointerleave", leave);
          });
        });
      }
    }, root);

    // ---- Breakpoint-dependent scenes (pins only on desktop) ----
    const mm = gsap.matchMedia();
    mm.add(
      { desktop: "(min-width: 768px)", mobile: "(max-width: 767px)" },
      (context) => {
        const { desktop } = context.conditions as { desktop: boolean; mobile: boolean };

        root.querySelectorAll<HTMLElement>("[data-scene='bloom']").forEach((scene) => {
          const art = scene.querySelector("[data-bloom-art]");
          const intro = scene.querySelector("[data-bloom-intro]");
          const lines = scene.querySelectorAll("[data-lines='scene'] .line-inner");
          if (!desktop) {
            gsap.fromTo(lines, { yPercent: 110 }, { yPercent: 0, duration: 1, ease: "power4.out", stagger: 0.1, scrollTrigger: { trigger: lines[0] ?? scene, start: "top 90%", once: true } });
            if (art) gsap.fromTo(art, { scale: 0.85, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 1.4, ease: "expo.out", scrollTrigger: { trigger: art, start: "top 85%", once: true } });
            return;
          }
          const tl = gsap.timeline({
            scrollTrigger: { trigger: scene, start: "top top", end: "+=170%", scrub: 1.1, pin: true, anticipatePin: 1, invalidateOnRefresh: true },
          });
          if (art) tl.fromTo(art, { scale: 0.52, xPercent: 14, yPercent: 30, rotate: -9 }, { scale: 1, xPercent: 0, yPercent: 0, rotate: 0, ease: "none", duration: 1 }, 0);
          tl.fromTo(lines, { yPercent: 110 }, { yPercent: 0, ease: "none", stagger: 0.07, duration: 0.55 }, 0.55);
          if (intro) tl.to(intro, { autoAlpha: 0, y: -40, ease: "none", duration: 0.4 }, 0.95);
          if (art) tl.to(art, { yPercent: -34, scale: 1.1, autoAlpha: 0.18, ease: "none", duration: 0.85 }, 1.1);
        });

        if (desktop) {
          root.querySelectorAll<HTMLElement>("[data-stack]").forEach((stack) => {
            const cards = Array.from(stack.querySelectorAll<HTMLElement>("[data-stack-card]"));
            cards.forEach((card, index) => {
              const next = cards[index + 1];
              if (!next) return;
              // Cards stay opaque (a faded card would let the one beneath show through); a
              // darkening overlay driven by --dim gives the receding depth instead.
              gsap.to(card, {
                scale: 0.9 + index * 0.012,
                "--dim": 0.45,
                y: -18,
                ease: "none",
                scrollTrigger: { trigger: next, start: "top 85%", end: "top 15%", scrub: true, invalidateOnRefresh: true },
              });
            });
          });
        }
      },
      root,
    );

    html.classList.add("motion-ready");
    const refresh = () => ScrollTrigger.refresh();
    const raf = requestAnimationFrame(refresh);
    void document.fonts?.ready.then(refresh);
    window.addEventListener("load", refresh);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("load", refresh);
      listeners.forEach((off) => off());
      mm.revert();
      ctx.revert();
      restores.reverse().forEach((restore) => restore());
    };
  }, [pathname]);

  return null;
}
