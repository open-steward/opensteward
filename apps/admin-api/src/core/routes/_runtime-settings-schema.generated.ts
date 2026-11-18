/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Source: apps/admin-api/src/core/db/runtime-settings-store.ts
 *         (RUNTIME_SETTINGS_SEEDS)
 * Generator: apps/admin-api/scripts/generate-runtime-settings-schema.ts
 *
 * Regenerate via `pnpm runtime-settings:generate` (also runs as part
 * of `pnpm docs:all`). CI fails if this file drifts from the source
 * inventory — see `scripts/check-docs-fresh.ts`.
 */
import { z } from 'zod'
import 'fastify-zod-openapi'

/**
 * Every known runtime-setting key. Mirrors RUNTIME_SETTINGS_SEEDS so
 * the path-parameter validator on PATCH/DELETE /api/runtime-settings/{key}
 * surfaces the choice list in Swagger UI.
 */
export const RUNTIME_SETTING_KEYS = [
  "rate_limit.api_key.per_minute",
  "rate_limit.api_key.window_ms",
  "rate_limit.mcp_tenant.per_minute",
  "rate_limit.mcp_end_user.per_minute",
  "rate_limit.connect_link.per_minute",
  "features.mcp_enabled",
  "features.end_user_mode_enabled",
  "features.test_mode_enabled",
  "connect_link.default_expiry_hours",
  "connect_link.one_time_default",
  "auth.local_login_enabled",
  "auth.break_glass_user_id",
  "auth.dev_api_keys_enabled",
  "auth.dev_oauth_enabled",
  "auth.sandbox_self_serve_enabled",
  "data_store.raw_payload.payments",
  "data_store.raw_payload.accounting",
  "data_store.sync.default_interval_minutes",
  "data_store.sync.scheduler_enabled",
  "data_access.mask_financial",
  "webhooks.delivery_retention_days",
  "webhooks.inbound_event_retention_days",
  "audit_log.retention_days",
  "openapi.servers.scheme",
  "openapi.servers.host",
  "openapi.servers.port",
  "openapi.servers.version",
  "logos.source",
  "logos.brandfetch_client_id",
  "logos.fetch_delay_ms",
  "logos.job_retention_days",
  "logos.fetch_referer",
] as const

export type RuntimeSettingKey = (typeof RUNTIME_SETTING_KEYS)[number]

export const RuntimeSettingKeyParam = z.object({
  key: z
    .enum(RUNTIME_SETTING_KEYS)
    .meta({ description: 'Runtime-setting key — one of the seeded inventory.' }),
}).meta({ id: 'RuntimeSettingKeyParam' })

// ── Body branches, one per value shape ──────────────────────────────
//
// Settings that take the same kind of value share a branch: `key` is
// the enum of those settings, `value` is typed once. Swagger UI, the
// SDK and the CLI still get a real type per shape — a number input,
// a checkbox, a dropdown — without a component per setting.

