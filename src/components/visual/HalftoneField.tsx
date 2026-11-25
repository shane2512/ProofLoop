"use client";

import { useMemo } from "react";
import { createValueNoise, fbm, smoothstep } from "./noise";
import { useCanvas } from "./useCanvas";

/**
 * Animated square-dot halftone of flowing noise (black ink on white), like the reference's dithered
 * image card. Each cell is a square sized by local darkness.
 */
export function HalftoneField({ cell = 7, seed = 3, invert = false }: { cell?: number; seed?: number; invert?: boolean }) {
  const noise = useMemo(() => createValueNoise(seed), [seed]);

  const ref = useCanvas(
    ({ ctx, width, height, time }) => {
      ctx.fillStyle = invert ? "#0b0b0c" : "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = invert ? "#f3f3f4" : "#0b0b0c";
      const cols = Math.ceil(width / cell);
      const rows = Math.ceil(height / cell);
      const t = time * 0.06;
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const nx = i / cols;
          const ny = j / rows;
          const warp = fbm(noise, nx * 1.6 + t, ny * 1.6 - t * 0.6, 3);
          const v = fbm(noise, nx * 2.4 + warp * 1.8 - t * 0.4, ny * 2.4 + warp * 1.4 + t * 0.3, 4);
          const ink = smoothstep(0.36, 0.66, v);
          if (ink < 0.04) continue;
          const size = Math.min(cell, ink * cell * 1.05);
          const off = (cell - size) / 2;
          ctx.fillRect(i * cell + off, j * cell + off, size, size);
        }
      }
    },
    { animate: true, fps: 20 },
  );

  return <canvas ref={ref} aria-hidden="true" />;
}
