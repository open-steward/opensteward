# End-to-end browser suite

Playwright journeys against a **running** OpenSteward stack. This suite
starts nothing — bring the stack up first (`docker compose up -d`, or the
dev servers), then:

```bash
pnpm --filter @opensteward/e2e run test:e2e
```

No stack listening → every spec **skips** (never fails). First run may need
`pnpm exec playwright install chromium`.

## Why a browser suite exists at all

The `tests/journeys/` suites across the apps drive Fastify in-process and
assert on HTML strings. They never execute a page's client-side `<script>` —
and the Connect Link hosted flow is mostly client-side script, so bugs
there (e.g. in a credential form's redirect handling) only surface in a
real browser. This suite is the layer that runs what customers' browsers run.

## Tiers

| Tier | Needs | Covers |
|---|---|---|
| 1 — zero config | a running stack | Public connect surface (branded error pages, landing page script), health, docs portal rendering |
| 2 — admin login | admin credentials — `OS_E2E_ADMIN_USER` + `OS_E2E_ADMIN_PASSWORD`, or nothing at all on a compose deployment (the suite falls back to the root `.env`'s own `ADMIN_USER` / `ADMIN_USER_PASSWORD`) | Login, minting a test API key (verified live against the sandbox, then revoked), minting a connect link and opening it from the customer's seat; the data viewer (`data-access.spec.ts`: browse a connection's stored records, open one and check personal data is masked, draw the built-in overview dashboard, export CSV), which also needs a connection with synced records in the login's scope and skips without one; embedded Superset (`superset-embed.spec.ts`), which also needs `OS_E2E_SUPERSET_URL` |
| 3 — platform credentials | operator app config for a platform + a real end-user sandbox login | The full OAuth consent click-through (provider login → callback → thank-you → warm-up sync). No tier-3 specs ship; adding them requires operator platform config plus a real sandbox login to drive the consent screen |

## Environment

| Variable | Default | |
|---|---|---|
| `OS_E2E_ADMIN_URL` | `http://localhost:3000` | admin console |
| `OS_E2E_API_URL` | `http://localhost:3010` | integration-server |
| `OS_E2E_DOCS_URL` | `http://localhost:3003` | docs-server |
| `OS_E2E_ADMIN_USER` / `OS_E2E_ADMIN_PASSWORD` | falls back to `ADMIN_USER` / `ADMIN_USER_PASSWORD` (or `ADMIN_PASS`) from the repo root `.env` | gates tier 2 |
| `OS_E2E_DATA_CONNECTION_ID` | unset — the first connection on `/data` with stored records | pins the connection `data-access.spec.ts` browses. The `/test/v1` sandbox keeps its fixtures apart from the `resources` table, so it cannot seed the data viewer: connect a platform and let it sync |
| `OS_E2E_SUPERSET_URL` | unset | browser-facing Superset URL; gates `superset-embed.spec.ts` (see `docs/deployment/superset.md`) |

Point it only at a local or staging stack, never a production deployment:
tier-2 journeys create (and clean up) real rows, labelled `(e2e)`.

The script is `test:e2e`, not `test`, deliberately — `pnpm -r test` must
never try to drive a browser in the unit-test sweep.
