---
name: blacksmith-cli
description: Invoke the `bs` CLI to query a blacksmith.sh org's dashboard backend — CI/Actions usage and metrics (core-usage, jobs, workflows, runs, docker builds, sticky disks), monitoring (failure histograms, repo/workflow/job/step health, rules), billing (invoices, unpaid, payment method), settings (codesmith/MCP/skills, SSH, log ingestion, max timeout, branch protection), integrations (slack, linear), team, and assistant sessions. Blacksmith has NO public API or API keys, so `bs` replays the private dashboard backend using imported browser session cookies. Use whenever a task needs data from blacksmith.sh: "what's my blacksmith core usage", "how many vCPUs am I using", "show CI job metrics for repo X", "which workflows are failing", "blacksmith invoice amount", "list my blacksmith runner types", "is autofix enabled", "blacksmith team members". Covers cookie auth import, org resolution, the --query/--body flags, and how to regenerate the command catalog from a HAR.
---

# Blacksmith CLI

Invoke the `bs` binary. Source of truth: [`paymog/blacksmith-cli`](https://github.com/paymog/blacksmith-cli).

Blacksmith has **no public API and no API keys**. `bs` drives the same private backend
(`dashboardbackend.blacksmith.sh`) that the dashboard SPA uses, authenticated with the
user's **browser session cookies**. Commands are HAR-derived (generated from a captured
browser session), so this is personal tooling — endpoints can change without notice.

## Auth (required before any command)

Cookies are imported from a browser session, not an API key.

```sh
# In the logged-in dashboard: devtools → Network → right-click any request to
# dashboardbackend.blacksmith.sh → Copy as cURL. Then:
bs auth import '<paste curl>'        # or:  pbpaste | bs auth import
bs auth import ./session.curl        # from a file
bs auth set-org sinatra-dev          # default org for path params
bs auth status                       # show cookies + resolved org
```

The importer keeps `remember_web_*`, `blacksmith_session`, `XSRF-TOKEN` and drops analytics
cookies. Creds live at `~/.config/bs/creds.json` (chmod 600). The CLI persists rotated
`Set-Cookie` responses to keep the session warm.

**Session expiry:** a `401` or `419` means the session died (logout, password change, token
rotation). `bs` fails loudly telling you to re-import a fresh cookie — there's no refresh.

> HARs exported from Brave/Chrome often **strip cookies**. If `bs auth import <har>` finds
> none, use the **Copy as cURL** output instead.

## Org resolution

Almost every command has an `:org` path param. Resolved in order:
`--org <org>` → `$BLACKSMITH_ORG` → saved default (`bs auth set-org`). Set a default once and
omit `--org` thereafter; override per-call with `--org`.

## Usage

```sh
bs list [filter]            # list every command (optionally filtered by substring)
bs <command...> [flags]
```

Output is pretty-printed JSON. Pipe to `jq`, or use `--raw` for the unformatted response.

### Flags

| Flag | Meaning |
| --- | --- |
| `--org <org>` | org path param (or `$BLACKSMITH_ORG` / saved default) |
| `--<param> <value>` | other path params: `--repo`, `--run-id`, `--job-id`, `--session-id` |
| `--query key=value` | query param, repeatable (dates, filters, pagination) |
| `--body-file <path>` | JSON request body from file (for POSTs) |
| `--body-json '<json>'` | inline JSON request body |
| `--set a.b=value` | set a body field, repeatable |
| `--raw` | print the raw response, no JSON formatting |

Array query params show in `bs list` with a `[]` suffix (e.g. `repositories[]`). Repeat the
flag to send multiple: `--query 'repositories[]=sinatra' --query 'repositories[]=other'`.

Dates are ISO-8601 UTC (`2026-06-04T00:00:00.000Z`). There's no built-in "now" — compute with
`date -u +%FT%T.000Z`.

## Command surface

Run `bs list` for the authoritative set. Grouped highlights (all are `GET` unless noted):

### Usage & billing
```sh
bs metrics core-usage current                 # live vCPUs/jobs by arch (amd64/arm64/macos)
bs metrics core-usage timeseries --query window_size=60 \
  --query start_date=<iso> --query end_date=<iso>
bs metrics total           --query start_date=<iso> --query end_date=<iso>
bs metrics daily           --query start_date=<iso> --query end_date=<iso>
bs metrics runner-types    --query start_date=<iso> --query end_date=<iso>
bs metrics repositories    --query start_date=<iso> --query end_date=<iso>
bs metrics invoice-amount
bs unpaid-invoices
bs has-payment-method
```

### Actions / CI metrics
```sh
bs metrics actions jobs jobs        --query start_date=<iso> --query end_date=<iso> --query repository=<repo>
bs metrics actions jobs runs        --query start_date=<iso> --query end_date=<iso> --query limit=50
bs metrics actions jobs runs histogram        --query bucket_count=24 --query start_date=<iso> --query end_date=<iso>
bs metrics actions jobs job-duration-histogram --query bucket_count=24 --query start_date=<iso> --query end_date=<iso>
bs metrics actions jobs runner-types
bs metrics actions jobs branches
bs metrics actions workflows runs   --query start_date=<iso> --query end_date=<iso> --query limit=50
bs metrics actions workflows runs jobs get --run-id <id> --job-id <id>
bs metrics actions jobs runs filter-options    # discover valid filter values
```

