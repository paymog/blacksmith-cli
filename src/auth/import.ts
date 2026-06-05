import { parseCookieString, type CookieJar } from "./cookies.ts";

// Pull a cookie jar out of pasted input. Supports three shapes:
//   1. A full `curl ...` command (reads -b / --cookie / -H 'cookie: ...').
//   2. A HAR file's JSON (reads request.cookies or the Cookie header, if present).
//   3. A bare `name=value; name2=value2` cookie string.
export function extractCookies(input: string): CookieJar {
  const trimmed = input.trim();

  // HAR: JSON with a log.entries array.
  if (trimmed.startsWith("{")) {
    try {
      const har = JSON.parse(trimmed);
      const jar = cookiesFromHar(har);
      if (Object.keys(jar).length) return jar;
    } catch {
      // fall through to curl/string parsing
    }
  }

  // curl command: find -b/--cookie or a -H 'cookie: ...' header.
  if (/(^|\s)curl(\s|$)/.test(trimmed) || /-b\s|--cookie\s|cookie:/i.test(trimmed)) {
    const fromCurl = cookiesFromCurl(trimmed);
    if (Object.keys(fromCurl).length) return fromCurl;
  }

  // Bare cookie string fallback.
  return parseCookieString(trimmed);
}

function cookiesFromCurl(curl: string): CookieJar {
  // -b 'value' or --cookie 'value'
  const bMatch = curl.match(/(?:-b|--cookie)\s+(['"])([\s\S]*?)\1/);
  if (bMatch) return parseCookieString(bMatch[2]!);

  // -H 'cookie: value' (case-insensitive header name)
  const hMatch = curl.match(/-H\s+(['"])\s*cookie:\s*([\s\S]*?)\1/i);
  if (hMatch) return parseCookieString(hMatch[2]!);

  return {};
}

function cookiesFromHar(har: any): CookieJar {
  const entries: any[] = har?.log?.entries ?? [];
  const jar: CookieJar = {};
  for (const e of entries) {
    const url: string = e?.request?.url ?? "";
    if (!url.includes("blacksmith.sh")) continue;
    // Structured cookies array.
    for (const c of e?.request?.cookies ?? []) {
      if (c?.name) Object.assign(jar, parseCookieString(`${c.name}=${c.value ?? ""}`));
    }
    // Or the raw Cookie header.
    for (const h of e?.request?.headers ?? []) {
      if (typeof h?.name === "string" && h.name.toLowerCase() === "cookie") {
        Object.assign(jar, parseCookieString(h.value ?? ""));
      }
    }
  }
  return jar;
}
