/**
 * RuntimeSettingsStore — admin-side persistence for tunables that can
 * be overridden without a redeploy.
 *
 * Pattern:
 *   .env (bootstrap defaults) → admin DB overrides → services cache the
 *   merged view on a short TTL → admin UI lists / edits / resets.
 *
 * Highest-level admins only. The `runtime_settings` table is declared
 * in admin-store.ts; this module owns the read/write API.
 *
 * What stays in .env permanently (NOT exposed here):
 *   - cryptographic secrets (STORE_SECRET, JWT_SECRET, SESSION_SECRET, ADMIN_SECRET)
 *   - service topology (STORE_PATH, INTEGRATION_SERVER_URL, port numbers)
 *   - boot-time mode (DATA_STORE_MODE itself — its tunables ARE here)
 *
 * The full inventory of tunables is `RUNTIME_SETTINGS_SEEDS` below —
 * the seed is the single source of truth for keys, defaults, and the
 * descriptions the admin UI shows.
 *
 * Backend: this is a BORROWER of the shared `DbHandle`. The
 * `runtime_settings` table (and its migration namespace) belong to
 * AdminStore; `create()` only re-runs the idempotent seed. It must NOT
 * close the handle — AdminStore (the owner) does — so there is no
 * `close()` method here.
 */
import type { DbHandle } from '@opensteward/shared'

export type RuntimeSettingType = 'number' | 'boolean' | 'string' | 'json'

export interface RuntimeSettingRow {
  key: string
  value: unknown
  valueType: RuntimeSettingType
  defaultValue: unknown
  description: string
  category: string
  updatedAt: number
  updatedBy: string | null
  /** True when the persisted value still matches the default. */
  isDefault: boolean
  /**
   * Allowed values for a string setting, or null when it is free-form. Comes
   * from the seed inventory rather than a column — the enum is a property of
   * the code, so adding one needs no migration.
   */
  enumValues: string[] | null
  /**
   * Shown as a confirmation before the operator saves. Same code-only
   * mechanism as `enumValues` — no column, no migration.
   */
  warning: string | null
  /**
   * Which direction of a boolean flip the warning guards. `enable` (the
   * default) confirms switching to true; `disable` confirms switching to
   * false — for kill switches, where OFF is the consequential move.
   */
  warnOn: 'enable' | 'disable' | null
}

export interface RuntimeSettingSeed {
  key: string
  defaultValue: unknown
  valueType: RuntimeSettingType
  description: string
  category: string
  /**
   * Closed set of legal values. Meaningful only for `valueType: 'string'`.
   *
   * Worth declaring for anything with a fixed vocabulary: without it the
   * generated PATCH schema is a bare `z.string()`, so a typo like "cnd" is
   * accepted and persisted, every consumer silently falls back to its default,
   * and the only evidence is a warning line in a container log.
   */
  enumValues?: readonly string[]
  /**
   * Confirmation text shown before saving, for settings whose consequence is
   * not obvious from the label. Rendered via a `data-` attribute, never
   * interpolated into an inline handler — see the admin view lint.
   */
  warning?: string
  /** See RuntimeSettingRow.warnOn. Defaults to 'enable'. */
  warnOn?: 'enable' | 'disable'
}

/** Raw row shape selected from `runtime_settings`. */
interface RuntimeSettingDbRow {
  key: string
  value: string
  value_type: RuntimeSettingType
  default_value: string
  description: string
  category: string
  updated_at: number
  updated_by: string | null
}

/**
 * Canonical inventory. Each entry seeds a row on first boot; existing
 * rows are not overwritten so admin edits survive deployment.
 *
 * Categories aim to map to admin UI tabs at /settings.
 */