/** number: rate_limit.api_key.per_minute, rate_limit.api_key.window_ms, rate_limit.mcp_tenant.per_minute, rate_limit.mcp_end_user.per_minute, rate_limit.connect_link.per_minute, connect_link.default_expiry_hours, data_store.sync.default_interval_minutes, webhooks.delivery_retention_days, webhooks.inbound_event_retention_days, audit_log.retention_days, logos.fetch_delay_ms, logos.job_retention_days */
export const UpdateRuntimeSettingBodyNumber = z
  .object({
    key: z.enum(["rate_limit.api_key.per_minute", "rate_limit.api_key.window_ms", "rate_limit.mcp_tenant.per_minute", "rate_limit.mcp_end_user.per_minute", "rate_limit.connect_link.per_minute", "connect_link.default_expiry_hours", "data_store.sync.default_interval_minutes", "webhooks.delivery_retention_days", "webhooks.inbound_event_retention_days", "audit_log.retention_days", "logos.fetch_delay_ms", "logos.job_retention_days"]).meta({ description: "Setting key being updated; must equal the `{key}` path parameter. The number-valued settings:\n- `rate_limit.api_key.per_minute` — Global default for tenant-scoped API keys on /v1/* routes (requests per window).\n- `rate_limit.api_key.window_ms` — Sliding-window length for the per-key rate limit (milliseconds).\n- `rate_limit.mcp_tenant.per_minute` — Tenant-mode MCP (mcp:read) budget. Defaults to parity with regular API keys — tenant-mode agents do legitimate cross-customer analytics.\n- `rate_limit.mcp_end_user.per_minute` — End-user MCP (mcp:read on eut_ tokens) budget. Keyed on end_user:<id> so two agent installs for the same customer share the budget. Tighter default — a single customer Q&A agent does not need 600/min.\n- `rate_limit.connect_link.per_minute` — Public /connect/{token} flow rate limit, keyed on client IP. Stops brute-force token guessing without throttling legitimate retries.\n- `connect_link.default_expiry_hours` — Default expiry for newly minted Connect Links when none is set on the form.\n- `data_store.sync.default_interval_minutes` — Minutes between syncs for connections on the default schedule. Each sync re-reads every resource from the platform, so a shorter interval costs platform API calls. Held to 15–43200 (30 days); 0 or less means the built-in 360.\n- `webhooks.delivery_retention_days` — Days to keep DELIVERED and DEAD outbound webhook deliveries. Their body column holds the full event JSON — customer emails and connection detail included — so unbounded retention is a data-protection liability, not just disk. Defaults to 30 days (delivery bodies are an operational log); set 0 to keep forever. Pending deliveries are never pruned; swept every ~6h by the delivery worker. Existing deployments keep whatever value they already have (seeding never overwrites).\n- `webhooks.inbound_event_retention_days` — Days to keep raw INBOUND platform webhook payloads (inbound_events) — order data and other customer PII arrives in these verbatim. 0 = keep forever (the default). Swept together with delivery retention.\n- `audit_log.retention_days` — Days of audit-log history to retain. 0 keeps everything forever. When positive, a daily background sweep deletes entries older than this many days (and records an audit.retention.prune entry when it removes any).\n- `logos.fetch_delay_ms` — Milliseconds between Brandfetch requests during a logo fetch. Brandfetch publishes 1,000 requests per 5 minutes per IP. 400ms holds the worst case (every logo found on the first attempt, which costs one request and one delay) at 150/min = 750 per 5 minutes. Lower it only if you have an agreement with Brandfetch.\n- `logos.job_retention_days` — Days of finished logo-fetch job history to keep. 0 keeps everything forever. Deleting the stored logos clears the history too, since those rows describe fetches whose output no longer exists; the audit log keeps the record either way.", example: "rate_limit.api_key.per_minute" }),
    value: z.number().meta({ description: "New value for the setting named in `key` (number).", example: 600 }),
  })
  .meta({ id: "UpdateRuntimeSettingBodyNumber", description: "Update body for the 12 number-valued runtime settings: `rate_limit.api_key.per_minute`, `rate_limit.api_key.window_ms`, `rate_limit.mcp_tenant.per_minute`, `rate_limit.mcp_end_user.per_minute`, `rate_limit.connect_link.per_minute`, `connect_link.default_expiry_hours`, `data_store.sync.default_interval_minutes`, `webhooks.delivery_retention_days`, `webhooks.inbound_event_retention_days`, `audit_log.retention_days`, `logos.fetch_delay_ms`, `logos.job_retention_days`." })

