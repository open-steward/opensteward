import { randomUUID } from 'crypto'
import {
  BUILTIN_ROLE_PERMISSIONS,
  isBuiltinRole,
  normalizePermissions,
  type BuiltinRole,
  type CompanyInfo,
  type CompanyInfoRecord,
  type DbHandle,
  type DualMigration,
  type Permission,
} from '@opensteward/shared'
import type { AuditAction, AuditDetailFor, WriteAuditInput } from './audit-actions'
import { invalidateAccess } from '../auth/access'

/** Thrown when a write would restrict an admin to some tenants. */
export class AdminScopeError extends Error {
  constructor() {
    super('Admins always have every tenant. Give this user a non-admin role before restricting them.')
    this.name = 'AdminScopeError'
  }
}

/** The transaction handle `DbHandle.transaction` passes to its callback. */
type ScopeTx = Parameters<Parameters<DbHandle['transaction']>[0]>[0]

export interface UserRow {
  id: string
  username: string
  password_hash: string
  /** The BASE role — always a built-in. For a user on a custom role this is
   *  that role's `base_role`, so `operatorOnly`/`adminOnly`, the JWT claim and
   *  the admin UI's role checks keep working unchanged. */
  role: 'admin' | 'operator' | 'viewer'
  /** Custom role (`roles.id`), or NULL when the user holds the built-in
   *  `role` directly. Added in admin_store v3. */
  role_id?: string | null
  /** `all` (every tenant — the pre-v3 behaviour) or `restricted` to the
   *  tenants in `user_scopes`. */
  scope_mode?: UserScopeMode
  /** Who owns the scope: `manual` (an admin set it) or `idp` (re-derived from
   *  IdP scope rules on every SSO login / SCIM change). */
  scope_source?: UserScopeSource
  /** Optional email address (admin_store v7). PII — never audit or log it. */
  email?: string | null
  /** Who owns `email`: `manual` (an admin set it; SSO never overwrites it) or
   *  `idp` (refreshed from the identity provider). NULL with no email. */
  email_source?: UserEmailSource | null
  created_at: number
  updated_at: number
}

export type UserScopeMode = 'all' | 'restricted'
export type UserScopeSource = 'manual' | 'idp'
export type UserEmailSource = 'manual' | 'idp'

/** One tenant a restricted user may see; `verticals: '*'` means every vertical. */
export interface ScopeGrant {
  tenantId: string
  verticals: '*' | string[]
}

export interface UserScope {
  mode: UserScopeMode
  source: UserScopeSource
  /** Empty when `mode` is `all`. A restricted user with no grants sees nothing. */
  grants: ScopeGrant[]
}

/** A role — one of the three built-ins or an operator-defined custom role. */
export interface RoleRecord {
  id: string
  name: string
  description: string | null
  /** The built-in role a holder is treated as by role-level gates. */
  baseRole: BuiltinRole
  /** Effective permissions. For built-ins this comes from code, not the row. */
  permissions: Permission[]
  isBuiltin: boolean
  createdAt: number
  updatedAt: number
  updatedBy: string | null
}

export interface AuditEntry {
  id: number
  user_id: string
  action: string
  vertical: string | null
  target_id: string | null
  detail: string | null
  created_at: number
}

/** Optional server-side filter for audit-log reads / exports. All clauses
 *  combine with AND; `from`/`to` are inclusive epoch-ms bounds. */
export interface AuditFilter {
  action?: string
  userId?: string
  /** Exact match on `target_id` — every event that touched one object. */
  targetId?: string
  /** Case-insensitive SUBSTRING match on the vertical the action touched. */
  vertical?: string
  from?: number
  to?: number
}

/**
 * UI sort key -> physical `audit_log` column.
 *
 * A caller-supplied key must never reach Kysely's `orderBy`. `DbSchema` is
 * `Record<string, any>`, so TypeScript catches nothing here, and Kysely quotes
 * identifiers, so this is not an injection vector — it is a 500 vector.
 * Kysely 0.29.4 still parses the deprecated `'col dir'` string form, so
 * `?sort=created_at desc` throws `Cannot specify direction twice!`, and
 * `?sort=__proto__` throws `no such column`. Both are unhandled 500s.
 *
 * `user` maps to `user_id`, the physical column — NOT the username the cell
 * renders. `username` is not a column at all: it is resolved per page by
 * `usernamesByIds` after the slice, so it cannot be ordered in SQL. The two
 * can disagree (a deleted operator renders as a raw id), and the cell says so
 * on hover.
 */
export const AUDIT_SORT_COLUMNS = {
  time: 'created_at',
  user: 'user_id',
  action: 'action',
  vertical: 'vertical',
  target: 'target_id',
} as const

export type AuditSortKey = keyof typeof AUDIT_SORT_COLUMNS
/** Own-keys-only membership test. `'constructor' in AUDIT_SORT_COLUMNS` is
 *  `true` and would put `Object.prototype.constructor` into an `orderBy`. */
const AUDIT_SORT_KEYS = new Set(Object.keys(AUDIT_SORT_COLUMNS))
export function isAuditSortKey(v: string | undefined): v is AuditSortKey {
  return v !== undefined && AUDIT_SORT_KEYS.has(v)
}

export interface NotificationRow {
  id: number
  type: string
  vertical: string | null
  connection_id: string | null
  platform: string | null
  message: string
  acknowledged: number
  created_at: number
}

/**
 * A cleared dashboard task. Rows live in the v1 `settings` table (no
 * migration) under the key `dashboard.dismissed:<taskKey>` with the JSON
 * value `{"fp":"<fingerprint>","by":"<userId>","at":<epoch ms>}`. The method
 * names are table-agnostic so a later move to a dedicated `task_dismissals`
 * table is a data copy, not an API change.
 *
 * A task stays hidden only while the row's fingerprint equals the one the
 * dashboard derives from live data; a changed fingerprint (a new expiry after
 * re-auth, a fresh rejection, a new job id) re-surfaces the task.
 *
 * Fingerprint format — both admin-api (`HealthPoller`) and the admin UI derive
 * it, so they MUST agree. Timestamps are normalised with
 * `dashboardTaskFingerprint()` to strict ISO 8601 (`toISOString()`), whether
 * the source is epoch-millis or an ISO string; a missing value is `''`.
 * Every input is a value that moves only when the condition itself changes —
 * never `updatedAt` (a label rename rewrites it) and never `lastRefreshAt`
 * (every retry of the same bad secret rewrites it).
 *
 *   conn:expired:<connectionId>   → connection.expiresAt ?? connection.createdAt
 *   platform:creds:<vertical>/<p> → newest (expiresAt ?? createdAt) across the
 *                                   affected connections of that platform. A
 *                                   token expiry only moves when a refresh
 *                                   SUCCEEDED, so it is stable while the same
 *                                   rejected secret is retried and changes
 *                                   once the platform was fixed and rejected
 *                                   again (or a new connection joined the set).
 *   sync:failed:<jobId>           → '' (the job id already identifies the run)
 *   refresh:failing:<connectionId> → connection.expiresAt ?? connection.createdAt,
 *                                   as for conn:expired. The row is an early
 *                                   warning (still valid, last refresh
 *                                   failed); the keep-alive worker retries
 *                                   every tick and stamps lastRefreshAt on
 *                                   each failure, so a clear keyed on the
 *                                   attempt would last one tick. The expiry
 *                                   moves only when a refresh succeeds, i.e.
 *                                   when the condition resolves, so a later
 *                                   recurrence re-surfaces the row
 *   wizard:<step>                 → the step slug again (the key already re-keys
 *                                   on change; the dashboard sends the slug so a
 *                                   row is never matched on an empty string)
 *
 * Not a key at all: `vertical:down:<vertical>`. The dashboard renders a row
 * for a vertical that is down, but nobody clears it, so the regex below
 * refuses it.
 *
 * Who may clear what: `conn:expired`, `sync:failed` and `refresh:failing`
 * need the operator role, `platform:creds` (fixing it is admin-only) and
 * `wizard` (the setup-resume card is admin-only) need the admin role — see
 * `minRoleForDashboardTask`.
 *
 * Retention: `pruneDashboardDismissals` drops rows older than 90 days whose
 * condition is no longer live (the poller passes the keys it can still see),
 * so a clear on an unchanged condition is kept, not silently expired.
 * `wizard:*` skips are never pruned. `sync:failed:*` and `refresh:failing:*`
 * rows are age-only — the poller reads neither sync jobs nor refresh state —
 * so a failed job that is still the newest for its connection, or a refresh
 * still failing on the same token, after 90 days does re-surface.
 */
export interface DashboardDismissal {
  key: string
  fingerprint: string
  /** User id that cleared the task. */
  by: string
  /** When it was cleared (epoch ms). */
  createdAt: number
}

/** Task keys the dismissal routes accept. The `wizard` prefix is reserved for
 *  the setup-resume card's "Skip for now". */
export const DASHBOARD_TASK_KEY_RE =
  /^(conn:expired|platform:creds|sync:failed|refresh:failing|wizard):[A-Za-z0-9_.:/-]{1,300}$/

/** Minimum role that may clear (or un-clear) a dashboard task with this key.
 *  `platform:creds` rows are a job only an admin can finish, and `wizard`
 *  skips belong to the admin-only setup-resume card; the rest is operator+. */
export function minRoleForDashboardTask(key: string): 'operator' | 'admin' {
  return key.startsWith('platform:creds:') || key.startsWith('wizard:') ? 'admin' : 'operator'
}

const DASHBOARD_DISMISSAL_PREFIX = 'dashboard.dismissed:'

/**
 * Normalise a timestamp-ish value into the fingerprint form: strict ISO 8601
 * for epoch-millis numbers and parseable strings, the raw string when it does
 * not parse, `''` when absent. Shared by the poller and (by copy) the admin UI.
 */
export function dashboardTaskFingerprint(value: string | number | null | undefined): string {
  if (value == null || value === '') return ''
  const ms = typeof value === 'number' ? value : Date.parse(value)
  if (!Number.isFinite(ms)) return String(value)
  return new Date(ms).toISOString()
}

export interface ScopeGroup {
  id: number
  vertical: string
  platform: string
  name: string
  scopes: string[]
  createdAt: number
}

/** A first-class tenant — the registry that `tenant_id` strings across the
 *  runtime stores point at, and that custom domains attach to. */