export const RUNTIME_SETTINGS_SEEDS: RuntimeSettingSeed[] = [
  // Rate limits
  {
    key: 'rate_limit.api_key.per_minute',
    defaultValue: 600,
    valueType: 'number',
    description: 'Global default for tenant-scoped API keys on /v1/* routes (requests per window).',
    category: 'rate_limits',
  },
  {
    key: 'rate_limit.api_key.window_ms',
    defaultValue: 60_000,
    valueType: 'number',
    description: 'Sliding-window length for the per-key rate limit (milliseconds).',
    category: 'rate_limits',
  },
  {
    key: 'rate_limit.mcp_tenant.per_minute',
    defaultValue: 600,
    valueType: 'number',
    description:
      'Tenant-mode MCP (mcp:read) budget. Defaults to parity with regular API keys ' +
      '— tenant-mode agents do legitimate cross-customer analytics.',
    category: 'rate_limits',
  },
  {
    key: 'rate_limit.mcp_end_user.per_minute',
    defaultValue: 60,
    valueType: 'number',
    description:
      'End-user MCP (mcp:read on eut_ tokens) budget. Keyed on end_user:<id> so two ' +
      'agent installs for the same customer share the budget. Tighter default — ' +
      'a single customer Q&A agent does not need 600/min.',
    category: 'rate_limits',
  },
  {
    key: 'rate_limit.connect_link.per_minute',
    defaultValue: 30,
    valueType: 'number',
    description:
      'Public /connect/{token} flow rate limit, keyed on client IP. Stops brute-force ' +
      'token guessing without throttling legitimate retries.',
    category: 'rate_limits',
  },
  // Features (kill-switches without redeploy)
  {
    key: 'features.mcp_enabled',
    defaultValue: true,
    valueType: 'boolean',
    description:
      'When false, the integration-server refuses any token carrying mcp:read ' +
      '(403 MCP_DISABLED). Use for emergency disable without redeploying.',
    category: 'features',
    warning:
      'This is the AI-agent kill switch. Turning it off refuses every MCP request ' +
      'across all tenants within one settings poll — every attached agent goes dark ' +
      'at once. Turn it back on the same way.',
    warnOn: 'disable',
  },
  {
    key: 'features.end_user_mode_enabled',
    defaultValue: true,
    valueType: 'boolean',
    description:
      'When false, /v1/me/* routes are not mounted, so they 404. Read once at ' +
      'boot — unlike features.mcp_enabled, a change here needs a restart. ' +
      'End-user mode in MCP and the admin mint UX are inert until this is true.',
    category: 'features',
  },
  {
    key: 'features.test_mode_enabled',
    defaultValue: true,
    valueType: 'boolean',
    description:
      'When false, the /test/v1/* sandbox refuses every request (503 ' +
      'TEST_MODE_DISABLED) within one settings poll. The live /v1/* surface is ' +
      'untouched either way, and test-mode API keys can still be minted and ' +
      'revoked — they simply have nothing to call.',
    category: 'features',
    warning:
      'This turns the whole developer sandbox off. Every /test/v1/* request answers ' +
      '503 within one settings poll — anyone mid-evaluation is cut off. The live ' +
      '/v1/* surface is unaffected.',
    warnOn: 'disable',
  },
  // Connect links
  {
    key: 'connect_link.default_expiry_hours',
    defaultValue: 72,
    valueType: 'number',
    description: 'Default expiry for newly minted Connect Links when none is set on the form.',
    category: 'connect_links',
  },
  {
    key: 'connect_link.one_time_default',
    defaultValue: false,
    valueType: 'boolean',
    description:
      'When true, new Connect Links default to one-time read-only mode. Templates ' +
      'and explicit form picks always win.',
    category: 'connect_links',
  },
  // Auth / SSO
  {
    key: 'auth.local_login_enabled',
    defaultValue: true,
    valueType: 'boolean',
    description:
      'When false, username/password login is rejected for everyone EXCEPT the ' +
      'pinned break-glass admin. Only disable once an SSO provider is verified working.',
    category: 'auth',
    warning:
      'Turning local login off means the only way into this console is your identity ' +
      'provider. The break-glass admin keeps password access as a floor, but check ' +
      'that pin (Settings → auth.break_glass_user_id) names a real, password-usable ' +
      'account BEFORE saving — a stale pin here is a lockout.',
    warnOn: 'disable',
  },
  {
    key: 'auth.break_glass_user_id',
    defaultValue: '',
    valueType: 'string',
    description:
      'User id of the local admin that can always log in with a password, even when ' +
      'local login is disabled. Auto-pinned to the first-run admin when empty.',
    category: 'auth',
  },
  {
    key: 'auth.dev_api_keys_enabled',
    defaultValue: true,
    valueType: 'boolean',
    description:
      'When false, the integration-server refuses osk_ developer keys on /v1/* with ' +
      '403 API_KEYS_DISABLED. Read per request, so a flip applies without a redeploy. ' +
      'Refused unless an OIDC issuer is enabled, reachable by somebody, and has ' +
      'actually verified a token — otherwise switching this off locks every ' +
      'developer out. X-Admin-Secret is never gated by it.',
    category: 'auth',
    warning:
      'Turning API keys off makes every osk_ key answer 403 API_KEYS_DISABLED — all ' +
      'integrations still using keys stop at the next request. The server refuses ' +
      'the change unless OIDC bearer auth is proven working, but make sure your ' +
      'developers have actually switched.',
    warnOn: 'disable',
  },
  {
    key: 'auth.dev_oauth_enabled',
    defaultValue: false,
    valueType: 'boolean',
    description:
      'When true, /v1/* also accepts an OIDC bearer token from an issuer registered ' +
      'under OAuth clients. Defaults off because it means nothing until an issuer ' +
      'exists. Read per request, like features.mcp_enabled.',
    category: 'auth',
  },
  {
    key: 'auth.sandbox_self_serve_enabled',
    defaultValue: false,
    valueType: 'boolean',
    description:
      'When true, POST /test/v1/keys mints a sandbox API key with NO authentication — ' +
      'a developer evaluating this deployment gets a test key without asking an admin. ' +
      'Each key belongs to a fresh throwaway tenant, works only on the no-egress ' +
      '/test/v1/* sandbox, expires after 7 days, and minting is IP-rate-limited. ' +
      'Bulk-revoke via the mode=test filter on the API keys page. Read per request.',
    category: 'auth',
    warning:
      'This opens an unauthenticated endpoint that mints sandbox API keys. The keys ' +
      'reach only synthetic /test/v1 data and expire after 7 days, but anyone who can ' +
      'reach the deployment can create them. Enable only if this deployment is meant ' +
      'to onboard outside developers self-serve.',
  },
  // Data store — upstream payload retention, per vertical
  {
    key: 'data_store.raw_payload.payments',
    defaultValue: false,
    valueType: 'boolean',
    description:
      'When true, payments resources carry the full upstream payload under `raw`. ' +
      'Off by default: across the payments adapters that payload declares bank ' +
      'account numbers, IBANs and card numbers the canonical schema does not expose ' +
      '(it exposes last4). Card security codes are stripped either way — PCI DSS ' +
      '3.3.1 permits no exception. Turning this off does NOT clean rows already ' +
      'written, and turning it on does NOT backfill rows already cached — clear ' +
      'the cache after either change.',
    category: 'data_store',
    warning:
      'Stores and returns the complete unmodified upstream payload for this vertical. It can contain bank details and payment fields the canonical schema does not carry. Enable only if your compliance programme covers it.',
  },
  {
    key: 'data_store.raw_payload.accounting',
    defaultValue: false,
    valueType: 'boolean',
    description:
      'When true, accounting resources carry the full upstream payload under ' +
      '`metadata`. Off by default: 17 accounting adapters declare IBAN, bank ' +
      'account or routing numbers there, and the canonical schema has no IBAN ' +
      'field. Turning this off does NOT clean rows already written, and turning it ' +
      'on does NOT backfill rows already cached — clear the cache after either ' +
      'change.',
    category: 'data_store',
    warning:
      'Stores and returns the complete unmodified upstream payload for this vertical. It can contain bank details and payment fields the canonical schema does not carry. Enable only if your compliance programme covers it.',
  },
  // Data store — sync schedules (integration-server's SyncScheduler reads both every tick)
  {
    key: 'data_store.sync.default_interval_minutes',
    defaultValue: 360,
    valueType: 'number',
    description:
      'Minutes between syncs for connections on the default schedule. Each sync re-reads ' +
      'every resource from the platform, so a shorter interval costs platform API calls. ' +
      'Held to 15–43200 (30 days); 0 or less means the built-in 360.',
    category: 'data_store',
  },
  {
    key: 'data_store.sync.scheduler_enabled',
    defaultValue: true,
    valueType: 'boolean',
    description:
      'When false, nothing is synced on a schedule: default and custom schedules wait, and ' +
      'one-time connections without a first sync wait for it. Sync now, the API and the sync ' +
      'right after a Connect Link still run.',
    category: 'data_store',
    warning:
      'Scheduled syncs stop for every connection within one settings poll. Dashboards and ' +
      'cached reads keep serving the data already synced, which then ages.',
    warnOn: 'disable',
  },
  // Data access — the admin data viewer, exports and dashboards
  {
    key: 'data_access.mask_financial',
    defaultValue: false,
    valueType: 'boolean',
    description:
      'When true, fields classified `financial` (amounts, balances, prices) are masked in ' +
      'the admin data viewer and its exports, filters on them are refused, and dashboard ' +
      'metrics that sum them are withheld. Off by default: financial values are tagged ' +
      'but shown to anyone with `data:read`. Personal data is masked regardless of this ' +
      'setting unless the reader holds `data:read_pii`.',
    category: 'data_access',
  },
  // Audit log
  // Webhooks — retention for the two payload stores that otherwise grow forever
  {
    key: 'webhooks.delivery_retention_days',
    defaultValue: 30,
    valueType: 'number',
    description:
      'Days to keep DELIVERED and DEAD outbound webhook deliveries. Their body column ' +
      'holds the full event JSON — customer emails and connection detail included — so ' +
      'unbounded retention is a data-protection liability, not just disk. Defaults to 30 ' +
      'days (delivery bodies are an operational log); set 0 to keep forever. Pending ' +
      'deliveries are never pruned; swept every ~6h by the delivery worker. Existing ' +
      'deployments keep whatever value they already have (seeding never overwrites).',
    category: 'webhooks',
  },
  {
    key: 'webhooks.inbound_event_retention_days',
    defaultValue: 0,
    valueType: 'number',
    description:
      'Days to keep raw INBOUND platform webhook payloads (inbound_events) — order data ' +
      'and other customer PII arrives in these verbatim. 0 = keep forever (the ' +
      'default). Swept together with delivery retention.',
    category: 'webhooks',
  },
  {
    key: 'audit_log.retention_days',
    defaultValue: 0,
    valueType: 'number',
    description:
      'Days of audit-log history to retain. 0 keeps everything forever. When ' +
      'positive, a daily background sweep deletes entries older than this many ' +
      'days (and records an audit.retention.prune entry when it removes any).',
    category: 'audit',
  },
  // OpenAPI servers — operator-tunable Swagger UI dropdown. Shape per row:
  // { default: string, enum: string[] }. The integration-server merges these
  // over config.yml over compiled defaults; the docs-server picks the
  // merged result up within 60 s and refreshes /unified-api. See
  // docs/dev-api.md "Server variables".
  {
    key: 'openapi.servers.scheme',
    defaultValue: { default: 'http', enum: ['http', 'https'] },
    valueType: 'json',
    description:
      'HTTP scheme for the Swagger UI "Servers" dropdown. Shape: ' +
      '{ default: string, enum: string[] }. Edit when going live: ' +
      '{"default":"https","enum":["https","http"]}.',
    category: 'openapi',
  },
  {
    key: 'openapi.servers.host',
    defaultValue: { default: 'localhost', enum: ['localhost'] },
    valueType: 'json',
    description:
      'Hostname (no port) for the Servers dropdown. Add staging / prod ' +
      'hostnames to the enum, e.g. {"default":"oi.acme.com","enum":' +
      '["oi.acme.com","oi-staging.acme.com"]}.',
    category: 'openapi',
  },
  {
    key: 'openapi.servers.port',
    defaultValue: { default: '3010', enum: ['3010'] },
    valueType: 'json',
    description:
      'Port (as a string — OpenAPI server variables are strings). Use ' +
      '"443" for HTTPS deployments, "80" for plain HTTP, "3010" for local.',
    category: 'openapi',
  },
  {
    key: 'openapi.servers.version',
    defaultValue: { default: 'v1', enum: ['v1'] },
    valueType: 'json',
    description:
      'URL-path API version segment (appended to {scheme}://{host}:{port}/ ' +
      'for /v1/{vertical}/* paths only). Add "v2" to the enum when a ' +
      'versioned route ships; /auth/* and /admin/* paths are unaffected.',
    category: 'openapi',
  },
  // Platform logos — the admin-UI equivalent of the LOGO_SOURCE /
  // BRANDFETCH_CLIENT_ID environment variables. OpenSteward ships no logos
  // (Brandfetch's terms plus 1,545 other companies' trademarks), so the
  // operator opts in. The env vars stay the bootstrap default and the fallback
  // whenever a row here is still empty. See docs/operations/platform-logos.md.
  {
    key: 'logos.source',
    defaultValue: 'none',
    valueType: 'string',
    enumValues: ['none', 'cdn', 'local'],
    description:
      'Where platform logos come from. none = brand-tinted monogram tiles, no ' +
      'external requests, works air-gapped (the default). cdn = hotlink ' +
      'Brandfetch, the mode they sanction — needs logos.brandfetch_client_id. ' +
      'local = serve logos this deployment has fetched. An unknown value, or ' +
      'cdn with no client ID, falls back to none with a warning.',
    category: 'logos',
  },
  {
    key: 'logos.brandfetch_client_id',
    defaultValue: '',
    valueType: 'string',
    description:
      'Brandfetch client ID. Required for logos.source=cdn and to run a logo ' +
      'fetch. NOT a secret — Brandfetch designed it to be embedded in public ' +
      '<img> tags, so it is stored in plaintext. Free at ' +
      'https://brandfetch.com/developers.',
    category: 'logos',
  },
  {
    key: 'logos.fetch_delay_ms',
    defaultValue: 400,
    valueType: 'number',
    description:
      'Milliseconds between Brandfetch requests during a logo fetch. ' +
      'Brandfetch publishes 1,000 requests per 5 minutes per IP. 400ms holds ' +
      'the worst case (every logo found on the first attempt, which costs one ' +
      'request and one delay) at 150/min = 750 per 5 minutes. Lower it only ' +
      'if you have an agreement with Brandfetch.',
    category: 'logos',
  },
  {
    key: 'logos.job_retention_days',
    defaultValue: 30,
    valueType: 'number',
    description:
      'Days of finished logo-fetch job history to keep. 0 keeps everything ' +
      'forever. Deleting the stored logos clears the history too, since those ' +
      'rows describe fetches whose output no longer exists; the audit log ' +
      'keeps the record either way.',
    category: 'logos',
  },
  {
    key: 'logos.fetch_referer',
    defaultValue: '',
    valueType: 'string',
    description:
      'Referer header sent on Brandfetch requests — they reject requests ' +
      'without one. Should match the origin registered for your Brandfetch ' +
      'app. Empty uses the project default.',
    category: 'logos',
  },
]