/** boolean: features.mcp_enabled, features.end_user_mode_enabled, features.test_mode_enabled, connect_link.one_time_default, auth.local_login_enabled, auth.dev_api_keys_enabled, auth.dev_oauth_enabled, auth.sandbox_self_serve_enabled, data_store.raw_payload.payments, data_store.raw_payload.accounting, data_store.sync.scheduler_enabled, data_access.mask_financial */
export const UpdateRuntimeSettingBodyBoolean = z
  .object({
    key: z.enum(["features.mcp_enabled", "features.end_user_mode_enabled", "features.test_mode_enabled", "connect_link.one_time_default", "auth.local_login_enabled", "auth.dev_api_keys_enabled", "auth.dev_oauth_enabled", "auth.sandbox_self_serve_enabled", "data_store.raw_payload.payments", "data_store.raw_payload.accounting", "data_store.sync.scheduler_enabled", "data_access.mask_financial"]).meta({ description: "Setting key being updated; must equal the `{key}` path parameter. The boolean-valued settings:\n- `features.mcp_enabled` — When false, the integration-server refuses any token carrying mcp:read (403 MCP_DISABLED). Use for emergency disable without redeploying.\n- `features.end_user_mode_enabled` — When false, /v1/me/* routes are not mounted, so they 404. Read once at boot — unlike features.mcp_enabled, a change here needs a restart. End-user mode in MCP and the admin mint UX are inert until this is true.\n- `features.test_mode_enabled` — When false, the /test/v1/* sandbox refuses every request (503 TEST_MODE_DISABLED) within one settings poll. The live /v1/* surface is untouched either way, and test-mode API keys can still be minted and revoked — they simply have nothing to call.\n- `connect_link.one_time_default` — When true, new Connect Links default to one-time read-only mode. Templates and explicit form picks always win.\n- `auth.local_login_enabled` — When false, username/password login is rejected for everyone EXCEPT the pinned break-glass admin. Only disable once an SSO provider is verified working.\n- `auth.dev_api_keys_enabled` — When false, the integration-server refuses osk_ developer keys on /v1/* with 403 API_KEYS_DISABLED. Read per request, so a flip applies without a redeploy. Refused unless an OIDC issuer is enabled, reachable by somebody, and has actually verified a token — otherwise switching this off locks every developer out. X-Admin-Secret is never gated by it.\n- `auth.dev_oauth_enabled` — When true, /v1/* also accepts an OIDC bearer token from an issuer registered under OAuth clients. Defaults off because it means nothing until an issuer exists. Read per request, like features.mcp_enabled.\n- `auth.sandbox_self_serve_enabled` — When true, POST /test/v1/keys mints a sandbox API key with NO authentication — a developer evaluating this deployment gets a test key without asking an admin. Each key belongs to a fresh throwaway tenant, works only on the no-egress /test/v1/* sandbox, expires after 7 days, and minting is IP-rate-limited. Bulk-revoke via the mode=test filter on the API keys page. Read per request.\n- `data_store.raw_payload.payments` — When true, payments resources carry the full upstream payload under \\`raw\\`. Off by default: across the payments adapters that payload declares bank account numbers, IBANs and card numbers the canonical schema does not expose (it exposes last4). Card security codes are stripped either way — PCI DSS 3.3.1 permits no exception. Turning this off does NOT clean rows already written, and turning it on does NOT backfill rows already cached — clear the cache after either change.\n- `data_store.raw_payload.accounting` — When true, accounting resources carry the full upstream payload under \\`metadata\\`. Off by default: 17 accounting adapters declare IBAN, bank account or routing numbers there, and the canonical schema has no IBAN field. Turning this off does NOT clean rows already written, and turning it on does NOT backfill rows already cached — clear the cache after either change.\n- `data_store.sync.scheduler_enabled` — When false, nothing is synced on a schedule: default and custom schedules wait, and one-time connections without a first sync wait for it. Sync now, the API and the sync right after a Connect Link still run.\n- `data_access.mask_financial` — When true, fields classified \\`financial\\` (amounts, balances, prices) are masked in the admin data viewer and its exports, filters on them are refused, and dashboard metrics that sum them are withheld. Off by default: financial values are tagged but shown to anyone with \\`data:read\\`. Personal data is masked regardless of this setting unless the reader holds \\`data:read_pii\\`.", example: "features.mcp_enabled" }),
    value: z.boolean().meta({ description: "New value for the setting named in `key` (boolean).", example: true }),
  })
  .meta({ id: "UpdateRuntimeSettingBodyBoolean", description: "Update body for the 12 boolean-valued runtime settings: `features.mcp_enabled`, `features.end_user_mode_enabled`, `features.test_mode_enabled`, `connect_link.one_time_default`, `auth.local_login_enabled`, `auth.dev_api_keys_enabled`, `auth.dev_oauth_enabled`, `auth.sandbox_self_serve_enabled`, `data_store.raw_payload.payments`, `data_store.raw_payload.accounting`, `data_store.sync.scheduler_enabled`, `data_access.mask_financial`." })

