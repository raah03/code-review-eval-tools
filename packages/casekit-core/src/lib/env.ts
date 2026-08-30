import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

/** returns the path so callers can name the file when a key is missing, resolved from this module's location not cwd */
export function loadWorkspaceEnv(): string {
  // dist/lib/env.js -> dist -> casekit-core -> packages -> code-review-eval
  const path = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", ".env");
  config({ path });
  return path;
}