/** Seed lookup for properties that live in code rather than in the table. */
const SEED_BY_KEY = new Map<string, RuntimeSettingSeed>(
  RUNTIME_SETTINGS_SEEDS.map((seed) => [seed.key, seed]),
)

export class RuntimeSettingsStore {
  private constructor(private readonly handle: DbHandle) {}

  /**
   * Borrows an already-migrated `DbHandle` (the `runtime_settings` table and
   * its migration namespace belong to AdminStore) and re-runs the idempotent
   * seed. Constructed once at boot and injected; the seed's
   * `ON CONFLICT (key) DO NOTHING` makes repeat construction harmless.
   */
  static async create(handle: DbHandle): Promise<RuntimeSettingsStore> {
    const store = new RuntimeSettingsStore(handle)
    await store.seed()
    return store
  }

  private async seed(): Promise<void> {
    const now = Date.now()
    for (const seed of RUNTIME_SETTINGS_SEEDS) {
      const serialized = JSON.stringify(seed.defaultValue)
      await this.handle.kysely
        .insertInto('runtime_settings')
        .values({
          key: seed.key,
          value: serialized,
          value_type: seed.valueType,
          default_value: serialized,
          description: seed.description,
          category: seed.category,
          updated_at: now,
          updated_by: null,
        })
        .onConflict((oc) => oc.column('key').doNothing())
        .execute()
    }
  }