/** string: auth.break_glass_user_id, logos.brandfetch_client_id, logos.fetch_referer */
export const UpdateRuntimeSettingBodyString = z
  .object({
    key: z.enum(["auth.break_glass_user_id", "logos.brandfetch_client_id", "logos.fetch_referer"]).meta({ description: "Setting key being updated; must equal the `{key}` path parameter. The string-valued settings:\n- `auth.break_glass_user_id` — User id of the local admin that can always log in with a password, even when local login is disabled. Auto-pinned to the first-run admin when empty.\n- `logos.brandfetch_client_id` — Brandfetch client ID. Required for logos.source=cdn and to run a logo fetch. NOT a secret — Brandfetch designed it to be embedded in public <img> tags, so it is stored in plaintext. Free at https://brandfetch.com/developers.\n- `logos.fetch_referer` — Referer header sent on Brandfetch requests — they reject requests without one. Should match the origin registered for your Brandfetch app. Empty uses the project default.", example: "auth.break_glass_user_id" }),
    value: z.string().meta({ description: "New value for the setting named in `key` (string).", example: "" }),
  })
  .meta({ id: "UpdateRuntimeSettingBodyString", description: "Update body for the 3 string-valued runtime settings: `auth.break_glass_user_id`, `logos.brandfetch_client_id`, `logos.fetch_referer`." })

/** json: openapi.servers.scheme, openapi.servers.host, openapi.servers.port, openapi.servers.version */
export const UpdateRuntimeSettingBodyJson = z
  .object({
    key: z.enum(["openapi.servers.scheme", "openapi.servers.host", "openapi.servers.port", "openapi.servers.version"]).meta({ description: "Setting key being updated; must equal the `{key}` path parameter. The json-valued settings:\n- `openapi.servers.scheme` — HTTP scheme for the Swagger UI \"Servers\" dropdown. Shape: { default: string, enum: string[] }. Edit when going live: {\"default\":\"https\",\"enum\":[\"https\",\"http\"]}.\n- `openapi.servers.host` — Hostname (no port) for the Servers dropdown. Add staging / prod hostnames to the enum, e.g. {\"default\":\"oi.acme.com\",\"enum\":[\"oi.acme.com\",\"oi-staging.acme.com\"]}.\n- `openapi.servers.port` — Port (as a string — OpenAPI server variables are strings). Use \"443\" for HTTPS deployments, \"80\" for plain HTTP, \"3010\" for local.\n- `openapi.servers.version` — URL-path API version segment (appended to {scheme}://{host}:{port}/ for /v1/{vertical}/* paths only). Add \"v2\" to the enum when a versioned route ships; /auth/* and /admin/* paths are unaffected.", example: "openapi.servers.scheme" }),
    value: z.unknown().meta({ description: "New value for the setting named in `key` (json).", example: {"default":"http","enum":["http","https"]} }),
  })
  .meta({ id: "UpdateRuntimeSettingBodyJson", description: "Update body for the 4 json-valued runtime settings: `openapi.servers.scheme`, `openapi.servers.host`, `openapi.servers.port`, `openapi.servers.version`." })