export interface Tenant {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

/** A custom domain mapped to a tenant. `domain` is the lowercased hostname. */
export interface TenantDomain {
  domain: string
  tenantId: string
  createdAt: number
}

export interface ConnectLinkTemplateAllowedPlatform {
  vertical: string
  slug: string
}

export type ConnectLinkTemplateMode = 'pinned' | 'customer-picks-adapter' | 'self-register'

export interface ConnectLinkTemplate {
  id: number
  tenantId: string
  name: string
  description: string | null
  linkMode: ConnectLinkTemplateMode
  allowedVerticals: string[]
  allowedPlatforms: ConnectLinkTemplateAllowedPlatform[]
  scopeGroupId: number | null
  expiryDays: number
  oneTimeOnly: boolean
  redirectUrl: string | null
  createdAt: number
  createdBy: string | null
}

// Epoch-millisecond columns (created_at, updated_at) are INTEGER on SQLite and
// BIGINT on Postgres (the PostgresDbHandle parses int8 back to a JS number).
// AUTOINCREMENT primary keys become GENERATED ALWAYS AS IDENTITY on Postgres.
// JSON-as-TEXT columns (scopes, allowed_verticals, allowed_platforms) and
// boolean-as-INTEGER columns (acknowledged, one_time_only, hide_attribution)
// stay TEXT / INTEGER on BOTH dialects — the store still parses/serialises in
// JS. CHECK constraints, UNIQUE constraints, partial-free indexes and the
// app-level FK on tenant_domains are valid verbatim on both backends.
//
// Single v1 baseline. Future schema changes append as version 2, 3, … and
// must NEVER edit this baseline; the forward-only migrator fails closed
// when a DB reports a higher version than the binary knows.
//
// The 'default' tenant seed translates `INSERT OR IGNORE` →
// `INSERT ... ON CONFLICT DO NOTHING` and `unixepoch() * 1000` →
// `(extract(epoch from now()) * 1000)::bigint`.
export const MIGRATIONS: DualMigration[] = [
  {
    version: 1,
    sqlite: `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'viewer',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        vertical TEXT,
        target_id TEXT,
        detail TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      -- Runtime tunables admin users can override without a redeploy.
      -- Schema goal: services read merged view (.env defaults + admin
      -- overrides) on a short TTL cache; admin UI lists, edits, resets.
      -- Only highest-level admins (role = admin) can mutate.
      CREATE TABLE IF NOT EXISTS runtime_settings (
        key            TEXT PRIMARY KEY,
        value          TEXT NOT NULL,           -- JSON-encoded scalar
        value_type     TEXT NOT NULL,           -- 'number' | 'boolean' | 'string' | 'json'
        default_value  TEXT NOT NULL,
        description    TEXT NOT NULL,
        category       TEXT NOT NULL,
        updated_at     INTEGER NOT NULL,
        updated_by     TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_runtime_settings_category ON runtime_settings(category);
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        vertical TEXT,
        connection_id TEXT,
        platform TEXT,
        message TEXT NOT NULL,
        acknowledged INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS scope_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vertical TEXT NOT NULL,
        platform TEXT NOT NULL,
        name TEXT NOT NULL,
        scopes TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(vertical, platform, name)
      );
      CREATE INDEX IF NOT EXISTS idx_scope_groups_lookup ON scope_groups(vertical, platform);
      CREATE TABLE IF NOT EXISTS connect_link_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        link_mode TEXT NOT NULL,
        allowed_verticals TEXT NOT NULL DEFAULT '[]',
        allowed_platforms TEXT NOT NULL DEFAULT '[]',
        scope_group_id INTEGER,
        expiry_days INTEGER NOT NULL DEFAULT 7,
        one_time_only INTEGER NOT NULL DEFAULT 0,
        redirect_url TEXT,
        created_at INTEGER NOT NULL,
        created_by TEXT,
        UNIQUE(tenant_id, name)
      );
      CREATE INDEX IF NOT EXISTS idx_connect_link_templates_tenant ON connect_link_templates(tenant_id);
      CREATE TABLE IF NOT EXISTS company_info (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        name TEXT,
        legal_name TEXT,
        description TEXT,
        website TEXT,
        logo_data_url TEXT,
        primary_color TEXT,
        secondary_color TEXT,
        font_family TEXT,
        font_data_url TEXT,
        font_url TEXT,
        favicon_data_url TEXT,
        hide_attribution INTEGER,
        support_email TEXT,
        privacy_policy_url TEXT,
        terms_of_service_url TEXT,
        address_line1 TEXT,
        address_line2 TEXT,
        city TEXT,
        region TEXT,
        postal_code TEXT,
        country TEXT,
        base_url TEXT,
        updated_at INTEGER NOT NULL,
        updated_by TEXT NOT NULL
      );
      -- First-class tenants + custom-domain map. 'tenant' is a real registry
      -- so the admin UI can offer a picker and the public domain map can
      -- resolve an incoming Host header to a tenant. Branding stays
      -- deployment-global (company_info) — custom-domain-per-tenant only.
      CREATE TABLE IF NOT EXISTS tenants (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
      );
      -- One row per custom domain. PK is the (lowercased) hostname so a domain
      -- maps to exactly one tenant; many domains may map to one tenant.
      CREATE TABLE IF NOT EXISTS tenant_domains (
        domain      TEXT PRIMARY KEY,
        tenant_id   TEXT NOT NULL REFERENCES tenants(id),
        created_at  INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tenant_domains_tenant ON tenant_domains(tenant_id);
      -- Seed the 'default' tenant: the admin routes write tenant_id='default'
      -- when none is given, so this guarantees that literal resolves to a row.
      INSERT OR IGNORE INTO tenants (id, name, created_at, updated_at)
        VALUES ('default', 'Default', unixepoch() * 1000, unixepoch() * 1000);
    `,
    postgres: `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'viewer',
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audit_log (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        vertical TEXT,
        target_id TEXT,
        detail TEXT,
        created_at BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      -- Runtime tunables admin users can override without a redeploy.
      -- Schema goal: services read merged view (.env defaults + admin
      -- overrides) on a short TTL cache; admin UI lists, edits, resets.
      -- Only highest-level admins (role = admin) can mutate.
      CREATE TABLE IF NOT EXISTS runtime_settings (
        key            TEXT PRIMARY KEY,
        value          TEXT NOT NULL,           -- JSON-encoded scalar
        value_type     TEXT NOT NULL,           -- 'number' | 'boolean' | 'string' | 'json'
        default_value  TEXT NOT NULL,
        description    TEXT NOT NULL,
        category       TEXT NOT NULL,
        updated_at     BIGINT NOT NULL,
        updated_by     TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_runtime_settings_category ON runtime_settings(category);
      CREATE TABLE IF NOT EXISTS notifications (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        type TEXT NOT NULL,
        vertical TEXT,
        connection_id TEXT,
        platform TEXT,
        message TEXT NOT NULL,
        acknowledged INTEGER DEFAULT 0,
        created_at BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS scope_groups (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        vertical TEXT NOT NULL,
        platform TEXT NOT NULL,
        name TEXT NOT NULL,
        scopes TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        UNIQUE(vertical, platform, name)
      );
      CREATE INDEX IF NOT EXISTS idx_scope_groups_lookup ON scope_groups(vertical, platform);
      CREATE TABLE IF NOT EXISTS connect_link_templates (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        link_mode TEXT NOT NULL,
        allowed_verticals TEXT NOT NULL DEFAULT '[]',
        allowed_platforms TEXT NOT NULL DEFAULT '[]',
        scope_group_id INTEGER,
        expiry_days INTEGER NOT NULL DEFAULT 7,
        one_time_only INTEGER NOT NULL DEFAULT 0,
        redirect_url TEXT,
        created_at BIGINT NOT NULL,
        created_by TEXT,
        UNIQUE(tenant_id, name)
      );
      CREATE INDEX IF NOT EXISTS idx_connect_link_templates_tenant ON connect_link_templates(tenant_id);
      CREATE TABLE IF NOT EXISTS company_info (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        name TEXT,
        legal_name TEXT,
        description TEXT,
        website TEXT,
        logo_data_url TEXT,
        primary_color TEXT,
        secondary_color TEXT,
        font_family TEXT,
        font_data_url TEXT,
        font_url TEXT,
        favicon_data_url TEXT,
        hide_attribution INTEGER,
        support_email TEXT,
        privacy_policy_url TEXT,
        terms_of_service_url TEXT,
        address_line1 TEXT,
        address_line2 TEXT,
        city TEXT,
        region TEXT,
        postal_code TEXT,
        country TEXT,
        base_url TEXT,
        updated_at BIGINT NOT NULL,
        updated_by TEXT NOT NULL
      );
      -- First-class tenants + custom-domain map. 'tenant' is a real registry
      -- so the admin UI can offer a picker and the public domain map can
      -- resolve an incoming Host header to a tenant. Branding stays
      -- deployment-global (company_info) — custom-domain-per-tenant only.
      CREATE TABLE IF NOT EXISTS tenants (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        created_at  BIGINT NOT NULL,
        updated_at  BIGINT NOT NULL
      );
      -- One row per custom domain. PK is the (lowercased) hostname so a domain
      -- maps to exactly one tenant; many domains may map to one tenant.
      CREATE TABLE IF NOT EXISTS tenant_domains (
        domain      TEXT PRIMARY KEY,
        tenant_id   TEXT NOT NULL REFERENCES tenants(id),
        created_at  BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tenant_domains_tenant ON tenant_domains(tenant_id);
      -- Seed the 'default' tenant: the admin routes write tenant_id='default'
      -- when none is given, so this guarantees that literal resolves to a row.
      INSERT INTO tenants (id, name, created_at, updated_at)
        VALUES ('default', 'Default', (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint)
        ON CONFLICT DO NOTHING;
    `,
  },
  {
    // Platform logos, fetched from the admin UI.
    //
    // The bytes live in the database rather than on disk because there is
    // nowhere on disk to put them: admin mounts docs/platforms read-only,
    // docker-compose.hardening.yml sets read_only: true on every service, and
    // the Helm chart hardcodes readOnlyRootFilesystem with no PVC for admin or
    // docs-server (both of which run 2 replicas). A row is reachable from every
    // replica and survives a redeploy; a file in a container is neither.
    //
    // Additive only — no ALTER, no data movement — so a v1 pod running beside a
    // v2-migrated database during a rolling update is fine. Rolling BACK past
    // this release is not: the migrator fails closed when the DB reports a
    // higher version than the binary knows. docs/deployment/upgrading.md
    // records that.
    version: 2,
    sqlite: `
      CREATE TABLE IF NOT EXISTS platform_logos (
        slug          TEXT    NOT NULL,
        ext           TEXT    NOT NULL CHECK (ext IN ('svg','png')),
        content_type  TEXT    NOT NULL,
        bytes         BLOB    NOT NULL,
        byte_size     INTEGER NOT NULL,
        -- sha256 hex of the bytes, served as the HTTP ETag. Stored rather than
        -- computed per request so a 304 never has to read the blob.
        etag          TEXT    NOT NULL,
        source_domain TEXT    NOT NULL,
        fetched_at    INTEGER NOT NULL,
        fetched_by    TEXT,
        PRIMARY KEY (slug, ext)
      );
      CREATE INDEX IF NOT EXISTS idx_platform_logos_fetched_at ON platform_logos(fetched_at);

      CREATE TABLE IF NOT EXISTS logo_fetch_jobs (
        id            TEXT    PRIMARY KEY,
        status        TEXT    NOT NULL DEFAULT 'pending',
        -- 'singleton' while the job is non-terminal, NULL once it finishes.
        -- The unique index below then permits any number of finished rows but
        -- exactly one live job across every admin-api replica. A plain unique
        -- index rather than a partial one: NULLs are distinct on both
        -- backends, and only partial-free indexes are portable verbatim.
        active_key    TEXT,
        force         INTEGER NOT NULL DEFAULT 0,
        vertical      TEXT,
        slug          TEXT,
        delay_ms      INTEGER NOT NULL,
        total         INTEGER NOT NULL DEFAULT 0,
        progress      TEXT,
        error         TEXT,
        worker_id     TEXT,
        attempts      INTEGER NOT NULL DEFAULT 0,
        heartbeat_at  INTEGER,
        created_at    INTEGER NOT NULL,
        created_by    TEXT,
        started_at    INTEGER,
        completed_at  INTEGER
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_logo_fetch_jobs_active ON logo_fetch_jobs(active_key);
      CREATE INDEX IF NOT EXISTS idx_logo_fetch_jobs_created ON logo_fetch_jobs(created_at);
      CREATE INDEX IF NOT EXISTS idx_logo_fetch_jobs_status ON logo_fetch_jobs(status, heartbeat_at);
    `,
    postgres: `
      CREATE TABLE IF NOT EXISTS platform_logos (
        slug          TEXT    NOT NULL,
        ext           TEXT    NOT NULL CHECK (ext IN ('svg','png')),
        content_type  TEXT    NOT NULL,
        bytes         BYTEA   NOT NULL,
        byte_size     INTEGER NOT NULL,
        etag          TEXT    NOT NULL,
        source_domain TEXT    NOT NULL,
        fetched_at    BIGINT  NOT NULL,
        fetched_by    TEXT,
        PRIMARY KEY (slug, ext)
      );
      CREATE INDEX IF NOT EXISTS idx_platform_logos_fetched_at ON platform_logos(fetched_at);

      CREATE TABLE IF NOT EXISTS logo_fetch_jobs (
        id            TEXT    PRIMARY KEY,
        status        TEXT    NOT NULL DEFAULT 'pending',
        active_key    TEXT,
        force         INTEGER NOT NULL DEFAULT 0,
        vertical      TEXT,
        slug          TEXT,
        delay_ms      INTEGER NOT NULL,
        total         INTEGER NOT NULL DEFAULT 0,
        progress      TEXT,
        error         TEXT,
        worker_id     TEXT,
        attempts      INTEGER NOT NULL DEFAULT 0,
        heartbeat_at  BIGINT,
        created_at    BIGINT  NOT NULL,
        created_by    TEXT,
        started_at    BIGINT,
        completed_at  BIGINT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_logo_fetch_jobs_active ON logo_fetch_jobs(active_key);
      CREATE INDEX IF NOT EXISTS idx_logo_fetch_jobs_created ON logo_fetch_jobs(created_at);
      CREATE INDEX IF NOT EXISTS idx_logo_fetch_jobs_status ON logo_fetch_jobs(status, heartbeat_at);
    `,
  },
  {
    // Permission model: custom roles and per-user tenant scope.
    //
    // `users.role` stays the BASE role (always a built-in), so every existing
    // role gate, the JWT shape and the admin UI keep working. `role_id` points
    // at a custom role when one is assigned; NULL means "the built-in named by
    // `role`". Built-in roles are seeded as rows so a role picker lists them,
    // but their permission sets live in code (`BUILTIN_ROLE_PERMISSIONS` in
    // @opensteward/shared) — `permissions_json` is '[]' for them and ignored.
    //
    // Every existing user gets `scope_mode = 'all'`, which is exactly the
    // pre-v3 behaviour. Additive only (new tables, nullable/defaulted
    // columns), so a v2 pod beside a v3 database during a rolling update
    // keeps working; it simply ignores the new columns.
    version: 3,
    sqlite: `
      CREATE TABLE IF NOT EXISTS roles (
        id               TEXT PRIMARY KEY,
        name             TEXT NOT NULL UNIQUE,
        description      TEXT,
        base_role        TEXT NOT NULL CHECK (base_role IN ('viewer','operator','admin')),
        permissions_json TEXT NOT NULL DEFAULT '[]',
        is_builtin       INTEGER NOT NULL DEFAULT 0,
        created_at       INTEGER NOT NULL,
        updated_at       INTEGER NOT NULL,
        updated_by       TEXT
      );
      INSERT OR IGNORE INTO roles (id, name, description, base_role, permissions_json, is_builtin, created_at, updated_at, updated_by)
        VALUES ('admin', 'admin', 'Full control of the deployment.', 'admin', '[]', 1, unixepoch() * 1000, unixepoch() * 1000, NULL);
      INSERT OR IGNORE INTO roles (id, name, description, base_role, permissions_json, is_builtin, created_at, updated_at, updated_by)
        VALUES ('operator', 'operator', 'Manage connections and browse data.', 'operator', '[]', 1, unixepoch() * 1000, unixepoch() * 1000, NULL);
      INSERT OR IGNORE INTO roles (id, name, description, base_role, permissions_json, is_builtin, created_at, updated_at, updated_by)
        VALUES ('viewer', 'viewer', 'Read-only access to connections and dashboards.', 'viewer', '[]', 1, unixepoch() * 1000, unixepoch() * 1000, NULL);

      ALTER TABLE users ADD COLUMN role_id TEXT;
      ALTER TABLE users ADD COLUMN scope_mode TEXT NOT NULL DEFAULT 'all';
      ALTER TABLE users ADD COLUMN scope_source TEXT NOT NULL DEFAULT 'manual';
      CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);

      -- One row per (user, tenant, vertical). vertical '*' = every vertical of
      -- that tenant. Only read when users.scope_mode = 'restricted'.
      CREATE TABLE IF NOT EXISTS user_scopes (
        user_id   TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        vertical  TEXT NOT NULL DEFAULT '*',
        PRIMARY KEY (user_id, tenant_id, vertical)
      );
    `,
    postgres: `
      CREATE TABLE IF NOT EXISTS roles (
        id               TEXT PRIMARY KEY,
        name             TEXT NOT NULL UNIQUE,
        description      TEXT,
        base_role        TEXT NOT NULL CHECK (base_role IN ('viewer','operator','admin')),
        permissions_json TEXT NOT NULL DEFAULT '[]',
        is_builtin       INTEGER NOT NULL DEFAULT 0,
        created_at       BIGINT NOT NULL,
        updated_at       BIGINT NOT NULL,
        updated_by       TEXT
      );
      INSERT INTO roles (id, name, description, base_role, permissions_json, is_builtin, created_at, updated_at, updated_by)
        VALUES ('admin', 'admin', 'Full control of the deployment.', 'admin', '[]', 1, (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint, NULL)
        ON CONFLICT DO NOTHING;
      INSERT INTO roles (id, name, description, base_role, permissions_json, is_builtin, created_at, updated_at, updated_by)
        VALUES ('operator', 'operator', 'Manage connections and browse data.', 'operator', '[]', 1, (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint, NULL)
        ON CONFLICT DO NOTHING;
      INSERT INTO roles (id, name, description, base_role, permissions_json, is_builtin, created_at, updated_at, updated_by)
        VALUES ('viewer', 'viewer', 'Read-only access to connections and dashboards.', 'viewer', '[]', 1, (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint, NULL)
        ON CONFLICT DO NOTHING;

      ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS scope_mode TEXT NOT NULL DEFAULT 'all';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS scope_source TEXT NOT NULL DEFAULT 'manual';
      CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);

      CREATE TABLE IF NOT EXISTS user_scopes (
        user_id   TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        vertical  TEXT NOT NULL DEFAULT '*',
        PRIMARY KEY (user_id, tenant_id, vertical)
      );
    `,
  },
  {
    // User dashboards (the built-in ones are defined in code under
    // `core/dashboards/builtin/`). `layout_json` holds the widget list —
    // metric ids and chart choices only, never queries: what a dashboard can
    // show is bounded by integration-server's metric catalog. Owned by
    // `DashboardStore` (`dashboard-store.ts`). Additive only.
    version: 4,
    sqlite: `
      CREATE TABLE IF NOT EXISTS dashboards (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        description   TEXT,
        layout_json   TEXT NOT NULL DEFAULT '[]',
        owner_user_id TEXT NOT NULL,
        visibility    TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','shared')),
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_dashboards_owner ON dashboards(owner_user_id);
      CREATE INDEX IF NOT EXISTS idx_dashboards_visibility ON dashboards(visibility);
    `,
    postgres: `
      CREATE TABLE IF NOT EXISTS dashboards (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        description   TEXT,
        layout_json   TEXT NOT NULL DEFAULT '[]',
        owner_user_id TEXT NOT NULL,
        visibility    TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','shared')),
        created_at    BIGINT NOT NULL,
        updated_at    BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_dashboards_owner ON dashboards(owner_user_id);
      CREATE INDEX IF NOT EXISTS idx_dashboards_visibility ON dashboards(visibility);
    `,
  },
  {
    // Registry of embedded Apache Superset dashboards (optional, Postgres
    // deployments). Written by the superset-bootstrap job through
    // `PUT /api/internal/superset/dashboards`; read by the admin UI to list
    // and embed them. `superset_uuid` is the dashboard's own uuid in
    // Superset, `embedded_uuid` the id of its embedded configuration (what
    // the guest token and the iframe name). Owned by
    // `SupersetDashboardStore`. Additive only.
    version: 5,
    sqlite: `
      CREATE TABLE IF NOT EXISTS superset_dashboards (
        id                  TEXT PRIMARY KEY,
        title               TEXT NOT NULL,
        description         TEXT,
        superset_uuid       TEXT NOT NULL UNIQUE,
        embedded_uuid       TEXT NOT NULL,
        verticals_json      TEXT,
        required_permission TEXT,
        created_at          INTEGER NOT NULL,
        updated_at          INTEGER NOT NULL
      );
    `,
    postgres: `
      CREATE TABLE IF NOT EXISTS superset_dashboards (
        id                  TEXT PRIMARY KEY,
        title               TEXT NOT NULL,
        description         TEXT,
        superset_uuid       TEXT NOT NULL UNIQUE,
        embedded_uuid       TEXT NOT NULL,
        verticals_json      TEXT,
        required_permission TEXT,
        created_at          BIGINT NOT NULL,
        updated_at          BIGINT NOT NULL
      );
    `,
  },
  {
    // Dashboard audiences. `visibility` stays as storage ('private' |
    // 'shared'); a shared row with `audience_tenants_json` NULL is shared
    // with everyone, otherwise with the JSON-array tenants (anyone whose
    // scope holds any of them). `pinned_tenants_json` limits a dashboard's
    // data to viewer scope ∩ those tenants. A restricted owner's existing
    // `shared` dashboards are narrowed to that owner's tenants (none → private),
    // so upgrading never widens who sees a dashboard. Admins are always
    // unrestricted, so an admin owner's shared dashboards become `everyone`. The Superset registry
    // gets the same two columns; the bootstrap job never writes them.
    // Owned by `DashboardStore` and `SupersetDashboardStore`; rules in
    // `core/dashboards/audience.ts`. Additive only.
    version: 6,
    sqlite: `
      ALTER TABLE dashboards ADD COLUMN audience_tenants_json TEXT;
      ALTER TABLE dashboards ADD COLUMN pinned_tenants_json TEXT;
      UPDATE dashboards
         SET audience_tenants_json = (
               SELECT json_group_array(tenant_id) FROM (
                 SELECT DISTINCT s.tenant_id AS tenant_id FROM user_scopes s
                  WHERE s.user_id = dashboards.owner_user_id
                  ORDER BY s.tenant_id))
       WHERE visibility = 'shared'
         AND owner_user_id IN (SELECT id FROM users WHERE scope_mode = 'restricted' AND role <> 'admin');
      UPDATE dashboards SET visibility = 'private', audience_tenants_json = NULL
       WHERE visibility = 'shared' AND audience_tenants_json = '[]';
      ALTER TABLE superset_dashboards ADD COLUMN audience_tenants_json TEXT;
      ALTER TABLE superset_dashboards ADD COLUMN pinned_tenants_json TEXT;
    `,
    postgres: `
      ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS audience_tenants_json TEXT;
      ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS pinned_tenants_json TEXT;
      UPDATE dashboards d
         SET audience_tenants_json = (
               SELECT COALESCE(json_agg(t.tenant_id ORDER BY t.tenant_id), '[]'::json)::text
                 FROM (SELECT DISTINCT s.tenant_id FROM user_scopes s
                        WHERE s.user_id = d.owner_user_id) t)
       WHERE d.visibility = 'shared'
         AND d.owner_user_id IN (SELECT id FROM users WHERE scope_mode = 'restricted' AND role <> 'admin');
      UPDATE dashboards SET visibility = 'private', audience_tenants_json = NULL
       WHERE visibility = 'shared' AND audience_tenants_json = '[]';
      ALTER TABLE superset_dashboards ADD COLUMN IF NOT EXISTS audience_tenants_json TEXT;
      ALTER TABLE superset_dashboards ADD COLUMN IF NOT EXISTS pinned_tenants_json TEXT;
    `,
  },
  {
    // Console-user profile: an email address and a profile picture.
    //
    // `users.email` is optional. `email_source` records who owns it — `manual`
    // (an admin typed it; SSO never overwrites it) or `idp` (copied from OIDC
    // claims, SAML attributes or SCIM and refreshed on every SSO sign-in or
    // SCIM update). NULL while there is no email. No UNIQUE constraint: a
    // person may hold a local break-glass account and an SSO account at once.
    //
    // The picture lives in its own table so the `users` row — read on every
    // request by the access resolver — never drags a blob along. One row per
    // user; the bytes are exactly what was uploaded or fetched (PNG, JPEG or
    // WebP, identified by magic bytes, at most 512 KB), never resized.
    // `sha256` is the ETag and the cache-busting version. `source` is `upload`
    // (a person chose it; SSO never replaces it) or `idp` (fetched from the
    // IdP's picture URL). `source_url_hash` is the sha256 of that URL, so a
    // sign-in whose URL has not changed does not refetch it. No foreign key,
    // as for `user_scopes`: `deleteUser` removes the row in its transaction.
    //
    // Additive only — two nullable columns and a new table — so a v6 pod
    // beside a v7 database during a rolling update keeps working.
    version: 7,
    sqlite: `
      ALTER TABLE users ADD COLUMN email TEXT;
      ALTER TABLE users ADD COLUMN email_source TEXT;

      CREATE TABLE IF NOT EXISTS user_avatars (
        user_id         TEXT    PRIMARY KEY,
        content_type    TEXT    NOT NULL CHECK (content_type IN ('image/png','image/jpeg','image/webp')),
        bytes           BLOB    NOT NULL,
        byte_size       INTEGER NOT NULL,
        sha256          TEXT    NOT NULL,
        source          TEXT    NOT NULL CHECK (source IN ('upload','idp')),
        source_url_hash TEXT,
        updated_at      INTEGER NOT NULL,
        updated_by      TEXT
      );
    `,
    postgres: `
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_source TEXT;

      CREATE TABLE IF NOT EXISTS user_avatars (
        user_id         TEXT    PRIMARY KEY,
        content_type    TEXT    NOT NULL CHECK (content_type IN ('image/png','image/jpeg','image/webp')),
        bytes           BYTEA   NOT NULL,
        byte_size       INTEGER NOT NULL,
        sha256          TEXT    NOT NULL,
        source          TEXT    NOT NULL CHECK (source IN ('upload','idp')),
        source_url_hash TEXT,
        updated_at      BIGINT  NOT NULL,
        updated_by      TEXT
      );
    `,
  },
]

export class AdminStore {
  private constructor(private readonly handle: DbHandle) {}

