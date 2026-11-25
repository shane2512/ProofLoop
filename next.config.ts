import type { NextConfig } from "next";
import path from "node:path";

// Pin the workspace root to this project. A stray package-lock.json in the
// user's home directory otherwise makes Next.js pick the wrong root.
// Commands are run from the project root (npm scripts), so cwd is that root.
const projectRoot = path.resolve(process.cwd());

// No static export and no Edge runtime: ProofLoop needs the Node.js runtime
// to supervise a local Kane CLI process (TR-003).
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: { root: projectRoot },
  outputFileTracingRoot: projectRoot,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