/** enum: logos.source */
export const UpdateRuntimeSettingBodyLogosSource = z
  .object({
    key: z.enum(["logos.source"]).meta({ description: "Setting key being updated; must equal the `{key}` path parameter. The enum-valued settings:\n- `logos.source` — Where platform logos come from. none = brand-tinted monogram tiles, no external requests, works air-gapped (the default). cdn = hotlink Brandfetch, the mode they sanction — needs logos.brandfetch_client_id. local = serve logos this deployment has fetched. An unknown value, or cdn with no client ID, falls back to none with a warning.", example: "logos.source" }),
    value: z.enum(["none", "cdn", "local"]).meta({ description: "New value for the setting named in `key` (enum).", example: "none" }),
  })
  .meta({ id: "UpdateRuntimeSettingBodyLogosSource", description: "Update body for runtime setting `logos.source` (enum). Where platform logos come from. none = brand-tinted monogram tiles, no external requests, works air-gapped (the default). cdn = hotlink Brandfetch, the mode they sanction — needs logos.brandfetch_client_id. local = serve logos this deployment has fetched. An unknown value, or cdn with no client ID, falls back to none with a warning." })

// ── Discriminated union ─────────────────────────────────────────────
//
// `discriminatedUnion('key', […])` gives us spec-level enforcement that
// the body's `value` matches the seed's `valueType`. The route handler
// also asserts the body's `key` equals the path `:key` so the two can
// never disagree.
export const UpdateRuntimeSettingBody = z
  .discriminatedUnion('key', [
    UpdateRuntimeSettingBodyNumber,
    UpdateRuntimeSettingBodyBoolean,
    UpdateRuntimeSettingBodyString,
    UpdateRuntimeSettingBodyJson,
    UpdateRuntimeSettingBodyLogosSource,
  ])
  .meta({
    id: 'UpdateRuntimeSettingBody',
    description:
      'PATCH body for /api/runtime-settings/{key}. Discriminated on `key`, one branch per value shape, so the `value` field is typed as number / boolean / string / a closed vocabulary / unknown for JSON.',
    override: ({ jsonSchema }) => {
      jsonSchema.discriminator = {
        propertyName: 'key',
        mapping: {
          "rate_limit.api_key.per_minute": "#/components/schemas/UpdateRuntimeSettingBodyNumber",
          "rate_limit.api_key.window_ms": "#/components/schemas/UpdateRuntimeSettingBodyNumber",
          "rate_limit.mcp_tenant.per_minute": "#/components/schemas/UpdateRuntimeSettingBodyNumber",
          "rate_limit.mcp_end_user.per_minute": "#/components/schemas/UpdateRuntimeSettingBodyNumber",
          "rate_limit.connect_link.per_minute": "#/components/schemas/UpdateRuntimeSettingBodyNumber",
          "connect_link.default_expiry_hours": "#/components/schemas/UpdateRuntimeSettingBodyNumber",
          "data_store.sync.default_interval_minutes": "#/components/schemas/UpdateRuntimeSettingBodyNumber",
          "webhooks.delivery_retention_days": "#/components/schemas/UpdateRuntimeSettingBodyNumber",
          "webhooks.inbound_event_retention_days": "#/components/schemas/UpdateRuntimeSettingBodyNumber",
          "audit_log.retention_days": "#/components/schemas/UpdateRuntimeSettingBodyNumber",
          "logos.fetch_delay_ms": "#/components/schemas/UpdateRuntimeSettingBodyNumber",
          "logos.job_retention_days": "#/components/schemas/UpdateRuntimeSettingBodyNumber",
          "features.mcp_enabled": "#/components/schemas/UpdateRuntimeSettingBodyBoolean",
          "features.end_user_mode_enabled": "#/components/schemas/UpdateRuntimeSettingBodyBoolean",
          "features.test_mode_enabled": "#/components/schemas/UpdateRuntimeSettingBodyBoolean",
          "connect_link.one_time_default": "#/components/schemas/UpdateRuntimeSettingBodyBoolean",
          "auth.local_login_enabled": "#/components/schemas/UpdateRuntimeSettingBodyBoolean",
          "auth.dev_api_keys_enabled": "#/components/schemas/UpdateRuntimeSettingBodyBoolean",
          "auth.dev_oauth_enabled": "#/components/schemas/UpdateRuntimeSettingBodyBoolean",
          "auth.sandbox_self_serve_enabled": "#/components/schemas/UpdateRuntimeSettingBodyBoolean",
          "data_store.raw_payload.payments": "#/components/schemas/UpdateRuntimeSettingBodyBoolean",
          "data_store.raw_payload.accounting": "#/components/schemas/UpdateRuntimeSettingBodyBoolean",
          "data_store.sync.scheduler_enabled": "#/components/schemas/UpdateRuntimeSettingBodyBoolean",
          "data_access.mask_financial": "#/components/schemas/UpdateRuntimeSettingBodyBoolean",
          "auth.break_glass_user_id": "#/components/schemas/UpdateRuntimeSettingBodyString",
          "logos.brandfetch_client_id": "#/components/schemas/UpdateRuntimeSettingBodyString",
          "logos.fetch_referer": "#/components/schemas/UpdateRuntimeSettingBodyString",
          "openapi.servers.scheme": "#/components/schemas/UpdateRuntimeSettingBodyJson",
          "openapi.servers.host": "#/components/schemas/UpdateRuntimeSettingBodyJson",
          "openapi.servers.port": "#/components/schemas/UpdateRuntimeSettingBodyJson",
          "openapi.servers.version": "#/components/schemas/UpdateRuntimeSettingBodyJson",
          "logos.source": "#/components/schemas/UpdateRuntimeSettingBodyLogosSource",
        },
      }
    },
  })

