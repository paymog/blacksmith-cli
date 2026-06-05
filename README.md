# blacksmith-cli (`bs`)

A CLI for [blacksmith.sh](https://blacksmith.sh)'s dashboard backend. Blacksmith has no
public API or API keys, so this drives the same private backend the dashboard SPA uses,
authenticated with session cookies you import from your browser. Commands are
**HAR-derived** — generated from a captured browser session.

> Personal tooling. You're replaying a private dashboard API with stolen-session-style
> cookies; endpoints can change without notice and the session can expire (see Auth).

## Install

**Homebrew** (no Bun required — installs a prebuilt binary):

```sh
brew install paymog/tap/blacksmith   # provides the `bs` command
```

**Bun** (if you have [Bun](https://bun.sh) — installs straight from GitHub):

```sh
bun install -g github:paymog/blacksmith-cli
```

**From source:**

```sh
bun install
bun run build        # produces ./bs for the current platform
bun run build:all    # cross-compile dist/ binaries (darwin/linux, arm64/x64)
```

Or run without building: `bun run src/cli.ts <command>`.

## Auth

There are no API keys. Authentication is your browser's Laravel session cookies.

1. In the Blacksmith dashboard (logged in), open devtools → Network, copy any request to
   `dashboardbackend.blacksmith.sh` as **cURL**.
2. Import it:

   ```sh
   bs auth import '<paste curl here>'      # or: pbpaste | bs auth import
   bs auth import ./session.curl           # from a file
   bs auth import ./app.blacksmith.sh.har  # from a HAR (if it includes cookies)
   bs auth set-org sinatra-dev             # default org for path params
   bs auth status
   ```

The importer keeps the auth cookies (`remember_web_*`, `blacksmith_session`, `XSRF-TOKEN`)
and drops analytics junk (posthog, etc.). Credentials are stored at
`~/.config/bs/creds.json` (chmod 600).

**How long it lasts:** the `remember_web_*` cookie is a Laravel "remember me" token
(effectively long-lived). The CLI sends all cookies on every request and persists any
rotated `Set-Cookie` it gets back, keeping the session warm. On `401`/`419` it fails loudly —
that's your signal to re-import a fresh cookie. POST/PUT requests send the `X-XSRF-TOKEN`
header derived from the `XSRF-TOKEN` cookie (Laravel CSRF convention).

> ⚠️ HARs exported from Brave/Chrome often **strip cookies**. If `bs auth import <har>`
> finds no cookies, use the cURL copy instead.

## Usage

```sh
bs list [filter]            # list available commands
bs <command...> [flags]
```

`org` is resolved from `--org`, then `$BLACKSMITH_ORG`, then the saved default
(`bs auth set-org`).

```sh
bs metrics core-usage current
bs team
bs is-personal-org --org usebasira
bs metrics core-usage timeseries --query window_size=60 \
  --query start_date=2026-06-04T00:00:00.000Z --query end_date=2026-06-05T00:00:00.000Z
bs monitoring repositories jobs --repo sinatra --query workflow=ci
```

### Flags

| Flag | Meaning |
| --- | --- |
| `--org <org>` | org path param (or `$BLACKSMITH_ORG` / saved default) |
| `--<param> <value>` | other path params, e.g. `--repo`, `--run-id`, `--job-id` |
| `--query key=value` | query param (repeatable) |
| `--body-file <path>` | JSON request body from file |
| `--body-json '<json>'` | inline JSON request body |
| `--set a.b=value` | set a body field (repeatable) |
| `--raw` | print the raw response, no JSON formatting |

## Regenerate the command catalog

Commands live in `src/commands/generated.ts`, generated from a HAR:

```sh
bun run codegen ~/Downloads/app.blacksmith.sh.har
```

The generator (`src/codegen/fromHar.ts`) scans `dashboardbackend.blacksmith.sh` requests,
templates path params (`:org`, `:repo`, `:run_id`, `:job_id`, …), and records observed query
keys for `bs list`.

## Claude Code skill

This repo ships a [Claude Code](https://claude.com/claude-code) skill that teaches the agent
to drive `bs` (cookie auth, org resolution, the command surface, and recipes). It lives in
[`skills/blacksmith-cli`](skills/blacksmith-cli).

Install with [`npx skills`](https://github.com/vercel-labs/skills):

```sh
npx skills add paymog/blacksmith-cli            # into ./.claude/skills/
npx skills add paymog/blacksmith-cli --global --yes
```

Or manually:

```sh
git clone https://github.com/paymog/blacksmith-cli
cp -r blacksmith-cli/skills/blacksmith-cli ~/.claude/skills/blacksmith-cli
```

## Release

Tag-driven. On a `v*` tag, GitHub Actions compiles the four binaries, attaches them to a
GitHub Release, and updates the `blacksmith` formula in `paymog/homebrew-tap` (binary
download, no build deps). The tap push uses the `HOMEBREW_TAP_DEPLOY_KEY` secret.

```sh
git tag v0.1.0
git push origin v0.1.0
```

## Shape

- `src/cli.ts` — entry point, arg parsing, command dispatch.
- `src/auth/` — cookie jar, curl/HAR import, credential storage.
- `src/http/client.ts` — request builder, cookie rotation, XSRF, error handling.
- `src/commands/` — `Command` type and the generated catalog.
- `src/codegen/fromHar.ts` — HAR → command catalog generator.
