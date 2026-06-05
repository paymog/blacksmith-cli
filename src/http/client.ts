import { API_BASE, ORIGIN, REFERER } from "../config.ts";
import { mergeSetCookies, serializeJar, xsrfHeader } from "../auth/cookies.ts";
import { saveCreds, type Creds } from "../auth/store.ts";
import type { Command } from "../commands/types.ts";

export type RequestOptions = {
  pathValues: Record<string, string>;
  query: [string, string][];
  body?: unknown;
};

export type Response = {
  status: number;
  contentType: string;
  text: string;
};

function buildUrl(command: Command, opts: RequestOptions): string {
  let path = command.path;
  for (const param of command.pathParams) {
    const value = opts.pathValues[param];
    if (!value) {
      const flag = param.replace(/_/g, "-");
      throw new Error(`missing --${flag} <${param}> for \`${command.name.join(" ")}\``);
    }
    path = path.replace(`:${param}`, encodeURIComponent(value));
  }
  const url = new URL(API_BASE + path);
  for (const [k, v] of opts.query) url.searchParams.set(k, v);
  return url.toString();
}

export async function request(
  command: Command,
  creds: Creds,
  opts: RequestOptions,
): Promise<Response> {
  const url = buildUrl(command, opts);
  const headers: Record<string, string> = {
    accept: "application/json, text/plain, */*",
    origin: ORIGIN,
    referer: REFERER,
    cookie: serializeJar(creds.cookies),
  };

  let bodyInit: BodyInit | undefined;
  if (command.method !== "GET" && command.method !== "HEAD") {
    const xsrf = xsrfHeader(creds.cookies);
    if (xsrf) headers["x-xsrf-token"] = xsrf;
    if (opts.body !== undefined) {
      const ct = command.bodyContentType ?? "application/json";
      headers["content-type"] = ct;
      bodyInit =
        ct.includes("x-www-form-urlencoded") && typeof opts.body === "object"
          ? new URLSearchParams(opts.body as Record<string, string>).toString()
          : JSON.stringify(opts.body);
    }
  }

  const resp = await fetch(url, { method: command.method, headers, body: bodyInit });

  // Persist any rotated session/XSRF cookies so the session stays alive.
  const setCookies = resp.headers.getSetCookie?.() ?? [];
  if (setCookies.length && mergeSetCookies(creds.cookies, setCookies)) {
    await saveCreds(creds);
  }

  const text = await resp.text();

  if (resp.status === 401 || resp.status === 419) {
    throw new Error(
      `HTTP ${resp.status}: session expired or invalid. Re-run \`bs auth import <curl>\` with a fresh cookie.\n${text.slice(0, 500)}`,
    );
  }
  if (resp.status < 200 || resp.status >= 300) {
    throw new Error(`HTTP ${resp.status} ${resp.statusText}\n${text}`);
  }

  return {
    status: resp.status,
    contentType: resp.headers.get("content-type") ?? "",
    text,
  };
}