  /**
   * Open the store: apply (any pending) migrations, then record one
   * `schema.migrate` audit row per version applied during THIS boot.
   *
   * The migrator's `onApplied` callback is synchronous (fire-and-forget); it
   * cannot await an async Kysely insert, and the audit row must survive on
   * BOTH backends. So we collect each applied version's duration into a Map
   * via the sync callback (cheap, no I/O), then — AFTER `migrate()` resolves —
   * await one audit insert per applied version. By then `audit_log` exists
   * (version 1 creates it and has committed), so there is no first-boot
   * table-missing race.
   */
  static async create(handle: DbHandle): Promise<AdminStore> {
    const store = new AdminStore(handle)
    const durations = new Map<number, number>()
    await handle.migrate('admin_store', MIGRATIONS, {
      onApplied: (version, durationMs) => {
        durations.set(version, durationMs)
      },
    })
    // Schema changes have no human user, so `user_id` is the literal 'system'.
    // Best-effort: a failed audit write must not break boot.
    for (const version of [...durations.keys()].sort((a, b) => a - b)) {
      try {
        await store.handle.kysely
          .insertInto('audit_log')
          .values({
            user_id: 'system',
            action: 'schema.migrate',
            vertical: null,
            target_id: 'admin_store',
            detail: JSON.stringify({ version, durationMs: durations.get(version) }),
            created_at: Date.now(),
          })
          .execute()
      } catch (err) {
        console.error(
          `[admin_store] schema.migrate audit write failed for version ${version}:`,
          err,
        )
      }
    }
    return store
  }