/**
 * The branches and the keys each covers — exposed for the unit test that
 * pins the generator output to RUNTIME_SETTINGS_SEEDS: every key in
 * exactly one branch, in inventory order.
 */
export const UPDATE_RUNTIME_SETTING_BRANCHES = [
  { id: "UpdateRuntimeSettingBodyNumber", shape: "number", keys: ["rate_limit.api_key.per_minute", "rate_limit.api_key.window_ms", "rate_limit.mcp_tenant.per_minute", "rate_limit.mcp_end_user.per_minute", "rate_limit.connect_link.per_minute", "connect_link.default_expiry_hours", "data_store.sync.default_interval_minutes", "webhooks.delivery_retention_days", "webhooks.inbound_event_retention_days", "audit_log.retention_days", "logos.fetch_delay_ms", "logos.job_retention_days"] },
  { id: "UpdateRuntimeSettingBodyBoolean", shape: "boolean", keys: ["features.mcp_enabled", "features.end_user_mode_enabled", "features.test_mode_enabled", "connect_link.one_time_default", "auth.local_login_enabled", "auth.dev_api_keys_enabled", "auth.dev_oauth_enabled", "auth.sandbox_self_serve_enabled", "data_store.raw_payload.payments", "data_store.raw_payload.accounting", "data_store.sync.scheduler_enabled", "data_access.mask_financial"] },
  { id: "UpdateRuntimeSettingBodyString", shape: "string", keys: ["auth.break_glass_user_id", "logos.brandfetch_client_id", "logos.fetch_referer"] },
  { id: "UpdateRuntimeSettingBodyJson", shape: "json", keys: ["openapi.servers.scheme", "openapi.servers.host", "openapi.servers.port", "openapi.servers.version"] },
  { id: "UpdateRuntimeSettingBodyLogosSource", shape: "enum", keys: ["logos.source"] },
] as const

export const UPDATE_RUNTIME_SETTING_BRANCH_COUNT = 5
