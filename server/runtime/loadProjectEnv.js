import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const PROJECT_ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
export const DEFAULT_PROJECT_ENV_PATH = path.join(PROJECT_ROOT, ".env");

export function loadProjectEnv({ envFilePath = DEFAULT_PROJECT_ENV_PATH } = {}) {
  const resolvedEnvFilePath = path.resolve(envFilePath);
  if (typeof process.loadEnvFile !== "function") {
    return {
      loaded: false,
      path: resolvedEnvFilePath,
      reason: "unsupported",
    };
  }
  if (!fs.existsSync(resolvedEnvFilePath)) {
    return {
      loaded: false,
      path: resolvedEnvFilePath,
      reason: "missing",
    };
  }
  process.loadEnvFile(resolvedEnvFilePath);
  return {
    loaded: true,
    path: resolvedEnvFilePath,
    reason: "loaded",
  };
}