  async list(): Promise<RuntimeSettingRow[]> {
    const rows = (await this.handle.kysely
      .selectFrom('runtime_settings')
      .select([
        'key',
        'value',
        'value_type',
        'default_value',
        'description',
        'category',
        'updated_at',
        'updated_by',
      ])
      .orderBy('category')
      .orderBy('key')
      .execute()) as RuntimeSettingDbRow[]
    return rows.map((r) => this.hydrate(r))
  }

  async get(key: string): Promise<RuntimeSettingRow | null> {
    const row = (await this.handle.kysely
      .selectFrom('runtime_settings')
      .select([
        'key',
        'value',
        'value_type',
        'default_value',
        'description',
        'category',
        'updated_at',
        'updated_by',
      ])
      .where('key', '=', key)
      .executeTakeFirst()) as RuntimeSettingDbRow | undefined
    if (!row) return null
    return this.hydrate(row)
  }

  /**
   * Set a value. `value` is the typed JS value (number/boolean/string/object);
   * it gets JSON-serialised for storage. Throws if the key is unknown or the
   * type doesn't match the seed.
   */
  async set(key: string, value: unknown, updatedBy: string | null): Promise<RuntimeSettingRow> {
    const existing = await this.get(key)
    if (!existing) throw new Error(`Unknown runtime setting: ${key}`)
    if (!this.valueMatchesType(value, existing.valueType)) {
      throw new Error(`Setting ${key} expects ${existing.valueType}; got ${typeof value}.`)
    }
    // Defence in depth. The generated PATCH body schema already rejects an
    // out-of-range value at the spec boundary, but this store is also reachable
    // from callers that never go through that route.
    const seed = SEED_BY_KEY.get(key)
    if (seed?.enumValues && !seed.enumValues.includes(value as string)) {
      throw new Error(`Setting ${key} must be one of: ${seed.enumValues.join(', ')}.`)
    }
    const now = Date.now()
    await this.handle.kysely
      .updateTable('runtime_settings')
      .set({ value: JSON.stringify(value), updated_at: now, updated_by: updatedBy })
      .where('key', '=', key)
      .execute()
    return (await this.get(key))!
  }

