import { homedir } from "node:os";
import { join } from "node:path";

// Blacksmith has no public API; the CLI drives the same backend the dashboard SPA uses.
export const API_BASE = "https://dashboardbackend.blacksmith.sh";
// Laravel checks Origin/Referer for CORS + CSRF; the dashboard origin keeps requests accepted.
export const ORIGIN = "https://app.blacksmith.sh";
export const REFERER = "https://app.blacksmith.sh/";

export const CONFIG_DIR = join(homedir(), ".config", "bs");
export const CREDS_PATH = join(CONFIG_DIR, "creds.json");

// Org is a path segment on nearly every endpoint. Resolution order: --org flag, then
// BLACKSMITH_ORG env, then the org saved in creds.json.
export function envOrg(): string | undefined {
  return process.env.BLACKSMITH_ORG || undefined;
}
