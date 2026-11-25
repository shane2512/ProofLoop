"use client";

import { useMemo } from "react";
import { createValueNoise } from "./noise";
import { useCanvas } from "./useCanvas";

/** A rolling surface of white dots for the dark card, denser and brighter at the crest. */
export function DotWave({ gap = 7, seed = 5 }: { gap?: number; seed?: number }) {
  const noise = useMemo(() => createValueNoise(seed), [seed]);

  const ref = useCanvas(
    ({ ctx, width, height, time }) => {
      ctx.clearRect(0, 0, width, height);
      const cols = Math.ceil(width / gap) + 1;
      const rows = Math.ceil(height / gap) + 1;
      for (let i = 0; i < cols; i++) {
        const x = i * gap;
        const nx = i / cols;
        const crest =
          height * 0.38 +
          Math.sin(nx * 7 + time * 0.9) * height * 0.09 +
          Math.sin(nx * 3.1 - time * 0.5) * height * 0.07 +
          (noise(nx * 6, time * 0.35) - 0.5) * height * 0.18;
        for (let j = 0; j < rows; j++) {
          const y = j * gap;
          if (y < crest) continue;
          const depth = (y - crest) / (height - crest + 1);
          const near = 1 - Math.min(1, depth * 1.6);
          const sparkle = noise(i * 0.7 + time * 0.8, j * 0.7);
          const alpha = 0.18 + near * 0.82 * (0.55 + sparkle * 0.45);
          const size = 0.8 + near * 1.7;
          ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
          ctx.fillRect(x - size / 2, y - size / 2, size, size);
        }
      }
    },
    { animate: true, fps: 30 },
  );

  return <canvas ref={ref} aria-hidden="true" />;
}