  /**
   * Expose the underlying handle so the schema-status route can query
   * `_schema_migrations`, and so sibling stores share the same connection
   * without re-opening the database.
   */
  getHandle(): DbHandle {
    return this.handle
  }

  // ── Users ─────────────────────────────────────────────────────────────────

  async createUser(
    username: string,
    passwordHash: string,
    role: 'admin' | 'operator' | 'viewer',
    opts: {
      scopeSource?: UserScopeSource
      /** Already validated and normalised by the caller. */
      email?: string | null
      emailSource?: UserEmailSource
    } = {},
  ): Promise<UserRow> {
    const id = randomUUID()
    const now = Date.now()
    await this.handle.kysely
      .insertInto('users')
      .values({
        id,
        username,
        password_hash: passwordHash,
        role,
        // Only set when asked, so the column default ('manual') stays the
        // one source of truth for every other creator.
        ...(opts.scopeSource ? { scope_source: opts.scopeSource } : {}),
        ...(opts.email ? { email: opts.email, email_source: opts.emailSource ?? 'manual' } : {}),
        created_at: now,
        updated_at: now,
      })
      .execute()
    return (await this.getUserById(id))!
  }

  /**
   * Set or clear a user's email. `null` clears it and its owner, so the next
   * SSO sign-in may fill it from the IdP again. Returns null for an unknown
   * user. The caller validates the address; see `normalizeEmail`.
   */
  async setUserEmail(
    id: string,
    email: string | null,
    source: UserEmailSource,
  ): Promise<UserRow | null> {
    const res = await this.handle.kysely
      .updateTable('users')
      .set({
        email,
        email_source: email === null ? null : source,
        updated_at: Date.now(),
      })
      .where('id', '=', id)
      .executeTakeFirst()
    return Number(res.numUpdatedRows) > 0 ? this.getUserById(id) : null
  }

  /**
   * The identity provider's write: set (or, with null, clear) the email only
   * while no admin owns it. The ownership check is in the UPDATE itself, so an
   * admin's PATCH that lands between an SSO sign-in reading the row and
   * writing it is never overwritten or flipped to `idp`. A set applies when
   * `email_source` is NULL or `idp`; a clear only when it is `idp`. Returns
   * whether a row changed.
   */
  async setIdpEmail(id: string, email: string | null): Promise<boolean> {
    const res = await this.handle.kysely
      .updateTable('users')
      .set({ email, email_source: email === null ? null : 'idp', updated_at: Date.now() })
      .where('id', '=', id)
      .where((eb) =>
        email === null
          ? eb('email_source', '=', 'idp')
          : eb.or([eb('email_source', 'is', null), eb('email_source', '=', 'idp')]),
      )
      .executeTakeFirst()
    return Number(res.numUpdatedRows) > 0
  }

  async getUserByUsername(username: string): Promise<UserRow | null> {
    const row = await this.handle.kysely
      .selectFrom('users')
      .selectAll()
      .where('username', '=', username)
      .executeTakeFirst()
    return (row as UserRow | undefined) ?? null
  }

  /**
   * Put a user on a BUILT-IN role. Clears any custom role (`role_id`): the
   * built-in named here is now the whole of what the user holds. For a
   * custom role use {@link assignUserRole}.
   */
  async setUserRole(id: string, role: 'admin' | 'operator' | 'viewer'): Promise<UserRow | null> {
    const now = Date.now()
    await this.handle.transaction(async (tx) => {
      await tx
        .updateTable('users')
        .set({ role, role_id: null, updated_at: now })
        .where('id', '=', id)
        .execute()
      if (role === 'admin') await this.clearScope(tx, [id], now)
    })
    invalidateAccess(id)
    return this.getUserById(id)
  }

  /** Admins always see every tenant: drop a promoted user's stored restriction. */
  private async clearScope(tx: ScopeTx, userIds: readonly string[], now: number) {
    if (userIds.length === 0) return
    await tx.deleteFrom('user_scopes').where('user_id', 'in', userIds).execute()
    await tx
      .updateTable('users')
      .set({ scope_mode: 'all', updated_at: now })
      .where('id', 'in', userIds)
      .execute()
  }

  async setUserPassword(id: string, passwordHash: string): Promise<UserRow | null> {
    await this.handle.kysely
      .updateTable('users')
      .set({ password_hash: passwordHash, updated_at: Date.now() })
      .where('id', '=', id)
      .execute()
    return this.getUserById(id)
  }

  async getUserById(id: string): Promise<UserRow | null> {
    const row = await this.handle.kysely
      .selectFrom('users')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()
    return (row as UserRow | undefined) ?? null
  }

  async listUsers(): Promise<UserRow[]> {
    return (await this.handle.kysely
      .selectFrom('users')
      .selectAll()
      .orderBy('created_at', 'asc')
      .execute()) as UserRow[]
  }

