import type { ReactNode } from "react";

/**
 * Heading whose authored lines rise through a mask. Pass `scene` when a pinned scene drives the lines.
 * Lines are fixed by the author, so inline emphasis spans survive the animation.
 */
export function Lines({ as: Tag = "h2", lines, scene = false, className }: { as?: "h1" | "h2" | "h3" | "p"; lines: ReactNode[]; scene?: boolean; className?: string }) {
  return (
    <Tag className={className} data-lines={scene ? "scene" : ""}>
      {lines.map((line, i) => (
        <span className="line" key={i}>
          <span className="line-inner">{line}</span>
        </span>
      ))}
    </Tag>
  );
}
