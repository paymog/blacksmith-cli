import { mkdirSync } from "node:fs";
import { CONFIG_DIR, CREDS_PATH } from "../config.ts";
import type { CookieJar } from "./cookies.ts";

export type Creds = {
  cookies: CookieJar;
  org?: string;
  updatedAt: string;
};

export async function loadCreds(): Promise<Creds | undefined> {
  const file = Bun.file(CREDS_PATH);
  if (!(await file.exists())) return undefined;
  try {
    const data = (await file.json()) as Creds;
    if (!data.cookies) return undefined;
    return data;
  } catch {
    return undefined;
  }
}

export async function saveCreds(creds: Creds): Promise<void> {
  mkdirSync(CONFIG_DIR, { recursive: true });
  // now() at write time is fine — these timestamps are informational, not load-bearing.
  creds.updatedAt = new Date().toISOString();
  await Bun.write(CREDS_PATH, JSON.stringify(creds, null, 2));
  // Credentials file: owner-only.
  await Bun.$`chmod 600 ${CREDS_PATH}`.quiet().nothrow();
}

export async function requireCreds(): Promise<Creds> {
  const creds = await loadCreds();
  if (!creds) {
    throw new Error(
      "not authenticated. Run `bs auth import <curl-or-har>` to import a session.",
    );
  }
  return creds;
}
