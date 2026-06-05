// Cookie names we never persist — analytics/telemetry that only bloats the jar.
const JUNK_PREFIXES = ["ph_phc_", "_ga", "_gid", "intercom-", "ajs_"];

export type CookieJar = Record<string, string>;

export function isJunk(name: string): boolean {
  return JUNK_PREFIXES.some((p) => name.startsWith(p));
}

// Parse a `name=value; name2=value2` cookie string into a jar, dropping junk.
export function parseCookieString(raw: string): CookieJar {
  const jar: CookieJar = {};
  for (const pair of raw.split(";")) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const name = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!name || isJunk(name)) continue;
    jar[name] = value;
  }
  return jar;
}

// Serialize a jar back into a Cookie header value.
export function serializeJar(jar: CookieJar): string {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

// Merge Set-Cookie header values from a response into the jar (rotation).
// Each Set-Cookie is `name=value; Path=/; HttpOnly; ...` — we keep only name=value.
export function mergeSetCookies(jar: CookieJar, setCookies: string[]): boolean {
  let changed = false;
  for (const sc of setCookies) {
    const first = sc.split(";")[0]?.trim();
    if (!first) continue;
    const eq = first.indexOf("=");
    if (eq < 0) continue;
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    if (!name || isJunk(name)) continue;
    // An empty/expired value means the server cleared the cookie.
    if (value === "" || value === "deleted") {
      if (jar[name] !== undefined) {
        delete jar[name];
        changed = true;
      }
      continue;
    }
    if (jar[name] !== value) {
      jar[name] = value;
      changed = true;
    }
  }
  return changed;
}

// Laravel expects the X-XSRF-TOKEN header to be the URL-decoded XSRF-TOKEN cookie.
export function xsrfHeader(jar: CookieJar): string | undefined {
  const raw = jar["XSRF-TOKEN"];
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

// Cookies that signal a live session. Used to validate an import.
export function hasAuthCookies(jar: CookieJar): boolean {
  return Object.keys(jar).some(
    (n) => n.startsWith("remember_web_") || n === "blacksmith_session",
  );
}
