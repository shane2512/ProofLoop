import type { ReactNode } from "react";

/** Dark, compact frame for the dashboard. Sits under the fixed site navigation. */
export function WorkspaceShell({ children }: { children: ReactNode }) {
  return (
    <div className="ws-shell">
      <div className="ws-wrap">{children}</div>
    </div>
  );
}
