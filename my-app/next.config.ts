import type { NextConfig } from "next";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(appRoot, "..");

const nextConfig: NextConfig = {
  outputFileTracingRoot: workspaceRoot,
};

export default nextConfig;