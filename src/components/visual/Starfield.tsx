"use client";

import { useMemo } from "react";
import { mulberry32 } from "./noise";
import { useCanvas } from "./useCanvas";

interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
  speed: number;
  drift: number;
  bright: boolean;
}

/** Slow drifting dust with a few square glints, like the reference hero. */
export function Starfield({ count = 260, seed = 11 }: { count?: number; seed?: number }) {
  const stars = useMemo<Star[]>(() => {
    const rand = mulberry32(seed);
    return Array.from({ length: count }, () => ({
      x: rand(),
      y: rand(),
      size: rand() < 0.08 ? 2 : rand() < 0.4 ? 1.4 : 1,
      phase: rand() * Math.PI * 2,
      speed: 0.4 + rand() * 1.6,
      drift: 0.002 + rand() * 0.006,
      bright: rand() < 0.06,
    }));
  }, [count, seed]);

  const ref = useCanvas(
    ({ ctx, width, height, time }) => {
      ctx.clearRect(0, 0, width, height);
      for (const s of stars) {
        const y = (((s.y - time * s.drift) % 1) + 1) % 1;
        const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * s.speed + s.phase));
        const alpha = (s.bright ? 0.95 : 0.5) * twinkle;
        ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
        const px = Math.round(s.x * width);
        const py = Math.round(y * height);
        ctx.fillRect(px, py, s.size, s.size);
        if (s.bright && twinkle > 0.85) {
          ctx.fillStyle = `rgba(255,255,255,${((twinkle - 0.85) * 2).toFixed(3)})`;
          ctx.fillRect(px - 2, py + s.size / 2 - 0.5, s.size + 4, 1);
          ctx.fillRect(px + s.size / 2 - 0.5, py - 2, 1, s.size + 4);
        }
      }
    },
    { animate: true, fps: 30 },
  );

  return <canvas ref={ref} aria-hidden="true" />;
}