  /**
   * Resolve user ids to usernames, for display.
   *
   * The audit log stores `user_id` and always will: it is the stable key, it
   * survives a rename, and it is what a filter can be trusted to match. The
   * username is a presentation detail resolved at read time.
   *
   * Ids with no row — a deleted operator, or the literal 'system' the workers
   * write under — are simply absent from the map, and callers fall back to the
   * id. An audit entry must never lose the record of who acted just because
   * the account is gone.
   */
  async usernamesByIds(ids: readonly string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)].filter((id) => id && id !== 'system')
    if (unique.length === 0) return new Map()
    const rows = (await this.handle.kysely
      .selectFrom('users')
      .select(['id', 'username'])
      .where('id', 'in', unique)
      .execute()) as Array<{ id: string; username: string }>
    return new Map(rows.map((r) => [r.id, r.username]))
  }

  /** Reverse lookup, so an audit filter accepts what the table displays. */
  async userIdByUsername(username: string): Promise<string | null> {
    const row = (await this.handle.kysely
      .selectFrom('users')
      .select('id')
      .where('username', '=', username)
      .executeTakeFirst()) as { id: string } | undefined
    return row?.id ?? null
  }

  async deleteUser(id: string): Promise<boolean> {
    const deleted = await this.handle.transaction(async (tx) => {
      // Scope rows first: a later user reusing nothing of this id is the
      // norm, but an orphaned grant is still a grant nobody can see.
      await tx.deleteFrom('user_scopes').where('user_id', '=', id).execute()
      // The profile picture has no foreign key either (admin_store v7).
      await tx.deleteFrom('user_avatars').where('user_id', '=', id).execute()
      const res = await tx.deleteFrom('users').where('id', '=', id).executeTakeFirst()
      return Number(res.numDeletedRows) > 0
    })
    invalidateAccess(id)
    return deleted
  }

  async hasUsers(): Promise<boolean> {
    const row = await this.handle.kysely
      .selectFrom('users')
      .select((eb) => eb.fn.countAll().as('count'))
      .executeTakeFirstOrThrow()
    return Number((row as { count: number | bigint | string }).count) > 0
  }

  // ── Roles & user scope ────────────────────────────────────────────────────

  async listRoles(): Promise<RoleRecord[]> {
    const rows = (await this.handle.kysely
      .selectFrom('roles')
      .selectAll()
      .execute()) as RoleDbRow[]
    // Built-ins first, in privilege order; then custom roles by name. Sorted
    // here rather than in SQL: the order of the built-ins is not alphabetical.
    const rank = (r: RoleRecord) =>
      r.isBuiltin ? ({ viewer: 0, operator: 1, admin: 2 } as Record<string, number>)[r.id] ?? 3 : 4
    return rows
      .map(rowToRole)
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
  }

  async getRole(id: string): Promise<RoleRecord | null> {
    const row = (await this.handle.kysely
      .selectFrom('roles')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()) as RoleDbRow | undefined
    return row ? rowToRole(row) : null
  }

  /** Case-insensitive name lookup — `Support` and `support` are one role. */
  async getRoleByName(name: string): Promise<RoleRecord | null> {
    const needle = name.trim().toLowerCase()
    return (await this.listRoles()).find((r) => r.name.toLowerCase() === needle) ?? null
  }

  async createRole(input: {
    name: string
    description?: string | null
    baseRole: BuiltinRole
    permissions: readonly Permission[]
    createdBy: string | null
  }): Promise<RoleRecord> {
    const id = randomUUID()
    const now = Date.now()
    await this.handle.kysely
      .insertInto('roles')
      .values({
        id,
        name: input.name,
        description: input.description ?? null,
        base_role: input.baseRole,
        permissions_json: JSON.stringify(normalizePermissions(input.permissions)),
        is_builtin: 0,
        created_at: now,
        updated_at: now,
        updated_by: input.createdBy,
      })
      .execute()
    return (await this.getRole(id))!
  }

  /**
   * Edit a custom role. Built-in roles are immutable (`reason: 'builtin'`).
   * A base-role change is propagated to every holder's `users.role` in the
   * same transaction, so the role-level gates never disagree with the role.
   */
  async updateRole(
    id: string,
    patch: {
      name?: string
      description?: string | null
      baseRole?: BuiltinRole
      permissions?: readonly Permission[]
    },
    updatedBy: string | null,
  ): Promise<{ ok: true; role: RoleRecord } | { ok: false; reason: 'builtin' | 'not_found' }> {
    const existing = await this.getRole(id)
    if (!existing) return { ok: false, reason: 'not_found' }
    if (existing.isBuiltin) return { ok: false, reason: 'builtin' }
    const now = Date.now()
    await this.handle.transaction(async (tx) => {
      await tx
        .updateTable('roles')
        .set({
          name: patch.name ?? existing.name,
          description: patch.description === undefined ? existing.description : patch.description,
          base_role: patch.baseRole ?? existing.baseRole,
          permissions_json: JSON.stringify(
            normalizePermissions(patch.permissions ?? existing.permissions),
          ),
          updated_at: now,
          updated_by: updatedBy,
        })
        .where('id', '=', id)
        .execute()
      if (patch.baseRole && patch.baseRole !== existing.baseRole) {
        await tx
          .updateTable('users')
          .set({ role: patch.baseRole, updated_at: now })
          .where('role_id', '=', id)
          .execute()
        if (patch.baseRole === 'admin') {
          const holders = await tx.selectFrom('users').select('id').where('role_id', '=', id).execute()
          await this.clearScope(tx, holders.map((h) => h.id as string), now)
        }
      }
    })
    // Every holder's permissions just changed; the cache is keyed by user.
    invalidateAccess()
    return { ok: true, role: (await this.getRole(id))! }
  }

  /** Number of users holding a custom role. */
  async countUsersWithRole(id: string): Promise<number> {
    const row = await this.handle.kysely
      .selectFrom('users')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('role_id', '=', id)
      .executeTakeFirstOrThrow()
    return Number((row as { count: number | bigint | string }).count)
  }

  /** Holders of a custom role whose tenant scope is restricted. */
  async countRestrictedHolders(roleId: string): Promise<number> {
    const row = await this.handle.kysely
      .selectFrom('users')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('role_id', '=', roleId)
      .where('scope_mode', '=', 'restricted')
      .executeTakeFirst()
    return Number(row?.n ?? 0)
  }

  /**
   * Delete a custom role. Refuses a built-in and a role any user still holds
   * (`in_use`) — deleting it would silently drop those users to nothing, or
   * worse, to whatever their stale base role grants. The caller also checks
   * IdP role-mapping rules (owned by IdentityStore) before calling this.
   */
  async deleteRole(
    id: string,
  ): Promise<{ ok: true } | { ok: false; reason: 'builtin' | 'not_found' | 'in_use'; users?: number }> {
    const existing = await this.getRole(id)
    if (!existing) return { ok: false, reason: 'not_found' }
    if (existing.isBuiltin) return { ok: false, reason: 'builtin' }
    const users = await this.countUsersWithRole(id)
    if (users > 0) return { ok: false, reason: 'in_use', users }
    await this.handle.kysely.deleteFrom('roles').where('id', '=', id).execute()
    invalidateAccess()
    return { ok: true }
  }

  /**
   * Assign a role (built-in id or custom role id) to a user. `users.role` is
   * set to the role's base role in the same transaction, so the JWT claim and
   * `operatorOnly`/`adminOnly` (which read the current role) see the right
   * level on the next request. Returns null when the user or the role does not exist.
   */
  async assignUserRole(userId: string, roleId: string): Promise<UserRow | null> {
    const role = await this.getRole(roleId)
    if (!role) return null
    const updated = await this.handle.transaction(async (tx) => {
      const res = await tx
        .updateTable('users')
        .set({
          role: role.baseRole,
          // A built-in is held through `role` alone — role_id stays NULL so a
          // pre-v3 reader and this one agree on what the user is.
          role_id: role.isBuiltin ? null : role.id,
          updated_at: Date.now(),
        })
        .where('id', '=', userId)
        .executeTakeFirst()
      const ok = Number(res.numUpdatedRows) > 0
      if (ok && role.baseRole === 'admin') await this.clearScope(tx, [userId], Date.now())
      return ok
    })
    invalidateAccess(userId)
    return updated ? this.getUserById(userId) : null
  }

  async getUserScope(userId: string): Promise<UserScope | null> {
    const user = await this.getUserById(userId)
    if (!user) return null
    const mode: UserScopeMode = user.scope_mode === 'restricted' ? 'restricted' : 'all'
    const source: UserScopeSource = user.scope_source === 'idp' ? 'idp' : 'manual'
    if (mode === 'all') return { mode, source, grants: [] }
    const rows = (await this.handle.kysely
      .selectFrom('user_scopes')
      .select(['tenant_id', 'vertical'])
      .where('user_id', '=', userId)
      .orderBy('tenant_id')
      .orderBy('vertical')
      .execute()) as Array<{ tenant_id: string; vertical: string }>
    return { mode, source, grants: rowsToGrants(rows) }
  }

  /**
   * Replace a user's scope. `mode: 'all'` clears every grant. Grants are
   * normalised: a tenant listed with `'*'` covers every vertical, so any
   * specific verticals alongside it are dropped.
   */
  async setUserScope(
    userId: string,
    scope: { mode: UserScopeMode; grants: readonly ScopeGrant[] },
    source: UserScopeSource,
  ): Promise<UserScope | null> {
    const rows = scope.mode === 'restricted' ? grantsToRows(scope.grants) : []
    const updated = await this.handle.transaction(async (tx) => {
      if (scope.mode === 'restricted') {
        const target = await tx.selectFrom('users').select('role').where('id', '=', userId).executeTakeFirst()
        if (target?.role === 'admin') throw new AdminScopeError()
      }
      const res = await tx
        .updateTable('users')
        .set({ scope_mode: scope.mode, scope_source: source, updated_at: Date.now() })
        .where('id', '=', userId)
        .executeTakeFirst()
      if (Number(res.numUpdatedRows) === 0) return false
      await tx.deleteFrom('user_scopes').where('user_id', '=', userId).execute()
      if (rows.length > 0) {
        await tx
          .insertInto('user_scopes')
          .values(rows.map((r) => ({ user_id: userId, tenant_id: r.tenant_id, vertical: r.vertical })))
          .execute()
      }
      return true
    })
    invalidateAccess(userId)
    return updated ? this.getUserScope(userId) : null
  }

  // ── Audit ─────────────────────────────────────────────────────────────────

  /**
   * Append a row to `audit_log`. The `(action, detail)` pair is checked
   * against the typed registry in `./audit-actions.ts`: TypeScript refuses
   * to compile a writer that passes a mismatched detail shape.
   *
   * Two call shapes are supported:
   *   - Object form (preferred): `writeAudit({ userId, action, detail, vertical?, targetId? })`
   *   - Positional form: `writeAudit(userId, action, vertical?, targetId?, detail?)`
   *
   * Both compile to the same row insert. The positional overload is widely
   * used in this codebase; prefer the object form for new writers because
   * it labels the fields at the call site (esp. distinguishing `vertical`
   * from `targetId`).
   *
   * The detail value MUST omit the `action` discriminator — the action is
   * supplied separately via the sibling `action` argument and gets merged
   * back in when the audit-list route reassembles the variant.
   */
  writeAudit<A extends AuditAction>(input: WriteAuditInput<A>): Promise<void>
  writeAudit<A extends AuditAction>(
    userId: string,
    action: A,
    vertical?: string | null,
    targetId?: string | null,
    // The `detail` overload narrows by the literal `action` — passing a
    // detail shape that doesn't match the registered branch is a compile
    // error at the call site. Actions whose registry variant has no
    // payload fields accept either no argument or `null` / `undefined`.
    ...rest: keyof AuditDetailFor<A> extends never
      ? [detail?: AuditDetailFor<A> | null]
      : [detail: AuditDetailFor<A>]
  ): Promise<void>
  async writeAudit(
    arg1: string | WriteAuditInput,
    action?: string,
    vertical?: string | null,
    targetId?: string | null,
    detail?: unknown,
  ): Promise<void> {
    let resolved: {
      userId: string
      action: string
      vertical: string | null
      targetId: string | null
      detail: unknown
    }
    if (typeof arg1 === 'object' && arg1 !== null) {
      resolved = {
        userId: arg1.userId,
        action: arg1.action,
        vertical: arg1.vertical ?? null,
        targetId: arg1.targetId ?? null,
        detail: arg1.detail,
      }
    } else {
      resolved = {
        userId: arg1,
        action: action!,
        vertical: vertical ?? null,
        targetId: targetId ?? null,
        detail,
      }
    }
    // `null`, `undefined`, and the empty object (no-payload variants)
    // all serialise as no-detail; everything else is JSON-encoded. The
    // registry guarantees the value matches its declared branch, so
    // `JSON.stringify` never throws on circular refs.
    const isEmptyObject =
      typeof resolved.detail === 'object' &&
      resolved.detail !== null &&
      Object.keys(resolved.detail as Record<string, unknown>).length === 0
    const detailJson =
      resolved.detail === null || resolved.detail === undefined || isEmptyObject
        ? null
        : JSON.stringify(resolved.detail)
    await this.handle.kysely
      .insertInto('audit_log')
      .values({
        user_id: resolved.userId,
        action: resolved.action,
        vertical: resolved.vertical,
        target_id: resolved.targetId,
        detail: detailJson,
        created_at: Date.now(),
      })
      .execute()
  }

  /** Apply the shared audit filter to a Kysely query. All clauses combine with
   *  AND; `from`/`to` are inclusive epoch-ms bounds. Used by list/count/export. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private auditWhere<QB extends { where: (...args: any[]) => QB }>(
    qb: QB,
    filter?: AuditFilter,
  ): QB {
    let q = qb
    if (filter?.action) q = q.where('action', '=', filter.action)
    if (filter?.userId) q = q.where('user_id', '=', filter.userId)
    if (filter?.targetId) q = q.where('target_id', '=', filter.targetId)
    if (filter?.vertical) {
      // Case-insensitive substring, matching how every other text filter in
      // this work behaves — `lower(vertical) LIKE '%needle%'`, with the needle
      // lowercased in JS rather than in SQL, exactly as `endUserWhere` does
      // (packages/shared's auth/end-users.ts). It lives HERE, in the shared
      // helper (not in `listAudit`), so list, count and export can never
      // disagree about which rows match: a filter added to `listAudit` alone
      // would page over a narrowed set while `meta.total` counted the whole
      // log and the export downloaded it.
      const needle = `%${filter.vertical.toLowerCase()}%`
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      q = q.where((eb: any) => eb(eb.fn('lower', ['vertical']), 'like', needle))
    }
    if (filter?.from !== undefined) q = q.where('created_at', '>=', filter.from)
    if (filter?.to !== undefined) q = q.where('created_at', '<=', filter.to)
    return q
  }

  /**
   * One page of audit rows.
   *
   * `sort` orders IN SQL, before the LIMIT/OFFSET slice — this is the only
   * table in the admin with true SQL pagination, and sorting the returned
   * page instead would reorder 50 rows out of 40,000 while the pagination
   * control kept claiming to speak for the whole log.
   *
   * `sort.key` is allow-listed through `isAuditSortKey`; anything else
   * (unknown, prototype-inherited, or the deprecated `'col dir'` string form)
   * falls back to the default order rather than throwing.
   */
  async listAudit(
    limit = 100,
    offset = 0,
    filter?: AuditFilter,
    sort?: { key: string; dir: 'asc' | 'desc' },
  ): Promise<AuditEntry[]> {
    // Defense-in-depth: `/api/audit` (the only caller) now validates page/limit
    // before computing `offset`, but a raw negative/non-finite `limit` or
    // `offset` must never reach Kysely regardless of caller. `LIMIT -1` reads
    // as UNLIMITED on SQLite — the exact 200-cap bypass reconnaissance found —
    // and a `NaN` throws `SqliteError: datatype mismatch`. Falls back to this
    // method's own declared defaults, not the route's, since a caller that
    // bypasses the route (a future admin-api endpoint, a test) has made no
    // promise about which default applies.
    // `Number.isInteger`, NOT `Number.isFinite`, matching the four other clamp
    // sites in this repo (`EndUserStore.list`, `SyncStore.list`,
    // `WebhookDeliveryStore.listForSubscription`, `ConnectSessionStore.list`).
    // `isFinite(2.5)` is `true`, and a fractional value reaches SQLite's
    // `OP_MustBeInt` and throws `SqliteError: datatype mismatch` — the exact
    // 500 those four clamps exist to close. The route above parses with
    // `parseInt`, which truncates, so nothing routes a fraction here TODAY;
    // this clamp's own comment says it exists for callers that do not exist
    // yet, which is precisely the case where the distinction bites.
    const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 100
    const safeOffset = Number.isInteger(offset) && offset >= 0 ? offset : 0
    const base = this.handle.kysely.selectFrom('audit_log').selectAll()
    let q = this.auditWhere(base, filter)

    const key = sort && isAuditSortKey(sort.key) ? sort.key : null
    if (key && key !== 'time') {
      const col = AUDIT_SORT_COLUMNS[key]
      const dir = sort!.dir === 'desc' ? 'desc' : 'asc'
      // Both dialects must answer the same request in the same order, and two
      // things make them differ. `lower()` closes the first: a bare `ORDER BY`
      // on TEXT collates by SQLite's BINARY comparison (byte value, so
      // `'Zebra' < 'apple'`) but Postgres's locale-aware default (`'apple' <
      // 'Zebra'`). `.nullsLast()` closes the second: SQLite puts NULLs first
      // on ASC and last on DESC, Postgres the reverse — pinned to LAST in both
      // directions, the same rule `table-controls.ts`'s in-memory sort already
      // applies ("Absent values sort last in BOTH directions — a missing date
      // is unknown, not earliest").
      //
      // Neither is applied blindly, because each costs an index. `lower()` on
      // a column whose values cannot vary in case buys nothing and makes an
      // index on it unusable for the sort (Part C shipped exactly that on
      // `webhook_deliveries.status`); `.nullsLast()` on a NOT NULL column is a
      // semantic no-op that can still push Postgres into a sort where an
      // index-ordered scan would have served. The line between them is what
      // the schema ENFORCES, not what the writers happen to do:
      //   user_id   NOT NULL, and only two writers exist — `randomUUID()`
      //             (lowercase hex) and the literal `system`. Neither
      //             modifier applies.
      //   action    NOT NULL, and the type system closes the vocabulary:
      //             `writeAudit` is generic over `AuditAction`, so a value
      //             outside the 70 lowercase literals in `audit-actions.ts`
      //             does not compile. Neither applies.
      //   vertical  nullable, AND caller-supplied despite the convention:
      //             `POST /api/internal/audit` validates it as
      //             `z.string().max(80).nullish()` and writes it straight
      //             through, so nothing enforces the nine lowercase slugs.
      //             Both apply. (Tightening that ingest to the vertical enum
      //             instead would 400 an audit write carrying a vertical this
      //             build does not know yet — dropping audit rows to enforce
      //             a sort order is the wrong trade.)
      //   target_id nullable AND caller-supplied free text of arbitrary case
      //             (a label, an external id) — both apply.
      // `audit_log` carries only `idx_audit_log_created_at`, so neither of the
      // two `lower()` columns has an index to lose today.
      if (col === 'target_id' || col === 'vertical') {
        q = q.orderBy(
          (eb) => eb.fn('lower', [col]),
          (ob) => (dir === 'desc' ? ob.desc() : ob.asc()).nullsLast(),
        )
      } else {
        q = q.orderBy(col, dir)
      }
      // The default ordering ALWAYS follows as the tiebreaker, never the sort
      // direction: Postgres gives no implicit row order on equal keys, so
      // OFFSET paging over a tie shows a row twice or not at all.
      q = q.orderBy('created_at', 'desc').orderBy('id', 'desc')
    } else if (key === 'time') {
      // The primary already IS `created_at`; emitting it twice would leave the
      // second copy (always `desc`) deciding nothing while looking like it
      // overrode the operator's choice. Named through the map rather than as a
      // literal so this branch cannot silently disagree with
      // `AUDIT_SORT_COLUMNS.time` — a literal here left that entry unused by
      // any code path, so a wrong value in it was invisible to every
      // behavioural test.
      q = q
        .orderBy(AUDIT_SORT_COLUMNS.time, sort!.dir === 'desc' ? 'desc' : 'asc')
        .orderBy('id', 'desc')
    } else {
      // No sort, or a key that is not in the allow-list: exactly the order
      // this method has always returned. An unknown key is ignored rather than
      // refused — it arrives from a stale bookmark, and the default order is a
      // better answer than an error.
      //
      // `id` (monotonic) breaks created_at ties so ordering is deterministic on
      // both backends — Postgres gives no implicit row order on equal keys.
      q = q.orderBy('created_at', 'desc').orderBy('id', 'desc')
    }

    return (await q.limit(safeLimit).offset(safeOffset).execute()) as AuditEntry[]
  }

  /** Total rows matching the filter — for pagination metadata. */
  async countAudit(filter?: AuditFilter): Promise<number> {
    const base = this.handle.kysely.selectFrom('audit_log').select((eb) => eb.fn.countAll().as('n'))
    const row = await this.auditWhere(base, filter).executeTakeFirstOrThrow()
    // COUNT is `int8`, which node-postgres returns as a STRING by default and
    // SQLite as a number (or a bigint for a very large count). `Number(...)`
    // normalises all three; without it the admin UI's pagination arithmetic
    // would silently become string concatenation on Postgres only.
    //
    // Not observable today, and deliberately kept anyway: `PostgresDbHandle`
    // installs a GLOBAL `types.setTypeParser(INT8, parseInt)` at open
    // (`@opensteward/shared`'s `db/postgres.ts`), so this count already
    // arrives as a number on both dialects and removing the cast leaves every
    // dual-dialect test green. The cast is what keeps that a performance
    // detail of the handle rather than a correctness dependency of every store
    // on it. This method is the one the other three name as the reference and
    // it carried no comment at all. Same cast, same caveat, as
    // `EndUserStore.countEndUsers`, `SyncStore.count` and
    // `WebhookDeliveryStore.countForSubscription`.
    return Number((row as { n: number | bigint | string }).n)
  }

  /** Return all matching rows newest-first (no pagination) for export.
   *  Loads the full result set into an array — fine for an export path. */
  async iterateAudit(filter?: AuditFilter): Promise<AuditEntry[]> {
    const base = this.handle.kysely.selectFrom('audit_log').selectAll()
    return (await this.auditWhere(base, filter)
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .execute()) as AuditEntry[]
  }

  /** Delete audit rows older than `cutoffMs`. Returns the row count removed. */
  async pruneAuditLogBefore(cutoffMs: number): Promise<number> {
    const res = await this.handle.kysely
      .deleteFrom('audit_log')
      .where('created_at', '<', cutoffMs)
      .executeTakeFirst()
    return Number(res.numDeletedRows)
  }

  // ── Notifications ──────────────────────────────────────────────────────────

  async createNotification(
    type: string,
    message: string,
    vertical?: string,
    connectionId?: string,
    platform?: string,
  ): Promise<void> {
    await this.handle.kysely
      .insertInto('notifications')
      .values({
        type,
        vertical: vertical ?? null,
        connection_id: connectionId ?? null,
        platform: platform ?? null,
        message,
        created_at: Date.now(),
      })
      .execute()
  }

  /** Insert a notification only if an UNACKNOWLEDGED one with the same
   *  (type, vertical, platform, connection_id) doesn't already exist. Used for
   *  signals that recur every poll (e.g. a platform's invalid client creds
   *  affecting many connections) so the operator gets one actionable row, not
   *  a duplicate every interval. */
  async createNotificationIfAbsent(
    type: string,
    message: string,
    vertical?: string,
    connectionId?: string,
    platform?: string,
  ): Promise<void> {
    // SQLite's `col IS ?` null-safe equality has no portable operator form, so
    // build each nullable clause conditionally: a null candidate matches NULL
    // rows (`IS NULL`), a value matches by `=`.
    const verticalVal = vertical ?? null
    const platformVal = platform ?? null
    const connectionVal = connectionId ?? null
    let q = this.handle.kysely
      .selectFrom('notifications')
      .select('id')
      .where('acknowledged', '=', 0)
      .where('type', '=', type)
    q =
      verticalVal == null ? q.where('vertical', 'is', null) : q.where('vertical', '=', verticalVal)
    q =
      platformVal == null ? q.where('platform', 'is', null) : q.where('platform', '=', platformVal)
    q =
      connectionVal == null
        ? q.where('connection_id', 'is', null)
        : q.where('connection_id', '=', connectionVal)
    const existing = await q.limit(1).executeTakeFirst()
    if (existing) return
    await this.createNotification(type, message, vertical, connectionId, platform)
  }

  async listUnacknowledged(limit = 50): Promise<NotificationRow[]> {
    return (await this.handle.kysely
      .selectFrom('notifications')
      .selectAll()
      .where('acknowledged', '=', 0)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .execute()) as NotificationRow[]
  }

  async acknowledgeNotification(id: number): Promise<boolean> {
    const res = await this.handle.kysely
      .updateTable('notifications')
      .set({ acknowledged: 1 })
      .where('id', '=', id)
      .executeTakeFirst()
    return Number(res.numUpdatedRows) > 0
  }

  async acknowledgeAll(): Promise<void> {
    await this.handle.kysely
      .updateTable('notifications')
      .set({ acknowledged: 1 })
      .where('acknowledged', '=', 0)
      .execute()
  }

  /** Unacknowledged rows, optionally excluding some types (the header bell
   *  leaves out `credential_expiring`, which auto-heals within a poll). */
  async countUnacknowledged(opts: { excludeTypes?: readonly string[] } = {}): Promise<number> {
    let q = this.handle.kysely
      .selectFrom('notifications')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('acknowledged', '=', 0)
    const exclude = opts.excludeTypes ?? []
    if (exclude.length > 0) q = q.where('type', 'not in', [...exclude])
    const row = await q.executeTakeFirst()
    return Number(row?.n ?? 0)
  }

  /**
   * Acknowledge every UNACKNOWLEDGED notification matching the given
   * (type, connection_id?, vertical?, platform?) — the inverse of
   * `createNotificationIfAbsent`'s identity. Used when a dashboard task is
   * cleared so the matching notification does not linger. Returns the number
   * of rows acknowledged.
   */
  async acknowledgeNotificationsMatching(match: {
    type: string
    connectionId?: string
    vertical?: string
    platform?: string
  }): Promise<number> {
    let q = this.handle.kysely
      .updateTable('notifications')
      .set({ acknowledged: 1 })
      .where('acknowledged', '=', 0)
      .where('type', '=', match.type)
    if (match.connectionId !== undefined) q = q.where('connection_id', '=', match.connectionId)
    if (match.vertical !== undefined) q = q.where('vertical', '=', match.vertical)
    if (match.platform !== undefined) q = q.where('platform', '=', match.platform)
    const res = await q.executeTakeFirst()
    return Number(res.numUpdatedRows)
  }

  // ── Dashboard task dismissals ──────────────────────────────────────────────
  // See `DashboardDismissal` for the storage shape and the fingerprint format.

  async listDashboardDismissals(): Promise<DashboardDismissal[]> {
    const rows = (await this.handle.kysely
      .selectFrom('settings')
      .select(['key', 'value'])
      .where('key', 'like', `${DASHBOARD_DISMISSAL_PREFIX}%`)
      .orderBy('key', 'asc')
      .execute()) as Array<{ key: string; value: string }>
    const out: DashboardDismissal[] = []
    for (const row of rows) {
      const parsed = parseDismissalValue(row.value)
      if (!parsed) continue
      out.push({ key: row.key.slice(DASHBOARD_DISMISSAL_PREFIX.length), ...parsed })
    }
    return out
  }

  /** Upsert one row per item: a repeat clear replaces the fingerprint, the
   *  author and the timestamp. */
  async dismissDashboardTasks(
    items: ReadonlyArray<{ key: string; fingerprint: string }>,
    userId: string,
  ): Promise<void> {
    const at = Date.now()
    for (const item of items) {
      const value = JSON.stringify({ fp: item.fingerprint, by: userId, at })
      await this.handle.kysely
        .insertInto('settings')
        .values({ key: `${DASHBOARD_DISMISSAL_PREFIX}${item.key}`, value })
        .onConflict((oc) => oc.column('key').doUpdateSet({ value }))
        .execute()
    }
  }

  /** Remove one dismissal so the task shows again. Returns whether a row existed. */
  async undismissDashboardTask(key: string): Promise<boolean> {
    const res = await this.handle.kysely
      .deleteFrom('settings')
      .where('key', '=', `${DASHBOARD_DISMISSAL_PREFIX}${key}`)
      .executeTakeFirst()
    return Number(res.numDeletedRows) > 0
  }

  /**
   * Delete dismissals cleared before `cutoffMs` (epoch ms) whose task is not
   * in `keep` — the keys whose condition the caller can still see. A row that
   * old for a condition that is gone (connection deleted, job superseded) is
   * only noise; one for a condition that is still live is an operator's
   * standing decision and must not expire under them. `wizard:*` skips are
   * never pruned. Returns the number of rows removed.
   */
  async pruneDashboardDismissals(
    cutoffMs: number,
    opts: { keep?: ReadonlySet<string> } = {},
  ): Promise<number> {
    const keep = opts.keep ?? new Set<string>()
    const rows = await this.listDashboardDismissals()
    const stale = rows
      .filter((r) => r.createdAt < cutoffMs && !r.key.startsWith('wizard:') && !keep.has(r.key))
      .map((r) => `${DASHBOARD_DISMISSAL_PREFIX}${r.key}`)
    if (stale.length === 0) return 0
    const res = await this.handle.kysely
      .deleteFrom('settings')
      .where('key', 'in', stale)
      .executeTakeFirst()
    return Number(res.numDeletedRows)
  }

  // ── Company info ──────────────────────────────────────────────────────────

  /**
   * Returns the single company-info record, or null when nothing has been
   * saved yet. Camelcased and merged with `updated_at` / `updated_by` audit
   * columns.
   */
  async getCompanyInfo(): Promise<CompanyInfoRecord | null> {
    const row = (await this.handle.kysely
      .selectFrom('company_info')
      .selectAll()
      .where('id', '=', 1)
      .executeTakeFirst()) as CompanyInfoRow | undefined
    return row ? rowToCompanyInfo(row) : null
  }

  /**
   * Upsert the single company-info record. `patch` may include any subset of
   * fields; existing values are preserved when keys are absent. Empty strings
   * are stored as NULL.
   */
  async upsertCompanyInfo(patch: Partial<CompanyInfo>, userId: string): Promise<CompanyInfoRecord> {
    const existing = await this.getCompanyInfo()
    const merged: Record<string, string | number | null> = {
      name: pickStringOrKeep(patch, 'name', existing?.name ?? null),
      legal_name: pickStringOrKeep(patch, 'legalName', existing?.legalName ?? null),
      description: pickStringOrKeep(patch, 'description', existing?.description ?? null),
      website: pickStringOrKeep(patch, 'website', existing?.website ?? null),
      logo_data_url: pickStringOrKeep(patch, 'logoDataUrl', existing?.logoDataUrl ?? null),
      primary_color: pickStringOrKeep(patch, 'primaryColor', existing?.primaryColor ?? null),
      secondary_color: pickStringOrKeep(patch, 'secondaryColor', existing?.secondaryColor ?? null),
      font_family: pickStringOrKeep(patch, 'fontFamily', existing?.fontFamily ?? null),
      font_data_url: pickStringOrKeep(patch, 'fontDataUrl', existing?.fontDataUrl ?? null),
      font_url: pickStringOrKeep(patch, 'fontUrl', existing?.fontUrl ?? null),
      favicon_data_url: pickStringOrKeep(patch, 'faviconDataUrl', existing?.faviconDataUrl ?? null),
      hide_attribution: pickBoolOrKeep(patch, 'hideAttribution', existing?.hideAttribution ?? null),
      support_email: pickStringOrKeep(patch, 'supportEmail', existing?.supportEmail ?? null),
      privacy_policy_url: pickStringOrKeep(
        patch,
        'privacyPolicyUrl',
        existing?.privacyPolicyUrl ?? null,
      ),
      terms_of_service_url: pickStringOrKeep(
        patch,
        'termsOfServiceUrl',
        existing?.termsOfServiceUrl ?? null,
      ),
      address_line1: pickStringOrKeep(patch, 'addressLine1', existing?.addressLine1 ?? null),
      address_line2: pickStringOrKeep(patch, 'addressLine2', existing?.addressLine2 ?? null),
      city: pickStringOrKeep(patch, 'city', existing?.city ?? null),
      region: pickStringOrKeep(patch, 'region', existing?.region ?? null),
      postal_code: pickStringOrKeep(patch, 'postalCode', existing?.postalCode ?? null),
      country: pickStringOrKeep(patch, 'country', existing?.country ?? null),
      base_url: pickStringOrKeep(patch, 'baseUrl', existing?.baseUrl ?? null),
    }
    const now = Date.now()
    const values = { id: 1, ...merged, updated_at: now, updated_by: userId }

    await this.handle.kysely
      .insertInto('company_info')
      .values(values)
      .onConflict((oc) =>
        oc.column('id').doUpdateSet({
          name: merged.name,
          legal_name: merged.legal_name,
          description: merged.description,
          website: merged.website,
          logo_data_url: merged.logo_data_url,
          primary_color: merged.primary_color,
          secondary_color: merged.secondary_color,
          font_family: merged.font_family,
          font_data_url: merged.font_data_url,
          font_url: merged.font_url,
          favicon_data_url: merged.favicon_data_url,
          hide_attribution: merged.hide_attribution,
          support_email: merged.support_email,
          privacy_policy_url: merged.privacy_policy_url,
          terms_of_service_url: merged.terms_of_service_url,
          address_line1: merged.address_line1,
          address_line2: merged.address_line2,
          city: merged.city,
          region: merged.region,
          postal_code: merged.postal_code,
          country: merged.country,
          base_url: merged.base_url,
          updated_at: now,
          updated_by: userId,
        }),
      )
      .execute()

    return (await this.getCompanyInfo())!
  }

  /**
   * Delete the single company-info record, returning the deployment to the
   * state it ships in: `getCompanyInfo()` answers null again, so every
   * consumer falls back to its OpenSteward default. Returns whether a record
   * existed.
   */
  async deleteCompanyInfo(): Promise<boolean> {
    const res = await this.handle.kysely
      .deleteFrom('company_info')
      .where('id', '=', 1)
      .executeTakeFirst()
    return Number(res.numDeletedRows) > 0
  }

  // ── Scope groups ──────────────────────────────────────────────────────────

  async listScopeGroups(filter?: { vertical?: string; platform?: string }): Promise<ScopeGroup[]> {
    let q = this.handle.kysely.selectFrom('scope_groups').selectAll()
    if (filter?.vertical) q = q.where('vertical', '=', filter.vertical)
    if (filter?.platform) q = q.where('platform', '=', filter.platform)
    const rows = (await q
      .orderBy('vertical')
      .orderBy('platform')
      .orderBy('name')
      .execute()) as ScopeGroupRow[]
    return rows.map(rowToScopeGroup)
  }

  async getScopeGroup(id: number): Promise<ScopeGroup | null> {
    const row = (await this.handle.kysely
      .selectFrom('scope_groups')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()) as ScopeGroupRow | undefined
    return row ? rowToScopeGroup(row) : null
  }

  async createScopeGroup(input: {
    vertical: string
    platform: string
    name: string
    scopes: string[]
  }): Promise<ScopeGroup> {
    const now = Date.now()
    const row = await this.handle.kysely
      .insertInto('scope_groups')
      .values({
        vertical: input.vertical,
        platform: input.platform,
        name: input.name,
        scopes: JSON.stringify(input.scopes),
        created_at: now,
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    return (await this.getScopeGroup(Number(row.id)))!
  }

  async updateScopeGroup(
    id: number,
    patch: { name?: string; scopes?: string[] },
  ): Promise<ScopeGroup | null> {
    const existing = await this.getScopeGroup(id)
    if (!existing) return null
    const name = patch.name ?? existing.name
    const scopes = patch.scopes ?? existing.scopes
    await this.handle.kysely
      .updateTable('scope_groups')
      .set({ name, scopes: JSON.stringify(scopes) })
      .where('id', '=', id)
      .execute()
    return this.getScopeGroup(id)
  }

  async deleteScopeGroup(id: number): Promise<boolean> {
    const res = await this.handle.kysely
      .deleteFrom('scope_groups')
      .where('id', '=', id)
      .executeTakeFirst()
    return Number(res.numDeletedRows) > 0
  }

  // ── Connect-link templates ────────────────────────────────────────────────

  async listConnectLinkTemplates(filter?: { tenantId?: string }): Promise<ConnectLinkTemplate[]> {
    let q = this.handle.kysely.selectFrom('connect_link_templates').selectAll()
    if (filter?.tenantId) q = q.where('tenant_id', '=', filter.tenantId)
    const rows = (await q
      .orderBy('tenant_id')
      .orderBy('name')
      .execute()) as ConnectLinkTemplateRow[]
    return rows.map(rowToConnectLinkTemplate)
  }

  async getConnectLinkTemplate(id: number): Promise<ConnectLinkTemplate | null> {
    const row = (await this.handle.kysely
      .selectFrom('connect_link_templates')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()) as ConnectLinkTemplateRow | undefined
    return row ? rowToConnectLinkTemplate(row) : null
  }

  async createConnectLinkTemplate(input: {
    tenantId: string
    name: string
    description?: string | null
    linkMode: ConnectLinkTemplateMode
    allowedVerticals?: string[]
    allowedPlatforms?: ConnectLinkTemplateAllowedPlatform[]
    scopeGroupId?: number | null
    expiryDays?: number
    oneTimeOnly?: boolean
    redirectUrl?: string | null
    createdBy?: string | null
  }): Promise<ConnectLinkTemplate> {
    const row = await this.handle.kysely
      .insertInto('connect_link_templates')
      .values({
        tenant_id: input.tenantId,
        name: input.name,
        description: input.description ?? null,
        link_mode: input.linkMode,
        allowed_verticals: JSON.stringify(input.allowedVerticals ?? []),
        allowed_platforms: JSON.stringify(input.allowedPlatforms ?? []),
        scope_group_id: input.scopeGroupId ?? null,
        expiry_days: Math.max(1, Math.min(90, input.expiryDays ?? 7)),
        one_time_only: input.oneTimeOnly ? 1 : 0,
        redirect_url: input.redirectUrl ?? null,
        created_at: Date.now(),
        created_by: input.createdBy ?? null,
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    return (await this.getConnectLinkTemplate(Number(row.id)))!
  }

  async updateConnectLinkTemplate(
    id: number,
    patch: Partial<{
      name: string
      description: string | null
      linkMode: ConnectLinkTemplateMode
      allowedVerticals: string[]
      allowedPlatforms: ConnectLinkTemplateAllowedPlatform[]
      scopeGroupId: number | null
      expiryDays: number
      oneTimeOnly: boolean
      redirectUrl: string | null
    }>,
  ): Promise<ConnectLinkTemplate | null> {
    const existing = await this.getConnectLinkTemplate(id)
    if (!existing) return null
    const merged = { ...existing, ...patch }
    await this.handle.kysely
      .updateTable('connect_link_templates')
      .set({
        name: merged.name,
        description: merged.description,
        link_mode: merged.linkMode,
        allowed_verticals: JSON.stringify(merged.allowedVerticals),
        allowed_platforms: JSON.stringify(merged.allowedPlatforms),
        scope_group_id: merged.scopeGroupId,
        expiry_days: Math.max(1, Math.min(90, merged.expiryDays)),
        one_time_only: merged.oneTimeOnly ? 1 : 0,
        redirect_url: merged.redirectUrl,
      })
      .where('id', '=', id)
      .execute()
    return this.getConnectLinkTemplate(id)
  }

  async deleteConnectLinkTemplate(id: number): Promise<boolean> {
    const res = await this.handle.kysely
      .deleteFrom('connect_link_templates')
      .where('id', '=', id)
      .executeTakeFirst()
    return Number(res.numDeletedRows) > 0
  }

  // ── Tenants & custom domains ────────────────────────────────────────────────

  async listTenants(): Promise<Tenant[]> {
    const rows = (await this.handle.kysely
      .selectFrom('tenants')
      .selectAll()
      .orderBy('id')
      .execute()) as TenantRow[]
    return rows.map(rowToTenant)
  }

  async getTenant(id: string): Promise<Tenant | null> {
    const row = (await this.handle.kysely
      .selectFrom('tenants')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()) as TenantRow | undefined
    return row ? rowToTenant(row) : null
  }

  /** Create a tenant. `id` must already be a normalised slug (validated at the
   *  route). Throws if the id is taken. */
  async createTenant(id: string, name: string): Promise<Tenant> {
    const now = Date.now()
    await this.handle.kysely
      .insertInto('tenants')
      .values({ id, name, created_at: now, updated_at: now })
      .execute()
    return (await this.getTenant(id))!
  }

  async updateTenant(id: string, name: string): Promise<Tenant | null> {
    const existing = await this.getTenant(id)
    if (!existing) return null
    await this.handle.kysely
      .updateTable('tenants')
      .set({ name, updated_at: Date.now() })
      .where('id', '=', id)
      .execute()
    return this.getTenant(id)
  }

  /** Delete a tenant. Refuses to remove the `default` catch-all or a tenant
   *  that still has domains attached (the caller should detach them first). */
  async deleteTenant(
    id: string,
  ): Promise<{ ok: boolean; reason?: 'default' | 'has_domains' | 'not_found' }> {
    if (id === 'default') return { ok: false, reason: 'default' }
    if (!(await this.getTenant(id))) return { ok: false, reason: 'not_found' }
    if ((await this.listDomainsForTenant(id)).length > 0)
      return { ok: false, reason: 'has_domains' }
    await this.handle.kysely.deleteFrom('tenants').where('id', '=', id).execute()
    return { ok: true }
  }

  async listDomains(): Promise<TenantDomain[]> {
    const rows = (await this.handle.kysely
      .selectFrom('tenant_domains')
      .selectAll()
      .orderBy('domain')
      .execute()) as TenantDomainRow[]
    return rows.map(rowToTenantDomain)
  }

  async listDomainsForTenant(tenantId: string): Promise<TenantDomain[]> {
    const rows = (await this.handle.kysely
      .selectFrom('tenant_domains')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .orderBy('created_at')
      .execute()) as TenantDomainRow[]
    return rows.map(rowToTenantDomain)
  }

  /** Attach a domain to a tenant. Lowercases the hostname. Throws if the tenant
   *  doesn't exist (app-level FK — `PRAGMA foreign_keys` is off here) or the
   *  domain is already mapped (PK conflict). */
  async addDomain(domain: string, tenantId: string): Promise<TenantDomain> {
    const normalised = domain.trim().toLowerCase()
    if (!(await this.getTenant(tenantId))) {
      throw new Error(`Unknown tenant: ${tenantId}`)
    }
    await this.handle.kysely
      .insertInto('tenant_domains')
      .values({ domain: normalised, tenant_id: tenantId, created_at: Date.now() })
      .execute()
    const row = (await this.handle.kysely
      .selectFrom('tenant_domains')
      .selectAll()
      .where('domain', '=', normalised)
      .executeTakeFirstOrThrow()) as TenantDomainRow
    return rowToTenantDomain(row)
  }

  async removeDomain(domain: string): Promise<boolean> {
    const res = await this.handle.kysely
      .deleteFrom('tenant_domains')
      .where('domain', '=', domain.trim().toLowerCase())
      .executeTakeFirst()
    return Number(res.numDeletedRows) > 0
  }

  /** Flat domain→tenant projection for the public resolver endpoint. */
  async listDomainMap(): Promise<Array<{ domain: string; tenantId: string }>> {
    return (await this.listDomains()).map((d) => ({ domain: d.domain, tenantId: d.tenantId }))
  }

  async close(): Promise<void> {
    await this.handle.close()
  }
}

// ── Role / scope helpers ────────────────────────────────────────────────────

interface RoleDbRow {
  id: string
  name: string
  description: string | null
  base_role: string
  permissions_json: string
  is_builtin: number
  created_at: number
  updated_at: number
  updated_by: string | null
}

function rowToRole(row: RoleDbRow): RoleRecord {
  const isBuiltin = Number(row.is_builtin) === 1
  const baseRole: BuiltinRole = isBuiltinRole(row.base_role) ? row.base_role : 'viewer'
  let stored: unknown = []
  try {
    stored = JSON.parse(row.permissions_json)
  } catch {
    stored = []
  }
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    baseRole,
    // A built-in's set comes from code, so an upgrade that adds a permission
    // reaches every admin without a data migration.
    permissions:
      isBuiltin && isBuiltinRole(row.id)
        ? [...BUILTIN_ROLE_PERMISSIONS[row.id]]
        : normalizePermissions(stored),
    isBuiltin,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  }
}

/** Collapse `(tenant, vertical)` rows into one grant per tenant. */
export function rowsToGrants(rows: ReadonlyArray<{ tenant_id: string; vertical: string }>): ScopeGrant[] {
  const byTenant = new Map<string, '*' | Set<string>>()
  for (const r of rows) {
    const current = byTenant.get(r.tenant_id)
    if (r.vertical === '*' || current === '*') {
      byTenant.set(r.tenant_id, '*')
    } else {
      const set = current ?? new Set<string>()
      set.add(r.vertical)
      byTenant.set(r.tenant_id, set)
    }
  }
  return [...byTenant.entries()].map(([tenantId, v]) => ({
    tenantId,
    verticals: v === '*' ? '*' : [...v].sort(),
  }))
}

/** Expand grants into de-duplicated `(tenant, vertical)` rows. */
export function grantsToRows(grants: readonly ScopeGrant[]): Array<{ tenant_id: string; vertical: string }> {
  const merged = rowsToGrants(
    grants.flatMap((g) =>
      g.verticals === '*' || g.verticals.length === 0
        ? [{ tenant_id: g.tenantId, vertical: '*' }]
        : g.verticals.map((v) => ({ tenant_id: g.tenantId, vertical: v })),
    ),
  )
  return merged.flatMap((g) =>
    g.verticals === '*'
      ? [{ tenant_id: g.tenantId, vertical: '*' }]
      : g.verticals.map((v) => ({ tenant_id: g.tenantId, vertical: v })),
  )
}

// ── Company-info helpers ────────────────────────────────────────────────────

/** Parse a `dashboard.dismissed:*` settings value; null when it is not the
 *  expected `{fp, by, at}` JSON (a hand-edited row is skipped, not fatal). */
function parseDismissalValue(
  raw: string,
): { fingerprint: string; by: string; createdAt: number } | null {
  try {
    const v = JSON.parse(raw) as { fp?: unknown; by?: unknown; at?: unknown }
    if (typeof v?.fp !== 'string' || typeof v.by !== 'string' || typeof v.at !== 'number') {
      return null
    }
    return { fingerprint: v.fp, by: v.by, createdAt: v.at }
  } catch {
    return null
  }
}

interface CompanyInfoRow {
  id: number
  name: string | null
  legal_name: string | null
  description: string | null
  website: string | null
  logo_data_url: string | null
  primary_color: string | null
  secondary_color: string | null
  font_family: string | null
  font_data_url: string | null
  font_url: string | null
  favicon_data_url: string | null
  hide_attribution: number | null
  support_email: string | null
  privacy_policy_url: string | null
  terms_of_service_url: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  region: string | null
  postal_code: string | null
  country: string | null
  base_url: string | null
  updated_at: number
  updated_by: string
}

function rowToCompanyInfo(row: CompanyInfoRow): CompanyInfoRecord {
  return {
    name: row.name,
    legalName: row.legal_name,
    description: row.description,
    website: row.website,
    logoDataUrl: row.logo_data_url,
    primaryColor: row.primary_color,
    secondaryColor: row.secondary_color,
    fontFamily: row.font_family,
    fontDataUrl: row.font_data_url,
    fontUrl: row.font_url,
    faviconDataUrl: row.favicon_data_url,
    hideAttribution: row.hide_attribution === null ? null : row.hide_attribution === 1,
    supportEmail: row.support_email,
    privacyPolicyUrl: row.privacy_policy_url,
    termsOfServiceUrl: row.terms_of_service_url,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    city: row.city,
    region: row.region,
    postalCode: row.postal_code,
    country: row.country,
    baseUrl: row.base_url,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  }
}

// ── Scope-group helpers ─────────────────────────────────────────────────────

interface ScopeGroupRow {
  id: number
  vertical: string
  platform: string
  name: string
  scopes: string
  created_at: number
}

function rowToScopeGroup(row: ScopeGroupRow): ScopeGroup {
  let parsed: string[]
  try {
    const raw = JSON.parse(row.scopes)
    parsed = Array.isArray(raw) ? raw.map(String) : []
  } catch {
    parsed = []
  }
  return {
    id: row.id,
    vertical: row.vertical,
    platform: row.platform,
    name: row.name,
    scopes: parsed,
    createdAt: row.created_at,
  }
}

// ── Connect-link template helpers ───────────────────────────────────────────

interface ConnectLinkTemplateRow {
  id: number
  tenant_id: string
  name: string
  description: string | null
  link_mode: string
  allowed_verticals: string
  allowed_platforms: string
  scope_group_id: number | null
  expiry_days: number
  one_time_only: number
  redirect_url: string | null
  created_at: number
  created_by: string | null
}

function rowToConnectLinkTemplate(row: ConnectLinkTemplateRow): ConnectLinkTemplate {
  let verticals: string[]
  let platforms: ConnectLinkTemplateAllowedPlatform[]
  try {
    const raw = JSON.parse(row.allowed_verticals)
    verticals = Array.isArray(raw) ? raw.map(String) : []
  } catch {
    verticals = []
  }
  try {
    const raw = JSON.parse(row.allowed_platforms)
    platforms = Array.isArray(raw)
      ? raw.filter(
          (p): p is { vertical: string; slug: string } =>
            !!p &&
            typeof (p as { vertical?: unknown }).vertical === 'string' &&
            typeof (p as { slug?: unknown }).slug === 'string',
        )
      : []
  } catch {
    platforms = []
  }
  const mode: ConnectLinkTemplateMode =
    row.link_mode === 'customer-picks-adapter' || row.link_mode === 'self-register'
      ? row.link_mode
      : 'pinned'
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description,
    linkMode: mode,
    allowedVerticals: verticals,
    allowedPlatforms: platforms,
    scopeGroupId: row.scope_group_id,
    expiryDays: row.expiry_days,
    oneTimeOnly: row.one_time_only === 1,
    redirectUrl: row.redirect_url,
    createdAt: row.created_at,
    createdBy: row.created_by,
  }
}

// ── Tenant helpers ──────────────────────────────────────────────────────────

interface TenantRow {
  id: string
  name: string
  created_at: number
  updated_at: number
}

function rowToTenant(row: TenantRow): Tenant {
  return { id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at }
}

interface TenantDomainRow {
  domain: string
  tenant_id: string
  created_at: number
}

function rowToTenantDomain(row: TenantDomainRow): TenantDomain {
  return { domain: row.domain, tenantId: row.tenant_id, createdAt: row.created_at }
}

/**
 * Pull a field from a partial patch:
 *  - undefined → keep `existing`
 *  - empty string → store NULL (lets the form clear a field)
 *  - non-empty string → store as-is
 *  - explicit null → store NULL
 */
function pickStringOrKeep(
  patch: Partial<CompanyInfo>,
  key: keyof CompanyInfo,
  existing: string | null,
): string | null {
  if (!(key in patch)) return existing
  const value = patch[key]
  if (value === null || value === undefined) return null
  if (typeof value === 'string' && value.length === 0) return null
  return String(value)
}

/** Boolean variant of {@link pickStringOrKeep}, stored as 0/1.
 *  - key absent from patch → keep existing
 *  - explicit null/undefined → store NULL (unset)
 *  - truthy/falsy → 1 / 0 */
function pickBoolOrKeep(
  patch: Partial<CompanyInfo>,
  key: keyof CompanyInfo,
  existing: boolean | null,
): number | null {
  if (!(key in patch)) return existing === null ? null : existing ? 1 : 0
  const value = patch[key]
  if (value === null || value === undefined) return null
  return value ? 1 : 0
}