  /** Reset to the seeded default. Returns the post-reset row. */
  async reset(key: string, updatedBy: string | null): Promise<RuntimeSettingRow> {
    const existing = await this.get(key)
    if (!existing) throw new Error(`Unknown runtime setting: ${key}`)
    const now = Date.now()
    await this.handle.kysely
      .updateTable('runtime_settings')
      .set((eb) => ({ value: eb.ref('default_value'), updated_at: now, updated_by: updatedBy }))
      .where('key', '=', key)
      .execute()
    return (await this.get(key))!
  }

  private hydrate(row: RuntimeSettingDbRow): RuntimeSettingRow {
    return {
      key: row.key,
      value: JSON.parse(row.value),
      valueType: row.value_type,
      defaultValue: JSON.parse(row.default_value),
      description: row.description,
      category: row.category,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
      isDefault: row.value === row.default_value,
      enumValues: SEED_BY_KEY.get(row.key)?.enumValues?.slice() ?? null,
      warning: SEED_BY_KEY.get(row.key)?.warning ?? null,
      warnOn: SEED_BY_KEY.get(row.key)?.warning
        ? (SEED_BY_KEY.get(row.key)?.warnOn ?? 'enable')
        : null,
    }
  }

  private valueMatchesType(value: unknown, type: RuntimeSettingType): boolean {
    switch (type) {
      case 'number':
        return typeof value === 'number' && Number.isFinite(value)
      case 'boolean':
        return typeof value === 'boolean'
      case 'string':
        return typeof value === 'string'
      case 'json':
        // any JSON-serialisable value is fine for the 'json' bucket
        return value !== undefined
    }
  }
}
