"use client";

import { useEffect, useRef, type RefObject } from "react";

export interface CanvasFrame {
  ctx: CanvasRenderingContext2D;
  /** CSS pixel size of the canvas. The context is already scaled for device pixels. */
  width: number;
  height: number;
  /** Seconds since the loop started. Always 0 for static and reduced-motion renders. */
  time: number;
}

interface Options {
  /** Animate continuously. When false (or reduced motion), render once per resize. */
  animate: boolean;
  /** Frame cap for animated canvases. */
  fps?: number;
  /** Device pixel ratio cap. */
  maxDpr?: number;
}

/**
 * Drives one canvas: sizes it to its box at device resolution, renders on resize, and when animated
 * runs a capped RAF loop that pauses while offscreen or while the tab is hidden. Reduced motion gets a
 * single static frame. Everything is torn down on unmount.
 */
export function useCanvas(render: (frame: CanvasFrame) => void, { animate, fps = 30, maxDpr = 2 }: Options): RefObject<HTMLCanvasElement | null> {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const renderRef = useRef(render);
  renderRef.current = render;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const shouldAnimate = animate && !reduce;
    let width = 0;
    let height = 0;
    let raf = 0;
    let visible = true;
    let last = 0;
    const start = performance.now();
    const minDelta = 1000 / fps;

    const draw = (time: number) => {
      if (width === 0 || height === 0) return;
      renderRef.current({ ctx, width, height, time });
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(shouldAnimate ? (performance.now() - start) / 1000 : 0);
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || document.hidden) return;
      if (now - last < minDelta) return;
      last = now;
      draw((now - start) / 1000);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    let io: IntersectionObserver | null = null;
    if (shouldAnimate) {
      io = new IntersectionObserver((entries) => {
        visible = entries.some((e) => e.isIntersecting);
      });
      io.observe(canvas);
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io?.disconnect();
    };
  }, [animate, fps, maxDpr]);

  return ref;
}
