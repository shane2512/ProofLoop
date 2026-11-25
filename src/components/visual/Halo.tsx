/**
 * The loop: a soft lit ring with a sharper inner edge, slowly drifting. Pure CSS, so it renders on the
 * server and costs nothing per frame. The halo is ProofLoop's stand-in for the reference's eclipse ring.
 */
export function Halo({ className }: { className?: string }) {
  return (
    <div className={`halo${className ? ` ${className}` : ""}`} aria-hidden="true" data-halo>
      <div className="halo-inner" />
      <div className="halo-spin">
        <div className="halo-ring" />
        <div className="halo-line" />
      </div>
    </div>
  );
}