### Docker build metrics
```sh
bs metrics docker daily          --query start_date=<iso> --query end_date=<iso>
bs metrics docker daily-by-type  --query start_date=<iso> --query end_date=<iso>
bs metrics docker repositories   --query start_date=<iso> --query end_date=<iso>
bs metrics docker build-duration-histogram --query bucket_count=24 --query start_date=<iso> --query end_date=<iso>
bs metrics docker sticky-disk total
```

### Sticky disks
```sh
bs metrics stickydisks
bs metrics stickydisks repositories get     --repo <repo>
bs metrics stickydisks repositories summary --repo <repo>
```

### Monitoring (CI health)
```sh
bs monitoring repositories                          # repos with monitoring
bs monitoring repositories workflows --repo <repo>
bs monitoring repositories jobs      --repo <repo> --query workflow=<name>
bs monitoring repositories steps     --repo <repo> --query workflow=<name> --query job=<name>
bs monitoring repositories branches  --repo <repo>
bs monitoring failure-histogram --query repository=<repo> --query workflow=<name>
bs monitoring rules --query limit=50
```

### Logs (Blacksmith log ingestion)
```sh
bs metrics logs search    --query query=<q> --query start_time=<iso> --query end_time=<iso>
bs metrics logs histogram --query query=<q> --query start_time=<iso> --query end_time=<iso>
bs metrics logs search filter-options --query property=<field>
```

### Settings & integrations
```sh
bs team
bs primary-email
bs runner-region
bs ssh settings
bs branch-protection
bs log-ingestion settings
bs max-timeout settings
bs docker-container-caching
bs user-autofix-settings
bs user-pr-comment-settings
bs github-comments
bs codesmith-settings                 # also: mcp-providers, mcp-servers, skills
bs codesmith-settings mcp-servers
bs slack workspace                    # also: slack install-url, slack link
bs linear workspace                   # also: linear install-url, linear link
bs is-personal-org
bs migrate-runners repositories --query search=<q> --query per_page=50
```

### Assistant
```sh
bs assistant sessions --query limit=20
bs assistant sessions get --session-id <uuid>
```

### Writes (POST)
```sh
bs orgs create --body-json '{"org_name":"my-org"}'   # POST /api/user/github/orgs
```
POSTs automatically send the `X-XSRF-TOKEN` header from the `XSRF-TOKEN` cookie.

## Recipes

### Current usage at a glance
```sh
bs metrics core-usage current | jq '.current_usage'
```

### Total billable minutes by runner type
```sh
END=$(date -u +%FT%T.000Z); START=$(date -u -v-30d +%FT%T.000Z)   # GNU: date -u -d '30 days ago'
bs metrics runner-types --query start_date=$START --query end_date=$END \
  | jq 'sort_by(-(.total_billable_minutes|tonumber)) | .[] | {type:.runner_type, min:.runtime_minutes, cost}'
```

### Workflow runs in the last day
```sh
END=$(date -u +%FT%T.000Z); START=$(date -u -v-1d +%FT%T.000Z)
bs metrics actions workflows runs --query start_date=$START --query end_date=$END --query limit=50
```

### Which value does a filter accept?
```sh
bs metrics actions jobs runs filter-options        # enumerate valid repository/workflow/etc values
bs metrics logs search filter-options --query property=service
```

## Regenerate the command catalog

Commands live in `src/commands/generated.ts`, generated from a HAR captured in the dashboard:

```sh
bun run codegen ~/Downloads/app.blacksmith.sh.har
```

Path params (`:org`, `:repo`, `:run_id`, `:job_id`, `:session_id`) are templated; observed
query keys are recorded for `bs list`. After regenerating, rebuild the binary (`bun run build`).

## Common issues

### `not authenticated` / `HTTP 401` / `HTTP 419`
- Not authenticated → `bs auth import <curl>` first.
- 401/419 after working before → the session expired. Re-copy a cURL from a logged-in
  dashboard tab and `bs auth import` again. There is no token refresh.

### `missing --org` (or `--repo`, `--run-id`, …)
The command has a path param with no value. Pass `--org` (or set a default with
`bs auth set-org`) and any `--repo`/`--run-id`/`--job-id` the command lists in `bs list`.

### `HTTP 422` with a validation message
The query/body values are the wrong type or shape (e.g. `window_size` must be an integer).
The response body names the offending field — fix the `--query`/`--body` value.

### `unknown command`
Run `bs list <filter>` to find the exact token sequence. Commands are the URL path with
boilerplate (`api/user/github/orgs/:org`) stripped, e.g.
`/api/user/github/orgs/:org/metrics/core-usage/current` → `bs metrics core-usage current`.

### Command missing entirely
The endpoint wasn't in the captured HAR. Capture a fresh HAR exercising that dashboard page
and regenerate (see above).
