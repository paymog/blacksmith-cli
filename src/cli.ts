#!/usr/bin/env bun
import { commands } from "./commands/generated.ts";
import { commandKey, findCommand, type Command } from "./commands/types.ts";
import { extractCookies } from "./auth/import.ts";
import { hasAuthCookies } from "./auth/cookies.ts";
import { loadCreds, requireCreds, saveCreds } from "./auth/store.ts";
import { request, type RequestOptions } from "./http/client.ts";
import { envOrg } from "./config.ts";

const VERSION = "0.1.0";

type Flags = {
  values: Record<string, string>; // --key value  and  --key=value
  query: [string, string][];
  set: [string, string][];
  bodyJson?: string;
  bodyFile?: string;
  raw: boolean;
};

function parseFlags(args: string[], command?: Command): Flags {
  const flags: Flags = { values: {}, query: [], set: [], raw: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (!arg.startsWith("--")) throw new Error(`unexpected argument: ${arg}`);
    let key = arg.slice(2);
    let value: string | undefined;
    const eq = key.indexOf("=");
    if (eq >= 0) {
      value = key.slice(eq + 1);
      key = key.slice(0, eq);
    }
    const takeValue = () => {
      if (value !== undefined) return value;
      const next = args[++i];
      if (next === undefined) throw new Error(`flag --${key} needs a value`);
      return next;
    };
    switch (key) {
      case "raw":
        flags.raw = true;
        break;
      case "query":
      case "q": {
        const [k, ...rest] = takeValue().split("=");
        flags.query.push([k!, rest.join("=")]);
        break;
      }
      case "set": {
        const [k, ...rest] = takeValue().split("=");
        flags.set.push([k!, rest.join("=")]);
        break;
      }
      case "body-json":
        flags.bodyJson = takeValue();
        break;
      case "body-file":
        flags.bodyFile = takeValue();
        break;
      default:
        // Treat as a path-param value (--org, --repo, --run-id, ...).
        flags.values[key.replace(/-/g, "_")] = takeValue();
    }
  }
  return flags;
}

async function buildBody(flags: Flags): Promise<unknown> {
  let body: any = undefined;
  if (flags.bodyFile) {
    const file = Bun.file(flags.bodyFile);
    body = await file.json();
  }
  if (flags.bodyJson) body = JSON.parse(flags.bodyJson);
  for (const [k, v] of flags.set) {
    if (typeof body !== "object" || body === null) body = {};
    setDeep(body, k, parseValue(v));
  }
  return body;
}

function setDeep(target: any, path: string, value: unknown) {
  const parts = path.split(".");
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    if (typeof cursor[part] !== "object" || cursor[part] === null) cursor[part] = {};
    cursor = cursor[part];
  }
  cursor[parts[parts.length - 1]!] = value;
}

function parseValue(v: string): unknown {
  if (v === "true") return true;
  if (v === "false") return false;
  if (v === "null") return null;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

function printResult(text: string, contentType: string, raw: boolean) {
  if (raw || !contentType.includes("json")) {
    process.stdout.write(text.endsWith("\n") ? text : text + "\n");
    return;
  }
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    process.stdout.write(text + "\n");
  }
}

function listCommands(filter: string) {
  for (const c of commands) {
    const key = commandKey(c);
    if (filter && !key.includes(filter)) continue;
    const params = c.pathParams.map((p) => `--${p.replace(/_/g, "-")} <${p}>`).join(" ");
    const q = c.query.length ? `  [--query ${c.query.join("|")}]` : "";
    console.log(`${c.method.padEnd(4)} ${key}${params ? " " + params : ""}${q}`);
  }
}

async function readSource(args: string[]): Promise<string> {
  if (args.length === 0 || args[0] === "-") {
    return await Bun.stdin.text();
  }
  const candidate = args[0]!;
  const file = Bun.file(candidate);
  if (await file.exists()) return await file.text();
  // Treat the remaining args as literal pasted text (e.g. an inline curl).
  return args.join(" ");
}

