#!/usr/bin/env bun
// Generate src/commands/generated.ts from a Blacksmith dashboard HAR.
// Usage: bun run src/codegen/fromHar.ts <app.blacksmith.sh.har>
import { join } from "node:path";
import type { Command } from "../commands/types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIGITS = /^\d+$/;

// Collection segment -> the name of the path param that follows it.
const COLLECTION_PARAM: Record<string, string> = {
  orgs: "org",
  repositories: "repo",
  runs: "run_id",
  jobs: "job_id",
  sessions: "session_id",
  workflows: "workflow_id",
};

// Collections whose following segment is ALWAYS a param even though the value
// isn't id-shaped (org slugs and repo names are arbitrary strings, not UUIDs).
const ALWAYS_PARAM_AFTER = new Set(["orgs", "repositories"]);

// Leading boilerplate stripped from command names (every org endpoint carries it).
const NAME_PREFIX_NOISE = new Set(["api", "user", "github", "orgs"]);

function templatePath(rawPath: string): { path: string; params: string[] } {
  const segs = rawPath.split("/").filter(Boolean);
  const params: string[] = [];
  const out: string[] = [];
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]!;
    const prev = segs[i - 1];
    // A segment is a path param when it's id-shaped (digits/UUID) or it follows
    // a collection whose children are arbitrary slugs (orgs/<slug>, repositories/<name>).
    const isParam =
      UUID.test(seg) || DIGITS.test(seg) || (prev !== undefined && ALWAYS_PARAM_AFTER.has(prev));
    if (isParam) {
      let name = (prev ? COLLECTION_PARAM[prev] : undefined) ?? `${singular(prev ?? seg)}_id`;
      // De-dupe param names within one path (e.g. two numeric ids).
      while (params.includes(name)) name += "_2";
      params.push(name);
      out.push(`:${name}`);
    } else {
      out.push(seg);
    }
  }
  return { path: "/" + out.join("/"), params };
}

function singular(s: string): string {
  if (s.endsWith("ies")) return s.slice(0, -3) + "y";
  if (s.endsWith("s")) return s.slice(0, -1);
  return s;
}

function verbFor(method: string): string | undefined {
  switch (method.toUpperCase()) {
    case "POST":
      return "create";
    case "PUT":
    case "PATCH":
      return "update";
    case "DELETE":
      return "delete";
    default:
      return undefined;
  }
}

function commandName(templatedPath: string, method: string): string[] {
  const segs = templatedPath.split("/").filter(Boolean);
  // Drop leading boilerplate (api/user/github/orgs) and the org param.
  let start = 0;
  while (start < segs.length) {
    const s = segs[start]!;
    if (NAME_PREFIX_NOISE.has(s) || s.startsWith(":")) start++;
    else break;
  }
  let rest = segs.slice(start);
  const trailingParam = rest.length > 0 && rest[rest.length - 1]!.startsWith(":");
  // Name tokens = the non-param segments.
  const tokens = rest.filter((s) => !s.startsWith(":"));
  if (tokens.length === 0) tokens.push(...segs.filter((s) => !s.startsWith(":")));
  const verb = verbFor(method);
  if (verb) tokens.push(verb);
  else if (trailingParam) tokens.push("get");
  return tokens;
}

async function main() {
  const harPath = process.argv[2];
  if (!harPath) {
    console.error("usage: bun run src/codegen/fromHar.ts <har>");
    process.exit(1);
  }
  const har = await Bun.file(harPath).json();
  const entries: any[] = har?.log?.entries ?? [];

  // Key by method + templated path; collect query keys across all matching entries.
  const byKey = new Map<string, Command & { _names: Set<string> }>();
  for (const e of entries) {
    const method: string = e?.request?.method ?? "";
    const url: string = e?.request?.url ?? "";
    if (!url.includes("dashboardbackend.blacksmith.sh")) continue;
    if (method === "OPTIONS") continue;
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      continue;
    }
    const { path, params } = templatePath(u.pathname);
    const key = `${method} ${path}`;
    const queryKeys = [...u.searchParams.keys()];
    const ct = (e?.request?.headers ?? []).find(
      (h: any) => typeof h?.name === "string" && h.name.toLowerCase() === "content-type",
    )?.value;

    let cmd = byKey.get(key);
    if (!cmd) {
      cmd = {
        name: [],
        method,
        path,
        pathParams: params,
        query: [],
        bodyContentType: ct && method !== "GET" ? String(ct).split(";")[0] : undefined,
        description: `${method} ${path}`,
        _names: new Set(),
      };
      byKey.set(key, cmd);
    }
    for (const q of queryKeys) if (!cmd.query.includes(q)) cmd.query.push(q);
  }

  // Assign names, resolving collisions.
  const used = new Set<string>();
  const commands: Command[] = [];
  for (const cmd of [...byKey.values()].sort((a, b) => a.path.localeCompare(b.path))) {
    let name = commandName(cmd.path, cmd.method);
    let joined = name.join(" ");
    if (used.has(joined)) {
      name = [...name, cmd.method.toLowerCase()];
      joined = name.join(" ");
    }
    let n = 2;
    while (used.has(joined)) {
      joined = `${name.join(" ")} ${n++}`;
    }
    used.add(joined);
    cmd.name = joined.split(" ");
    const { _names, ...clean } = cmd as any;
    commands.push(clean);
  }

  commands.sort((a, b) => a.name.join(" ").localeCompare(b.name.join(" ")));

  const header = `// AUTO-GENERATED by src/codegen/fromHar.ts — do not edit by hand.
// Regenerate: bun run codegen <har>
import type { Command } from "./types.ts";

export const commands: Command[] = `;
  const body = JSON.stringify(commands, null, 2);
  const outPath = join(import.meta.dir, "..", "commands", "generated.ts");
  await Bun.write(outPath, header + body + ";\n");
  console.error(`wrote ${commands.length} commands to ${outPath}`);
}

main();
