import { loadConfig } from "@/server/config";

// Reads server environment at request time, never at build time.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function HomePage() {
  const config = loadConfig();
  return (
    <>
      <h1>ProofLoop</h1>
      <p>Health: application skeleton is running.</p>
      <ul>
        <li>Bind address: {config.host}:{config.port}</li>
        <li>Kane execution: not implemented yet (Phase 3)</li>
        <li>Storage: local SQLite, API under /api/v1 (no UI yet, Phase 5)</li>
      </ul>
    </>
  );
}
