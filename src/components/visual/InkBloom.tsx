"use client";

import { useMemo } from "react";
import { createValueNoise, mulberry32, type Noise2D } from "./noise";
import { useCanvas } from "./useCanvas";

interface PetalLayer {
  count: number;
  length: number;
  width: number;
  color: string;
  alpha: number;
  blur: number;
  rotation: number;
  ragged: number;
}

function petalPath(ctx: CanvasRenderingContext2D, noise: Noise2D, seed: number, len: number, wid: number, ragged: number) {
  const steps = 64;
  ctx.beginPath();
  for (let k = 0; k <= steps; k++) {
    const a = (k / steps) * Math.PI * 2;
    // Teardrop: narrow at the root (x = 0), widest about two thirds out.
    const ex = (Math.cos(a) + 1) / 2;
    const bulge = Math.sin(Math.PI * Math.pow(ex, 0.8));
    const edge = 1 + (noise(seed + Math.cos(a) * 1.8, seed * 0.37 + Math.sin(a) * 1.8) - 0.5) * ragged;
    const x = ex * len * edge;
    const y = Math.sin(a) * wid * bulge * edge;
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/**
 * A procedural ink flower: translucent outer petals, solid black inner petals with ragged edges, white
 * filaments at the core and a soft stem with leaves. Rendered once per resize; GSAP moves the element.
 */
export function InkBloom({ seed = 21 }: { seed?: number }) {
  const noise = useMemo(() => createValueNoise(seed), [seed]);

  const ref = useCanvas(
    ({ ctx, width, height }) => {
      const rand = mulberry32(seed);
      const s = Math.min(width, height);
      const cx = width * 0.56;
      const cy = height * 0.4;
      ctx.clearRect(0, 0, width, height);

      // Stem and leaves (behind the bloom).
      ctx.save();
      ctx.filter = `blur(${Math.max(1, s * 0.002)}px)`;
      ctx.strokeStyle = "rgba(30,30,34,0.55)";
      ctx.lineCap = "round";
      const stems: Array<[number, number, number, number, number]> = [
        [cx - s * 0.05, cy + s * 0.12, cx - s * 0.2, cy + s * 0.5, s * 0.012],
        [cx - s * 0.1, cy + s * 0.18, cx - s * 0.36, cy + s * 0.48, s * 0.006],
        [cx + s * 0.02, cy + s * 0.15, cx - s * 0.08, cy + s * 0.62, s * 0.007],
      ];
      for (const [x1, y1, x2, y2, w] of stems) {
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(x1 - s * 0.02, (y1 + y2) / 2, x2, y2);
        ctx.stroke();
      }
      const leaves: Array<[number, number, number, number]> = [
        [cx - s * 0.3, cy + s * 0.42, -2.6, s * 0.2],
        [cx - s * 0.2, cy + s * 0.36, -2.1, s * 0.16],
        [cx - s * 0.1, cy + s * 0.52, -1.2, s * 0.13],
        [cx - s * 0.38, cy + s * 0.33, -2.9, s * 0.12],
      ];
      for (const [x, y, rot, len] of leaves) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        const grad = ctx.createLinearGradient(0, 0, len, 0);
        grad.addColorStop(0, "rgba(40,40,46,0.5)");
        grad.addColorStop(1, "rgba(40,40,46,0.08)");
        ctx.fillStyle = grad;
        petalPath(ctx, noise, rand() * 50, len, len * 0.16, 0.25);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();

      const layers: PetalLayer[] = [
        { count: 11, length: s * 0.36, width: s * 0.13, color: "60,60,66", alpha: 0.14, blur: s * 0.012, rotation: 0.2, ragged: 0.5 },
        { count: 9, length: s * 0.33, width: s * 0.12, color: "40,40,45", alpha: 0.28, blur: s * 0.007, rotation: 0.55, ragged: 0.45 },
        { count: 8, length: s * 0.27, width: s * 0.11, color: "16,16,18", alpha: 0.72, blur: s * 0.004, rotation: 0.1, ragged: 0.38 },
        { count: 7, length: s * 0.2, width: s * 0.1, color: "8,8,10", alpha: 0.94, blur: s * 0.002, rotation: 0.4, ragged: 0.3 },
        { count: 6, length: s * 0.12, width: s * 0.08, color: "5,5,6", alpha: 1, blur: s * 0.0015, rotation: 0.9, ragged: 0.25 },
      ];

      for (const layer of layers) {
        ctx.save();
        ctx.filter = `blur(${layer.blur.toFixed(2)}px)`;
        for (let p = 0; p < layer.count; p++) {
          const angle = layer.rotation + (p / layer.count) * Math.PI * 2 + (rand() - 0.5) * 0.35;
          const len = layer.length * (0.78 + rand() * 0.4);
          const wid = layer.width * (0.75 + rand() * 0.5);
          // Petals lean toward the viewer at the top, so the bloom reads as a cup, not a disc.
          const squash = 0.82 + 0.18 * Math.abs(Math.cos(angle));
          ctx.save();
          ctx.translate(cx, cy);
          ctx.scale(1, squash);
          ctx.rotate(angle);
          ctx.fillStyle = `rgba(${layer.color},${(layer.alpha * (0.8 + rand() * 0.2)).toFixed(3)})`;
          petalPath(ctx, noise, rand() * 100, len, wid, layer.ragged);
          ctx.fill();
          ctx.restore();
        }
        ctx.restore();
      }

      // Ink diffusion speckle around the rim.
      ctx.save();
      for (let k = 0; k < 900; k++) {
        const a = rand() * Math.PI * 2;
        const r = s * (0.18 + rand() * 0.26);
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r * 0.9;
        const alpha = 0.05 + rand() * 0.18;
        ctx.fillStyle = `rgba(20,20,24,${alpha.toFixed(3)})`;
        const d = 0.6 + rand() * 1.6;
        ctx.fillRect(x, y, d, d);
      }
      ctx.restore();

      // White filaments at the core.
      ctx.save();
      ctx.strokeStyle = "rgba(245,245,247,0.85)";
      ctx.lineCap = "round";
      for (let k = 0; k < 46; k++) {
        const a = -Math.PI * 0.95 + rand() * Math.PI * 0.9;
        const r1 = s * (0.02 + rand() * 0.02);
        const r2 = s * (0.06 + rand() * 0.06);
        ctx.lineWidth = 0.5 + rand() * 0.9;
        ctx.globalAlpha = 0.35 + rand() * 0.6;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
        ctx.stroke();
      }
      ctx.restore();
    },
    { animate: false },
  );

  return <canvas ref={ref} aria-hidden="true" />;
}