async function handleAuth(args: string[]) {
  const sub = args[0];
  switch (sub) {
    case "import": {
      const source = await readSource(args.slice(1));
      const cookies = extractCookies(source);
      if (!Object.keys(cookies).length) {
        throw new Error("no cookies found in input (expected a curl command, HAR, or cookie string)");
      }
      if (!hasAuthCookies(cookies)) {
        console.error(
          "warning: no remember_web_* or blacksmith_session cookie found; session may not authenticate.",
        );
      }
      const existing = await loadCreds();
      await saveCreds({ cookies: { ...existing?.cookies, ...cookies }, org: existing?.org, updatedAt: "" });
      console.log(`imported ${Object.keys(cookies).length} cookie(s): ${Object.keys(cookies).join(", ")}`);
      break;
    }
    case "status": {
      const creds = await loadCreds();
      if (!creds) {
        console.log("not authenticated. Run `bs auth import <curl>`.");
        process.exit(1);
      }
      console.log(`authenticated. cookies: ${Object.keys(creds.cookies).join(", ")}`);
      console.log(`org: ${creds.org ?? envOrg() ?? "(none set — pass --org or set BLACKSMITH_ORG)"}`);
      console.log(`updated: ${creds.updatedAt}`);
      break;
    }
    case "set-org": {
      const org = args[1];
      if (!org) throw new Error("usage: bs auth set-org <org>");
      const creds = await requireCreds();
      creds.org = org;
      await saveCreds(creds);
      console.log(`default org set to ${org}`);
      break;
    }
    case "logout": {
      await saveCreds({ cookies: {}, updatedAt: "" });
      console.log("cleared credentials.");
      break;
    }
    default:
      console.log("usage: bs auth <import|status|set-org|logout>");
  }
}

function usage() {
  console.log(`bs — Blacksmith dashboard CLI (v${VERSION})

Usage:
  bs auth import [<curl|har|file>]   import a session (reads stdin if no arg)
  bs auth status                     show auth state
  bs auth set-org <org>              set default org
  bs auth logout                     clear credentials
  bs list [filter]                   list available commands
  bs <command...> [flags]            run a command (see \`bs list\`)

Flags:
  --org <org>           org path param (default: BLACKSMITH_ORG or saved org)
  --<param> <value>     other path params (e.g. --repo, --run-id)
  --query key=value     query param (repeatable)
  --body-file <path>    JSON request body from file
  --body-json '<json>'  inline JSON request body
  --set a.b=value       set a body field (repeatable)
  --raw                 print raw response, no JSON formatting`);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h" || argv[0] === "help") {
    usage();
    return;
  }
  if (argv[0] === "--version" || argv[0] === "version") {
    console.log(VERSION);
    return;
  }
  if (argv[0] === "auth") return handleAuth(argv.slice(1));
  if (argv[0] === "list") return listCommands(argv.slice(1).join(" "));

  // Split leading non-flag tokens (the command path) from flags.
  const splitAt = argv.findIndex((a) => a.startsWith("-"));
  const tokens = splitAt === -1 ? argv : argv.slice(0, splitAt);
  const flagArgs = splitAt === -1 ? [] : argv.slice(splitAt);

  const command = findCommand(commands, tokens);
  if (!command) {
    console.error(`unknown command: ${tokens.join(" ")}\nRun \`bs list\` to see commands.`);
    process.exit(1);
  }

  const creds = await requireCreds();
  const flags = parseFlags(flagArgs, command);

  // Resolve org from --org, env, or saved default.
  const pathValues: Record<string, string> = { ...flags.values };
  if (command.pathParams.includes("org") && !pathValues.org) {
    const org = creds.org ?? envOrg();
    if (org) pathValues.org = org;
  }

  const opts: RequestOptions = {
    pathValues,
    query: flags.query,
    body: await buildBody(flags),
  };

  const resp = await request(command, creds, opts);
  printResult(resp.text, resp.contentType, flags.raw);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
